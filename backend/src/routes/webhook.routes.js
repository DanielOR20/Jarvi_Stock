import crypto from 'node:crypto';
import express from 'express';
import { env, isAppSecretConfigured, isWhatsappConfigured } from '../config/env.js';
import {
  getOrCreateConversation,
  insertInboundMessage,
  findTenantByPhoneNumberId,
  normalizePhone,
} from '../config/db.js';
import { processMessage } from '../services/agentRouter.js';
import { resolveRoute } from '../services/messageRouter.js';
import { handleDecisionButton } from '../services/pendingActions.js';
import {
  sendInteractiveButtons,
  sendMediaMessage,
  sendTextMessage,
} from '../services/whatsappOutbound.js';

const router = express.Router();

function verifyMetaSignature(req) {
  const header = req.headers['x-hub-signature-256'];
  if (!isAppSecretConfigured() && !header) {
    return true;
  }
  if (!header || !req.rawBody) {
    return false;
  }
  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', env.whatsapp.appSecret)
      .update(req.rawBody)
      .digest('hex');

  const sigBuf = Buffer.from(String(header));
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

async function resolveMetaMediaUrl(mediaId) {
  if (!mediaId || !isWhatsappConfigured()) return null;
  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${env.whatsapp.graphApiVersion}/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
      }
    );
    if (!metaRes.ok) return null;
    const metaJson = await metaRes.json();
    return metaJson?.url || null;
  } catch {
    return null;
  }
}

async function processWebhookPayloadAsync(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id || null;
      // Un número propio de un negocio va directo a ese negocio. El número
      // compartido (WHATSAPP_PHONE_NUMBER_ID) pasa por el enrutador.
      const numberTenant = await findTenantByPhoneNumberId(phoneNumberId);
      const dedicatedTenant =
        numberTenant && String(phoneNumberId) !== env.whatsapp.phoneNumberId
          ? numberTenant
          : null;
      const messages = Array.isArray(value?.messages) ? value.messages : [];

      for (const msg of messages) {
        const waMessageId = msg?.id;
        const fromPhone = normalizePhone(msg?.from);
        if (!fromPhone) continue;

        let text = '';
        let mediaUrl = null;
        const messageType = msg?.type || 'text';

        if (messageType === 'text') {
          text = msg?.text?.body || '';
        } else if (messageType === 'image') {
          text = msg?.image?.caption || '';
          mediaUrl = await resolveMetaMediaUrl(msg?.image?.id);
        } else if (messageType === 'document') {
          text = msg?.document?.caption || msg?.document?.filename || '';
          mediaUrl = await resolveMetaMediaUrl(msg?.document?.id);
        } else if (messageType === 'interactive') {
          text =
            msg?.interactive?.button_reply?.title ||
            msg?.interactive?.list_reply?.title ||
            '';
          // Botón Aprobar/Rechazar de una pending action: se atiende ANTES del
          // enrutador normal. El negocio sale de la acción, no del mensaje.
          const decision = await handleDecisionButton({
            fromPhone,
            buttonId: msg?.interactive?.button_reply?.id,
            waMessageId,
            buttonTitle: text,
            rawPayload: msg,
          });
          if (decision) {
            if (decision.duplicate) {
              console.log(`[webhook] Duplicado descartado wa_message_id=${waMessageId}`);
            }
            for (const body of decision.replies) {
              await sendTextMessage({ toPhone: fromPhone, body });
            }
            continue;
          }
        }

        const route = dedicatedTenant
          ? null
          : await resolveRoute({ fromPhone, text });
        const storeTenantId = route ? route.tenantId : dedicatedTenant.id;
        const storeMode =
          route && ['owner', 'client', 'onboarding'].includes(route.mode)
            ? route.mode
            : 'client';
        const conv = await getOrCreateConversation(storeTenantId, fromPhone, storeMode);
        const { inserted } = await insertInboundMessage(storeTenantId, {
          conversation_id: conv.id,
          wa_message_id: waMessageId,
          sender_phone: fromPhone,
          message_type: messageType,
          body_text: text,
          media_url: mediaUrl,
          raw_payload: msg,
        });

        if (!inserted) {
          console.log(`[webhook] Duplicado descartado wa_message_id=${waMessageId}`);
          continue;
        }

        const result = await processMessage({
          tenantId: dedicatedTenant ? dedicatedTenant.id : null,
          route,
          fromPhone,
          messageId: waMessageId,
          text,
          mediaUrl,
          timestamp: msg?.timestamp
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
        });

        let sentMedia = false;
        if (result?.replyMediaUrl) {
          const media = await sendMediaMessage({
            toPhone: fromPhone,
            mediaUrl: result.replyMediaUrl,
            caption: result.replyText || '',
          });
          sentMedia = media.sentViaApi || media.simulated;
        }
        // Respuesta con botones (acción que el propio dueño acaba de pedir).
        let sentButtons = false;
        if (!sentMedia && result?.replyText && result?.replyButtons?.length) {
          const interactive = await sendInteractiveButtons({
            toPhone: fromPhone,
            body: result.replyText,
            buttons: result.replyButtons,
          });
          sentButtons = interactive.sentViaApi || interactive.simulated;
        }
        // Si la imagen o los botones fallan, al menos llega el texto.
        if (!sentMedia && !sentButtons && result?.replyText) {
          await sendTextMessage({
            toPhone: fromPhone,
            body: result.replyText,
          });
        }
      }
    }
  }
}

// GET /api/webhook/whatsapp - Verificacion oficial de Meta Cloud API
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.whatsapp.verifyToken) {
    return res.status(200).type('text/plain').send(String(challenge || ''));
  }

  return res.status(403).json({
    error: {
      code: 'WEBHOOK_VERIFICATION_FAILED',
      message: 'hub.verify_token invalido o modo incorrecto.',
    },
  });
});

// POST /api/webhook/whatsapp - Recepcion de mensajes con respuesta 200 inmediata y deduplicacion
router.post('/whatsapp', (req, res) => {
  if (!verifyMetaSignature(req)) {
    return res.status(401).json({
      error: {
        code: 'INVALID_SIGNATURE',
        message: 'Firma X-Hub-Signature-256 invalida.',
      },
    });
  }

  // Responder 200 OK de inmediato para evitar reintentos de Meta
  res.status(200).json({ received: true });

  setImmediate(() => {
    processWebhookPayloadAsync(req.body).catch((err) => {
      console.error('[webhook] Error procesando evento:', err);
    });
  });
});

export default router;
