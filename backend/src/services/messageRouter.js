// Enrutador del número compartido: decide a qué negocio y con qué agente
// responde cada mensaje entrante. Es de solo lectura; los cambios de estado
// (cerrar una entrevista, crear la conversación) los hace processMessage.
import {
  FACTORY_TENANT_ID,
  findActiveOnboardingConversation,
  findAgentByCode,
  findLatestAgentConversation,
  findOwnedTenants,
  getTenant,
} from '../config/db.js';

// Ventana en la que un teléfono sigue hablando con el último agente que usó.
export const SESSION_WINDOW_MINUTES = 24 * 60;

const CODE_RE = /\bJRV(?:-[A-Z0-9]+)+\b/i;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function extractAgentCode(text) {
  const match = String(text || '').match(CODE_RE);
  return match ? match[0].toUpperCase() : null;
}

export function stripAgentCode(text) {
  return String(text || '').replace(CODE_RE, ' ').replace(/\s+/g, ' ').trim();
}

function mentionsWakeWord(text, tenant) {
  const wake = normalizeText(tenant.activation_name).trim();
  if (!wake) return false;
  const escaped = wake.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalizeText(text));
}

function isTenantAvailable(tenant) {
  return Boolean(tenant) && tenant.status !== 'suspended';
}

function route(tenantId, mode, reason, extra = {}) {
  return { tenantId, mode, reason, agentId: null, code: null, ...extra };
}

/**
 * Reglas, en este orden:
 * 1. "#activar" o "#onboarding": entrevista de la fábrica.
 * 2. Código de agente en el mensaje: el agente público lleva al cliente a ese
 *    negocio; el código privado solo vale si quien escribe es su dueño.
 * 3. Entrevista a medias: se continúa.
 * 4. El dueño menciona el nombre de activación de uno de sus negocios.
 * 5. Conversación reciente con un agente: se sigue con el mismo.
 * 6. El teléfono es dueño de algún negocio: su asistente (el más reciente).
 * 7. En cualquier otro caso: la fábrica (entrevista nueva).
 */
export async function resolveRoute({ fromPhone, text }) {
  const normalized = normalizeText(text).trim();

  if (normalized.startsWith('#activar') || normalized.startsWith('#onboarding')) {
    return route(FACTORY_TENANT_ID, 'onboarding', 'factory_command');
  }

  const code = extractAgentCode(text);
  const owned = await findOwnedTenants(fromPhone);

  if (code) {
    const agent = await findAgentByCode(code);
    if (agent) {
      const tenant = await getTenant(agent.tenant_id);
      const isOwner = owned.some((t) => t.id === agent.tenant_id);
      if (agent.type === 'attention') {
        if (!agent.active || !isTenantAvailable(tenant)) {
          return route(agent.tenant_id, 'unavailable', 'agent_paused', { code });
        }
        return route(agent.tenant_id, 'client', 'agent_code', { agentId: agent.id, code });
      }
      if (agent.type === 'personal' && isOwner && isTenantAvailable(tenant)) {
        return route(agent.tenant_id, 'owner', 'agent_code', { agentId: agent.id, code });
      }
      // Código privado usado por alguien que no es el dueño: se ignora sin
      // revelar a qué negocio pertenece.
    }
  }

  const onboarding = await findActiveOnboardingConversation(FACTORY_TENANT_ID, fromPhone);
  if (onboarding) {
    return route(FACTORY_TENANT_ID, 'onboarding', 'onboarding_in_progress');
  }

  const woken = owned.find((t) => isTenantAvailable(t) && mentionsWakeWord(text, t));
  if (woken) {
    return route(woken.id, 'owner', 'wake_word');
  }

  const latest = await findLatestAgentConversation(fromPhone, SESSION_WINDOW_MINUTES);
  if (latest) {
    const tenant = await getTenant(latest.tenant_id);
    const stillOwner = owned.some((t) => t.id === latest.tenant_id);
    if (isTenantAvailable(tenant) && (latest.channel_mode === 'client' || stillOwner)) {
      return route(latest.tenant_id, latest.channel_mode, 'active_conversation', {
        agentId: latest.agent_id || null,
      });
    }
  }

  const ownedAvailable = owned.find(isTenantAvailable);
  if (ownedAvailable) {
    return route(ownedAvailable.id, 'owner', 'owner_phone');
  }

  return route(FACTORY_TENANT_ID, 'onboarding', 'default_factory');
}
