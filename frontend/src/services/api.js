import { calculateMargin, formatCurrency } from '../data/mockStore';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function apiRequest(path, { method = 'GET', body, tenantId, timeoutMs = 2500 } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (tenantId) headers['X-Tenant-Id'] = tenantId;

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

export function mapBackendProduct(p) {
  const cost = Number(p.cost_price ?? p.costPrice ?? 0);
  const sale = Number(p.sale_price ?? p.salePrice ?? 0);
  const { amount, percent } = calculateMargin(cost, sale);
  return {
    id: p.id,
    sku: p.sku || `JRV-${String(p.id).slice(0, 6).toUpperCase()}`,
    name: p.name,
    description: p.description || '',
    category: p.category || 'General',
    supplierId: p.supplier_id || p.supplierId,
    supplierName: p.supplier_name || p.supplier?.name || 'Proveedor Local',
    image: p.image_url || p.image || '/products/cargador-gan.svg',
    costPrice: cost,
    salePrice: sale,
    marginAmount: p.margin_amount ?? amount,
    marginPercent: p.margin_percent ?? percent,
    stockStatus: p.active === false ? 'Inactivo' : 'Stock confirmado hoy',
    deliveryEta: 'Mismo día',
    salesCount: 0,
  };
}

export function mapBackendSupplier(s) {
  const digits = String(s.whatsapp_phone || s.whatsapp || '').replace(/\D/g, '');
  const formattedPhone =
    digits.length === 11 && digits.startsWith('506')
      ? `+506 ${digits.slice(3, 7)} ${digits.slice(7)}`
      : s.whatsapp_phone || s.whatsapp || '+506 8888 8888';

  return {
    id: s.id,
    name: s.name,
    category: s.category || 'Distribuidor Local',
    whatsapp: formattedPhone,
    location: s.location || 'San José, Costa Rica',
    pickupWindow: 'Hoy 10:00 - 18:30',
    avgResponseMin: 6,
    reliability: '98.5%',
    contactPerson: s.name,
    notes: s.notes || '',
  };
}

export function mapBackendOrder(o) {
  const totalSale = Number(o.total_sale ?? o.saleTotal ?? 0);
  const totalCost = Number(o.total_cost ?? o.costTotal ?? 0);
  const shortId = String(o.id).startsWith('ORD-')
    ? o.id
    : `ORD-${String(o.id).slice(-4).toUpperCase()}`;

  return {
    id: o.id,
    displayId: shortId,
    customerName: o.customer_name || o.customerName || 'Cliente WhatsApp',
    customerWhatsapp: o.customer_phone || o.customerWhatsapp || '+506 8910 2218',
    deliveryZone: o.pickup_notes || 'GAM · Costa Rica',
    itemsSummary: o.items_summary || `${o.quantity || 1}x ${o.product_name || 'Producto'}`,
    supplierId: o.supplier_id,
    supplierName: o.supplier_name || 'Proveedor Local',
    supplierWhatsapp: o.supplier_whatsapp || '+506 8841 2310',
    supplierLocation: o.supplier_location || 'San José Centro',
    stage: o.status || 'solicitud',
    costTotal: totalCost,
    saleTotal: totalSale,
    marginTotal: Math.max(0, totalSale - totalCost),
    pickupSlot: o.pickup_notes || 'Pendiente confirmación',
    pickupCompleted: o.status === 'recogida_entrega' || o.status === 'entregado',
    paymentMethod: 'SINPE Móvil / Contra entrega',
    updatedAt: 'Sincronizado',
  };
}

export function mapBackendPendingAction(pa) {
  const payload = pa.payload_json || {};
  const badgeMap = {
    create_product: 'Alta de Producto',
    purchase_order: 'Orden de Compra WhatsApp',
    quote_approval: 'Cotización a Cliente',
    supplier_stock_check: 'Consulta WhatsApp B2B',
    human_handoff: 'Traspaso a Humano',
  };

  return {
    id: pa.id,
    type: pa.action_type,
    badge: badgeMap[pa.action_type] || 'Confirmación HITL',
    priority: pa.action_type === 'purchase_order' ? 'Alta' : 'Media',
    title: payload.title || pa.preview_text?.slice(0, 64) || 'Acción pendiente',
    agentId: 'AGT-API',
    agentName: payload.agentName || 'Jarvi AI Engine',
    orderId: pa.order_id || null,
    nextStage: payload.nextStage || null,
    supplierId: payload.supplierId || null,
    supplierName: payload.supplierName || 'Proveedor Local',
    whatsappTarget: pa.target_phone || '',
    impactSummary:
      payload.impactSummary ||
      (payload.product
        ? `Costo ${formatCurrency(payload.product.cost_price)} · Venta ${formatCurrency(
            payload.product.sale_price
          )}`
        : 'Requiere revisión antes de enviar'),
    previewMessage: pa.preview_text,
    newProduct: payload.product ? mapBackendProduct(payload.product) : null,
    newSupplier: payload.supplier ? mapBackendSupplier(payload.supplier) : null,
    createdAt: 'En cola',
  };
}

export function mapBackendAgent(a) {
  const isPersonal = a.type === 'personal';
  return {
    id: a.id,
    name: isPersonal ? 'Asistente Privado del Dueño' : 'Agente Público de Atención',
    role: isPersonal
      ? 'Gestión interna, costos y propuestas HITL'
      : 'Atención B2C WhatsApp (oculta costos y proveedores)',
    model: a.access_policy === 'owner_only' ? 'Owner Guard v2' : 'Public Guard v2',
    status: a.active ? 'active' : 'paused',
    conversationsToday: isPersonal ? 38 : 142,
    conversionRate: isPersonal ? '91.0%' : '100% privacidad',
    hitlRule: a.system_prompt,
    lastAction: `Código ${a.activation_code}`,
  };
}

export function mapBackendTenant(t) {
  return {
    id: t.id,
    name: t.name,
    plan: 'SaaS Pro · PostgreSQL',
    city: 'San José, Costa Rica',
    whatsappConnected: '+506 8901 4400',
    monthlyGoal: 4200000,
    activationName: t.activation_name || 'Jarvis',
    defaultMargin: Number(t.default_margin || 40),
    handoffRule: t.handoff_rule || '',
    businessIndustry: t.business_industry || '',
  };
}

export async function fetchBackendBundle(tenantId) {
  const health = await apiRequest('/health', { timeoutMs: 2000 });
  const tenantsRes = await apiRequest('/tenants');
  const resolvedTenantId =
    tenantId && tenantsRes.tenants?.some((t) => t.id === tenantId)
      ? tenantId
      : tenantsRes.tenants?.[0]?.id;

  const [dashRes, prodRes, supRes, ordRes, hitlRes, agentsRes] = await Promise.all([
    apiRequest('/dashboard', { tenantId: resolvedTenantId }),
    apiRequest('/products', { tenantId: resolvedTenantId }),
    apiRequest('/suppliers', { tenantId: resolvedTenantId }),
    apiRequest('/orders', { tenantId: resolvedTenantId }),
    apiRequest('/pending-actions?status=pending', { tenantId: resolvedTenantId }),
    apiRequest('/agents', { tenantId: resolvedTenantId }),
  ]);

  return {
    health,
    activeTenantId: resolvedTenantId,
    tenants: (tenantsRes.tenants || []).map(mapBackendTenant),
    suppliers: (supRes.suppliers || []).map(mapBackendSupplier),
    products: (prodRes.products || []).map(mapBackendProduct),
    orders: (ordRes.orders || []).map(mapBackendOrder),
    pendingActions: (hitlRes.pendingActions || []).map(mapBackendPendingAction),
    agents: (agentsRes.agents || []).map(mapBackendAgent),
    activity: (dashRes.recentActivity || []).map((log) => ({
      id: log.id,
      agentName: log.actor,
      action: log.result,
      tag: log.action,
      time: 'Sincronizado',
    })),
  };
}

export const api = {
  createProduct: (tenantId, body) =>
    apiRequest('/products', { method: 'POST', body, tenantId }),
  createPendingAction: (tenantId, body) =>
    apiRequest('/pending-actions', { method: 'POST', body, tenantId }),
  approvePendingAction: (tenantId, id) =>
    apiRequest(`/pending-actions/${id}/approve`, { method: 'POST', tenantId }),
  rejectPendingAction: (tenantId, id) =>
    apiRequest(`/pending-actions/${id}/reject`, { method: 'POST', tenantId }),
  updateOrder: (tenantId, id, body) =>
    apiRequest(`/orders/${id}`, { method: 'PATCH', body, tenantId }),
  toggleAgent: (tenantId, id) =>
    apiRequest(`/agents/${id}/toggle`, { method: 'PATCH', tenantId }),
  submitOnboarding: (tenantId, body) =>
    apiRequest('/agents/onboarding', { method: 'POST', body, tenantId }),
  processMessage: (tenantId, body) =>
    apiRequest('/engine/process-message', { method: 'POST', body, tenantId }),
};
