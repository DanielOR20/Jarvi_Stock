// Enlaces para que los clientes lleguen al agente de atención de un negocio
// a través del número compartido: wa.me/<número>?text=<código>.
import { env } from '../config/env.js';

export function buildAgentWaLink(code) {
  if (!env.whatsapp.displayPhone || !code) return null;
  return `https://wa.me/${env.whatsapp.displayPhone}?text=${encodeURIComponent(code)}`;
}

// URL pública de la imagen QR. Sin PUBLIC_BASE_URL no hay QR (Meta no puede
// descargar una imagen de localhost).
export function buildAgentQrUrl(code) {
  if (!env.publicBaseUrl || !buildAgentWaLink(code)) return null;
  return `${env.publicBaseUrl}/api/public/qr/${encodeURIComponent(code)}.png`;
}
