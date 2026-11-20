import 'dotenv/config';

const PLACEHOLDER_TOKENS = new Set([
  '',
  'reemplazar_con_token_permanente_meta',
  'EAAG...reemplazar_con_token_permanente_meta',
  'reemplazar_con_app_secret_meta',
]);

function isRealValue(value) {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  if (PLACEHOLDER_TOKENS.has(trimmed)) return false;
  if (trimmed.toLowerCase().includes('reemplazar_con')) return false;
  return true;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databaseUrl: (process.env.DATABASE_URL || '').trim(),
  jwtSecret: process.env.JWT_SECRET || 'jarvi-stock-dev-jwt-secret',
  internalEngineKey: process.env.INTERNAL_ENGINE_KEY || 'jarvi-stock-dev-engine-key',
  mediaPublicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL || 'http://localhost:4000/uploads',
  pendingActionTtlHours: Number(process.env.PENDING_ACTION_TTL_HOURS || 24),
  llm: {
    provider: process.env.LLM_PROVIDER || 'gemini',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gemini-2.5-flash',
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'jarvi_stock_verify_token_local',
    accessToken: (process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
    phoneNumberId: (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    appSecret: (process.env.WHATSAPP_APP_SECRET || '').trim(),
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0',
    wabaId: (process.env.WHATSAPP_WABA_ID || '').trim(),
    dryRun: String(process.env.WHATSAPP_DRY_RUN || 'false').toLowerCase() === 'true',
    // Número visible del número compartido (solo dígitos, con código de país),
    // usado para armar los enlaces wa.me de cada agente.
    displayPhone: (process.env.WHATSAPP_DISPLAY_PHONE || '').replace(/\D/g, ''),
    // Solo para pruebas locales sin App Secret. Nunca tiene efecto en producción.
    allowUnsigned:
      String(process.env.WEBHOOK_ALLOW_UNSIGNED || 'false').toLowerCase() === 'true',
  },
  // URL pública del servicio (Render). Meta descarga desde aquí las imágenes QR.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, ''),
};

export function isWhatsappConfigured() {
  return (
    !env.whatsapp.dryRun &&
    isRealValue(env.whatsapp.accessToken) &&
    isRealValue(env.whatsapp.phoneNumberId)
  );
}

export function isAppSecretConfigured() {
  return isRealValue(env.whatsapp.appSecret);
}

// Aceptar webhooks sin firma exige pedirlo explícitamente, no tener App Secret
// y no estar en producción. Por defecto todo webhook debe venir firmado.
// (Render no define NODE_ENV=production por sí solo, por eso no basta con mirarlo.)
export function isUnsignedWebhookAllowed() {
  return (
    env.whatsapp.allowUnsigned && !isAppSecretConfigured() && env.nodeEnv !== 'production'
  );
}
