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
