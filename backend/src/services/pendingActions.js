// Confirmación humana (HITL) de las pending_actions, compartida por el panel
// web y por los botones de WhatsApp. Regla central: el agente propone y
// prepara; el dueño decide. Ninguna acción se ejecuta sin su decisión.
import {
  addAuditLog,
  createProduct,
  createSupplier,
  findPendingActionForDecision,
  findUserByPhone,
  getOrCreateConversation,
  getPendingActionById,
  getTenant,
  FACTORY_TENANT_ID,
  insertInboundMessage,
  insertOutboundMessage,
  listOwnerPhones,
  listSuppliers,
  markPendingActionDecision,
  normalizePhone,
  updateOrder,
} from '../config/db.js';
import { buildWaMeFallback, sendInteractiveButtons, sendTextMessage } from './whatsappOutbound.js';

export function formatColones(value) {
  return `₡${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// Ejecución de una decisión (misma lógica para panel y WhatsApp)
// ---------------------------------------------------------------------------

/**
 * Aprueba o rechaza una pending action y, si se aprueba, la ejecuta.
 * Devuelve { ok: true, action, createdProduct, updatedOrder, whatsappDelivery }
 * o { ok: false, code: 'NOT_FOUND' | 'ALREADY_DECIDED' | 'EXPIRED', action }.
 *
 * - `actor`: quién decide, para audit_log (el panel usa 'owner:hitl').
 * - `enforceExpiry`: si la acción venció (expires_at) no se ejecuta y se marca
 *   'expired'. El panel no lo activa para conservar su comportamiento (de
 *   todos modos solo muestra las acciones vigentes).
 *
 * markPendingActionDecision solo cambia filas en estado 'pending', así que dos
 * decisiones simultáneas sobre la misma acción no la ejecutan dos veces.
 */
export async function decidePendingAction({
  tenantId,
  actionId,
  decision,
  actor = 'owner:hitl',
  enforceExpiry = false,
}) {
  const existing = await getPendingActionById(tenantId, actionId);
  if (!existing) return { ok: false, code: 'NOT_FOUND', action: null };
  if (existing.status !== 'pending') {
    return { ok: false, code: 'ALREADY_DECIDED', action: existing };
  }
  if (enforceExpiry && new Date(existing.expires_at) < new Date()) {
    const expired = await markPendingActionDecision(tenantId, actionId, 'expired');
    await addAuditLog(tenantId, {
      actor,
      action: 'pending_action.expired',
      result: `Intentó decidir una acción vencida: ${existing.payload_json?.title || existing.action_type}. No se ejecutó.`,
    });
    return { ok: false, code: 'EXPIRED', action: expired || existing };
  }

  if (decision === 'reject') {
    const action = await markPendingActionDecision(tenantId, actionId, 'rejected');
    if (!action) return { ok: false, code: 'ALREADY_DECIDED', action: existing };
    await addAuditLog(tenantId, {
      actor,
      action: 'pending_action.rejected',
      result: `Descartó acción: ${action.payload_json?.title || action.action_type}.`,
    });
    return { ok: true, action, createdProduct: null, updatedOrder: null, whatsappDelivery: null };
  }

  if (decision !== 'approve') {
    throw new Error(`Decisión desconocida: ${decision}`);
  }

  const action = await markPendingActionDecision(tenantId, actionId, 'approved');
  if (!action) return { ok: false, code: 'ALREADY_DECIDED', action: existing };
  let createdProduct = null;
  let updatedOrder = null;
  let whatsappDelivery = null;

  if (action.action_type === 'create_product' && action.payload_json?.product) {
    const prodPayload = action.payload_json.product;
    let supplierId = prodPayload.supplier_id || null;
    if (!supplierId && action.payload_json?.supplier) {
      const sup = await createSupplier(tenantId, action.payload_json.supplier);
      supplierId = sup.id;
    }
    if (!supplierId) {
      const allSups = await listSuppliers(tenantId);
      supplierId = allSups[0]?.id;
    }
    createdProduct = await createProduct(tenantId, {
      ...prodPayload,
      supplier_id: supplierId,
    });
    await addAuditLog(tenantId, {
      actor,
      action: 'pending_action.approved',
      result: `Aprobó y publicó "${createdProduct.name}" en el catálogo.`,
    });
  } else if (
    action.action_type === 'purchase_order' ||
    action.action_type === 'quote_approval' ||
    action.action_type === 'supplier_stock_check'
  ) {
    if (action.order_id) {
      const nextStage =
        action.payload_json?.nextStage ||
        (action.action_type === 'purchase_order' ? 'pedido_proveedor' : 'por_confirmar');
      updatedOrder = await updateOrder(tenantId, action.order_id, {
        status: nextStage,
        pickup_notes:
          nextStage === 'pedido_proveedor'
            ? 'OC enviada · Recoger hoy'
            : 'Cotización enviada al cliente',
      });
    }

    // preview_text es el resumen interno para el dueño; al proveedor se le envía
    // el mensaje redactado para él cuando existe.
    whatsappDelivery = await sendTextMessage({
      toPhone: action.target_phone,
      body: action.payload_json?.supplierMessage || action.preview_text,
    });

    await addAuditLog(tenantId, {
      actor,
      action: 'pending_action.approved',
      result: `Ejecutó ${action.action_type} hacia ${action.target_phone}.`,
    });
  } else {
    await addAuditLog(tenantId, {
      actor,
      action: 'pending_action.approved',
      result: `Atendió traspaso humano: ${action.payload_json?.title || action.id}`,
    });
  }

  return { ok: true, action, createdProduct, updatedOrder, whatsappDelivery };
}

// ---------------------------------------------------------------------------
// Botones de WhatsApp
// ---------------------------------------------------------------------------

// Formato del id de botón: "pa:approve:<uuid>" o "pa:reject:<uuid>".
// Solo lleva el id de la acción; el negocio se toma de la propia acción.
const BUTTON_ID_RE =
  /^pa:(approve|reject):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function buildDecisionButtons(actionId) {
  return [
    { id: `pa:approve:${actionId}`, title: 'Aprobar' },
    { id: `pa:reject:${actionId}`, title: 'Rechazar' },
  ];
}

export function parseDecisionButtonId(buttonId) {
  const match = String(buttonId || '').match(BUTTON_ID_RE);
  if (!match) return null;
  return { decision: match[1].toLowerCase(), actionId: match[2].toLowerCase() };
}

/**
 * Texto del aviso al dueño: qué se pide, quién (cliente), montos y vencimiento.
 * `customerPhone` y `order` son opcionales (vienen del mensaje del cliente).
 */
export function buildPendingActionSummary(action, { tenantName = '', customerPhone = '', order = null } = {}) {
  const p = action.payload_json || {};
  const lines = [`Por confirmar${tenantName ? ` · ${tenantName}` : ''}`];
  lines.push(p.title || action.action_type);
  const client =
    customerPhone || order?.customer_phone || (action.action_type === 'human_handoff' ? action.target_phone : '');
  if (client) lines.push(`Cliente: +${normalizePhone(client)}`);
  if (order) {
    lines.push(`Total: ${formatColones(order.total_sale)} (costo ${formatColones(order.total_cost)})`);
  }
  if (p.impactSummary) lines.push(p.impactSummary);
  if (action.preview_text) lines.push('', action.preview_text);
  if (action.expires_at) {
    lines.push('', `Vence: ${new Date(action.expires_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}`);
  }
  return lines.join('\n');
}

/**
 * Avisa a los dueños del negocio que hay una acción esperando su decisión,
 * con botones Aprobar / Rechazar ligados a esa acción.
 *
 * Limitación (ventana de 24 h de Meta): si el dueño no escribió al número en
 * las últimas 24 h, Meta rechaza el interactivo y exige una plantilla aprobada,
 * que aún no tenemos. En ese caso solo se registra el fallo (consola y
 * audit_log); la acción sigue visible en el panel como siempre.
 */
export async function notifyOwnersOfPendingAction({ tenant, action, customerPhone = '', order = null }) {
  const owners = await listOwnerPhones(tenant.id);
  const body = buildPendingActionSummary(action, { tenantName: tenant.name, customerPhone, order });
  const deliveries = [];
  for (const ownerPhone of owners) {
    let delivery;
    try {
      delivery = await sendInteractiveButtons({
        toPhone: ownerPhone,
        body,
        buttons: buildDecisionButtons(action.id),
      });
    } catch (err) {
      delivery = { sentViaApi: false, simulated: false, error: err.message };
    }
    if (!delivery.sentViaApi && !delivery.simulated) {
      console.warn(
        `[pendingActions] No se pudo avisar al dueño ${ownerPhone} de la acción ${action.id}: ${delivery.error}`
      );
      await addAuditLog(tenant.id, {
        actor: 'system:whatsapp',
        action: 'pending_action.notify_failed',
        result: `No llegó el aviso por WhatsApp de "${action.payload_json?.title || action.action_type}" (posible ventana de 24 h vencida). Queda en el panel.`,
      });
    }
    deliveries.push({ ownerPhone, ...delivery });
  }
  return deliveries;
}

const DECISION_LABEL = { approved: 'aprobada', rejected: 'rechazada', expired: 'vencida' };
const NEUTRAL_REPLY = 'Ese botón ya no está disponible.';

function buildDecisionReply(outcome, decision) {
  const action = outcome.action;
  const title = action?.payload_json?.title || action?.action_type || 'la acción';

  if (!outcome.ok) {
    if (outcome.code === 'EXPIRED') {
      return [`"${title}" venció y no se ejecutó. Si aún la necesitas, vuelve a pedirla.`];
    }
    if (outcome.code === 'ALREADY_DECIDED') {
      const label = DECISION_LABEL[action?.status] || action?.status;
      return [`"${title}" ya estaba ${label}. No hice nada más.`];
    }
    return [NEUTRAL_REPLY];
  }

  if (decision === 'reject') {
    return [`Rechazaste "${title}". No se ejecutó nada.`];
  }

  const messages = [];
  if (outcome.createdProduct) {
    messages.push(`Listo: "${outcome.createdProduct.name}" ya está publicado en tu catálogo.`);
  } else if (action.action_type === 'human_handoff') {
    messages.push(
      `Marcado como atendido. Escríbele al cliente aquí:\n${buildWaMeFallback(action.target_phone)}`
    );
  } else {
    const lines = [`Listo: aprobaste "${title}".`];
    if (outcome.updatedOrder) lines.push(`El pedido pasó a la etapa "${outcome.updatedOrder.status}".`);
    const delivery = outcome.whatsappDelivery;
    if (delivery && !delivery.sentViaApi && !delivery.simulated) {
      // El envío por la API falló (p. ej. el proveedor no escribió en 24 h):
      // el dueño lo manda él mismo con el enlace wa.me.
      lines.push(
        `No pude enviar el mensaje a +${action.target_phone} por la API. Envíalo tú con este enlace:\n${delivery.fallbackWaMeUrl}`
      );
    } else {
      lines.push(`Envié el mensaje a +${action.target_phone}.`);
    }
    messages.push(lines.join('\n'));
  }
  return messages;
}

/**
 * Atiende la pulsación de un botón Aprobar/Rechazar. Se llama desde el webhook
 * ANTES del enrutador normal.
 * Devuelve null si el id no es de una acción (sigue el flujo normal); si no,
 * { duplicate, replies: [texto...] } para que el webhook responda.
 *
 * Seguridad:
 * - La acción se busca por id y su negocio sale de la acción, no del texto.
 * - Solo decide un dueño de ESE negocio; a cualquier otro se le responde algo
 *   neutro, igual que si la acción no existiera.
 * - Una acción ya decidida o vencida no se vuelve a ejecutar (idempotente ante
 *   reintentos de Meta o dobles pulsaciones).
 */
export async function handleDecisionButton({ fromPhone, buttonId, waMessageId, buttonTitle = '', rawPayload = {} }) {
  const parsed = parseDecisionButtonId(buttonId);
  if (!parsed) return null;

  const action = await findPendingActionForDecision(parsed.actionId);
  const user = action ? await findUserByPhone(action.tenant_id, fromPhone) : null;
  const isOwner = Boolean(action) && user?.role === 'owner';
  const tenant = isOwner ? await getTenant(action.tenant_id) : null;

  // El mensaje entrante se guarda (para deduplicar por wa_message_id) en el
  // negocio de la acción solo si quien pulsa es su dueño; si no, en la fábrica,
  // para no abrir conversaciones en un negocio ajeno.
  const storeTenantId = isOwner ? action.tenant_id : FACTORY_TENANT_ID;
  const conv = await getOrCreateConversation(storeTenantId, fromPhone, isOwner ? 'owner' : 'client');
  const { inserted } = await insertInboundMessage(storeTenantId, {
    conversation_id: conv.id,
    wa_message_id: waMessageId,
    sender_phone: fromPhone,
    message_type: 'interactive',
    body_text: buttonTitle,
    raw_payload: rawPayload,
  });
  if (!inserted) return { duplicate: true, replies: [] };

  if (!isOwner) {
    if (action) {
      console.warn(`[pendingActions] ${fromPhone} pulsó un botón de una acción ajena (${action.id}).`);
      await addAuditLog(action.tenant_id, {
        actor: `phone:${normalizePhone(fromPhone)}`,
        action: 'pending_action.unauthorized_attempt',
        result: `Un teléfono que no es dueño intentó ${parsed.decision === 'approve' ? 'aprobar' : 'rechazar'} una acción. No se ejecutó.`,
      });
    }
    return { duplicate: false, replies: [NEUTRAL_REPLY] };
  }

  const outcome = await decidePendingAction({
    tenantId: action.tenant_id,
    actionId: action.id,
    decision: parsed.decision,
    actor: `owner:whatsapp:${normalizePhone(fromPhone)}`,
    enforceExpiry: true,
  });
  const replies = buildDecisionReply(outcome, parsed.decision);

  for (const [i, text] of replies.entries()) {
    await insertOutboundMessage(tenant.id, {
      conversation_id: conv.id,
      wa_message_id: waMessageId ? `${waMessageId}:reply${i ? `:${i}` : ''}` : null,
      sender_phone: 'system',
      body_text: text,
      media_url: null,
    });
  }
  return { duplicate: false, replies, outcome };
}
