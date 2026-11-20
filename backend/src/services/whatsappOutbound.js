import crypto from 'node:crypto';
import { env, isWhatsappConfigured } from '../config/env.js';
import { normalizePhone } from '../config/db.js';

export function buildWaMeFallback(toPhone, text = '') {
  const digits = normalizePhone(toPhone);
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

async function dispatchGraphMessage(payload, toPhone, previewText) {
  const digits = normalizePhone(toPhone);
  const fallbackWaMeUrl = buildWaMeFallback(digits, previewText);

  if (!isWhatsappConfigured()) {
    const simId = `wamid.sim.${crypto.randomBytes(6).toString('hex')}`;
    console.log(
      `[whatsappOutbound][SIMULATION] to=${digits} type=${payload.type} preview="${String(
        previewText || ''
      ).slice(0, 90)}"`
    );
    return {
      sentViaApi: false,
      simulated: true,
      waMessageId: simId,
      fallbackWaMeUrl,
    };
  }

  const endpoint = `https://graph.facebook.com/${env.whatsapp.graphApiVersion}/${env.whatsapp.phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[whatsappOutbound][ERROR]', response.status, data);
    return {
      sentViaApi: false,
      simulated: false,
      error: data?.error?.message || `Meta API HTTP ${response.status}`,
      waMessageId: null,
      fallbackWaMeUrl,
    };
  }

  return {
    sentViaApi: true,
    simulated: false,
    waMessageId: data?.messages?.[0]?.id || null,
    fallbackWaMeUrl,
  };
}

export async function sendTextMessage({ toPhone, body }) {
  const digits = normalizePhone(toPhone);
  return dispatchGraphMessage(
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'text',
      text: {
        preview_url: false,
        body: String(body || ''),
      },
    },
    digits,
    body
  );
}

// Límites de Meta para mensajes interactivos de tipo "button".
const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE = 20;
const MAX_BUTTON_ID = 256;
const MAX_BODY = 1024;
const MAX_HEADER_FOOTER = 60;

function clip(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Mensaje interactivo con botones de respuesta rápida (máx. 3).
 * `buttons`: [{ id, title }]. El id vuelve en el webhook como
 * `interactive.button_reply.id` cuando la persona pulsa el botón.
 *
 * Ventana de 24 h: Meta solo entrega texto libre o interactivos si el
 * destinatario escribió en las últimas 24 horas; fuera de ella exige una
 * plantilla aprobada (todavía no hay). En ese caso el envío falla y el
 * resultado trae `sentViaApi: false` y `error`: quien llama decide qué hacer.
 */
export async function sendInteractiveButtons({ toPhone, body, buttons, header = '', footer = '' }) {
  const list = Array.isArray(buttons) ? buttons : [];
  if (list.length === 0 || list.length > MAX_BUTTONS) {
    throw new Error(`sendInteractiveButtons: se requieren entre 1 y ${MAX_BUTTONS} botones.`);
  }
  const ids = new Set();
  const replyButtons = list.map((b) => {
    const id = String(b?.id || '');
    if (!id || id.length > MAX_BUTTON_ID || ids.has(id)) {
      throw new Error('sendInteractiveButtons: cada botón necesita un id único de hasta 256 caracteres.');
    }
    ids.add(id);
    return { type: 'reply', reply: { id, title: clip(b.title, MAX_BUTTON_TITLE) } };
  });

  const digits = normalizePhone(toPhone);
  const bodyText = clip(body, MAX_BODY);
  const interactive = {
    type: 'button',
    body: { text: bodyText },
    action: { buttons: replyButtons },
  };
  if (header) interactive.header = { type: 'text', text: clip(header, MAX_HEADER_FOOTER) };
  if (footer) interactive.footer = { text: clip(footer, MAX_HEADER_FOOTER) };

  return dispatchGraphMessage(
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'interactive',
      interactive,
    },
    digits,
    `${bodyText} [${replyButtons.map((b) => `${b.reply.title}=${b.reply.id}`).join(' | ')}]`
  );
}

export async function sendMediaMessage({ toPhone, mediaUrl, caption = '' }) {
  const digits = normalizePhone(toPhone);
  return dispatchGraphMessage(
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'image',
      image: {
        link: mediaUrl,
        caption,
      },
    },
    digits,
    caption || mediaUrl
  );
}
