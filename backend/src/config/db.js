import crypto from 'node:crypto';
import pg from 'pg';
import { env } from './env.js';
import {
  buildSeedData,
  DEFAULT_TENANT_ID,
  FACTORY_TENANT_ID,
  seedPostgres,
} from '../db/seed.js';

export { FACTORY_TENANT_ID };

let dbMode = 'memory';
let pgPool = null;
let mem = null;

export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function calculateMargin(costPrice, salePrice) {
  const cost = Number(costPrice) || 0;
  const sale = Number(salePrice) || 0;
  const amount = Math.max(0, sale - cost);
  const percent = sale > 0 ? Math.round((amount / sale) * 1000) / 10 : 0;
  return { amount, percent };
}

export async function initDb() {
  if (env.databaseUrl) {
    const candidatePool = new pg.Pool({
      connectionString: env.databaseUrl,
      ssl:
        env.nodeEnv === 'production'
          ? { rejectUnauthorized: false }
          : undefined,
      connectionTimeoutMillis: 4000,
    });

    try {
      await candidatePool.query('SELECT 1');
      await seedPostgres(candidatePool);
      pgPool = candidatePool;
      dbMode = 'postgres';
      console.log('[db] Conectado a PostgreSQL multi-tenant.');
      return;
    } catch (error) {
      console.warn(
        `[db] No se pudo conectar a PostgreSQL (${error.message}). Usando fallback en memoria.`
      );
      await candidatePool.end().catch(() => {});
    }
  } else {
    console.log(
      '[db] DATABASE_URL no configurado. Iniciando con almacenamiento en memoria multi-tenant pre-sembrado.'
    );
  }

  mem = buildSeedData();
  dbMode = 'memory';
}

export function getDbMode() {
  return dbMode;
}

export async function getTenants() {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM tenants WHERE id <> $1 ORDER BY created_at ASC',
      [FACTORY_TENANT_ID]
    );
    return rows;
  }
  return mem.tenants.filter((t) => t.id !== FACTORY_TENANT_ID);
}

export async function getTenant(tenantId = DEFAULT_TENANT_ID) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM tenants WHERE id = $1 LIMIT 1',
      [tenantId]
    );
    if (rows[0]) return rows[0];
    const fallback = await pgPool.query(
      'SELECT * FROM tenants ORDER BY created_at ASC LIMIT 1'
    );
    return fallback.rows[0] || null;
  }
  return (
    mem.tenants.find((t) => t.id === tenantId) || mem.tenants[0] || null
  );
}

export async function resolveTenantByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return getTenant(DEFAULT_TENANT_ID);
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM tenants WHERE wa_phone_number_id = $1 LIMIT 1',
      [String(phoneNumberId)]
    );
    if (rows[0]) return rows[0];
    return getTenant(DEFAULT_TENANT_ID);
  }
  return (
    mem.tenants.find((t) => t.wa_phone_number_id === String(phoneNumberId)) ||
    mem.tenants[0]
  );
}

// ---------------------------------------------------------------------------
// Búsquedas entre negocios. Solo las usa el enrutador del número compartido
// para decidir a qué negocio va un mensaje; son de solo lectura y no exponen
// datos de catálogo, pedidos ni costos.
// ---------------------------------------------------------------------------

// Devuelve el negocio cuyo número propio es phoneNumberId, sin caer al negocio
// por defecto (a diferencia de resolveTenantByPhoneNumberId).
export async function findTenantByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM tenants WHERE wa_phone_number_id = $1 LIMIT 1',
      [String(phoneNumberId)]
    );
    return rows[0] || null;
  }
  return mem.tenants.find((t) => t.wa_phone_number_id === String(phoneNumberId)) || null;
}

export async function findAgentByCode(code) {
  const wanted = String(code || '').trim().toUpperCase();
  if (!wanted) return null;
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM agents WHERE UPPER(activation_code) = $1 AND tenant_id <> $2 LIMIT 1',
      [wanted, FACTORY_TENANT_ID]
    );
    return rows[0] || null;
  }
  return (
    mem.agents.find(
      (a) =>
        a.tenant_id !== FACTORY_TENANT_ID &&
        String(a.activation_code || '').toUpperCase() === wanted
    ) || null
  );
}

// Negocios de los que este teléfono es dueño, el más reciente primero.
export async function findOwnedTenants(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return [];
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `SELECT t.* FROM tenants t
       JOIN users u ON u.tenant_id = t.id
       WHERE u.phone = $1 AND u.role = 'owner' AND t.id <> $2
       ORDER BY t.created_at DESC`,
      [digits, FACTORY_TENANT_ID]
    );
    return rows;
  }
  const ownedIds = new Set(
    mem.users
      .filter((u) => u.role === 'owner' && normalizePhone(u.phone) === digits)
      .map((u) => u.tenant_id)
  );
  return mem.tenants
    .filter((t) => t.id !== FACTORY_TENANT_ID && ownedIds.has(t.id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// Conversación más reciente de este teléfono con un agente (dueño o cliente)
// dentro de la ventana indicada. Excluye las entrevistas de la fábrica.
export async function findLatestAgentConversation(phone, withinMinutes) {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  const since = new Date(Date.now() - withinMinutes * 60 * 1000);
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `SELECT * FROM conversations
       WHERE participant_phone = $1 AND tenant_id <> $2
         AND channel_mode IN ('owner', 'client') AND last_message_at >= $3
       ORDER BY last_message_at DESC
       LIMIT 1`,
      [digits, FACTORY_TENANT_ID, since.toISOString()]
    );
    return rows[0] || null;
  }
  return (
    mem.conversations
      .filter(
        (c) =>
          c.participant_phone === digits &&
          c.tenant_id !== FACTORY_TENANT_ID &&
          (c.channel_mode === 'owner' || c.channel_mode === 'client') &&
          new Date(c.last_message_at) >= since
      )
      .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)))[0] ||
    null
  );
}

export async function findUserByPhone(tenantId, phone) {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM users WHERE tenant_id = $1 AND phone = $2 LIMIT 1',
      [tenantId, digits]
    );
    return rows[0] || null;
  }
  return (
    mem.users.find(
      (u) => u.tenant_id === tenantId && normalizePhone(u.phone) === digits
    ) || null
  );
}

export async function upsertOwnerUser(tenantId, phone, name = 'Dueño Autorizado') {
  const digits = normalizePhone(phone);
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `INSERT INTO users (tenant_id, phone, name, role)
       VALUES ($1, $2, $3, 'owner')
       ON CONFLICT (tenant_id, phone)
       DO UPDATE SET role = 'owner', name = EXCLUDED.name
       RETURNING *`,
      [tenantId, digits, name]
    );
    return rows[0];
  }
  let existing = mem.users.find(
    (u) => u.tenant_id === tenantId && normalizePhone(u.phone) === digits
  );
  if (existing) {
    existing.role = 'owner';
    existing.name = name;
    return existing;
  }
  existing = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    phone: digits,
    name,
    role: 'owner',
    created_at: new Date().toISOString(),
  };
  mem.users.push(existing);
  return existing;
}

export async function listSuppliers(tenantId, q = '') {
  const query = normalizeText(q).trim();
  if (dbMode === 'postgres') {
    const { rows: suppliers } = await pgPool.query(
      'SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    const { rows: products } = await pgPool.query(
      'SELECT id, supplier_id, name, category FROM products WHERE tenant_id = $1 AND active = true',
      [tenantId]
    );
    return suppliers
      .map((s) => {
        const assoc = products.filter((p) => p.supplier_id === s.id);
        return {
          ...s,
          products_count: assoc.length,
          products_summary: assoc.map((p) => ({ id: p.id, name: p.name })),
        };
      })
      .filter((s) => {
        if (!query) return true;
        return (
          normalizeText(s.name).includes(query) ||
          normalizeText(s.location).includes(query) ||
          s.products_summary.some((p) => normalizeText(p.name).includes(query))
        );
      });
  }

  const suppliers = mem.suppliers.filter((s) => s.tenant_id === tenantId);
  const products = mem.products.filter(
    (p) => p.tenant_id === tenantId && p.active
  );
  return suppliers
    .map((s) => {
      const assoc = products.filter((p) => p.supplier_id === s.id);
      return {
        ...s,
        products_count: assoc.length,
        products_summary: assoc.map((p) => ({ id: p.id, name: p.name })),
      };
    })
    .filter((s) => {
      if (!query) return true;
      return (
        normalizeText(s.name).includes(query) ||
        normalizeText(s.location).includes(query) ||
        s.products_summary.some((p) => normalizeText(p.name).includes(query))
      );
    });
}

export async function createSupplier(tenantId, data) {
  const phoneDigits = normalizePhone(data.whatsapp_phone || data.whatsapp);
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `INSERT INTO suppliers (tenant_id, name, whatsapp_phone, location, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        tenantId,
        data.name,
        phoneDigits,
        data.location || 'San José, Costa Rica',
        data.notes || null,
      ]
    );
    return rows[0];
  }
  const supplier = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    name: data.name,
    whatsapp_phone: phoneDigits,
    location: data.location || 'San José, Costa Rica',
    notes: data.notes || null,
    created_at: new Date().toISOString(),
  };
  mem.suppliers.unshift(supplier);
  return supplier;
}

export async function updateSupplier(tenantId, id, patch) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `UPDATE suppliers
       SET name = COALESCE($3, name),
           whatsapp_phone = COALESCE($4, whatsapp_phone),
           location = COALESCE($5, location),
           notes = COALESCE($6, notes)
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        id,
        patch.name ?? null,
        patch.whatsapp_phone ? normalizePhone(patch.whatsapp_phone) : null,
        patch.location ?? null,
        patch.notes ?? null,
      ]
    );
    return rows[0] || null;
  }
  const sup = mem.suppliers.find((s) => s.tenant_id === tenantId && s.id === id);
  if (!sup) return null;
  if (patch.name !== undefined) sup.name = patch.name;
  if (patch.whatsapp_phone !== undefined) {
    sup.whatsapp_phone = normalizePhone(patch.whatsapp_phone);
  }
  if (patch.location !== undefined) sup.location = patch.location;
  if (patch.notes !== undefined) sup.notes = patch.notes;
  return sup;
}

export async function listProducts(tenantId, filters = {}) {
  const { q = '', category = '', supplierId = '', active = true } = filters;
  const query = normalizeText(q).trim();
  const catFilter = normalizeText(category).trim();

  let products;
  let suppliers;
  if (dbMode === 'postgres') {
    const prodRes = await pgPool.query(
      'SELECT * FROM products WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    const supRes = await pgPool.query(
      'SELECT * FROM suppliers WHERE tenant_id = $1',
      [tenantId]
    );
    products = prodRes.rows;
    suppliers = supRes.rows;
  } else {
    products = mem.products.filter((p) => p.tenant_id === tenantId);
    suppliers = mem.suppliers.filter((s) => s.tenant_id === tenantId);
  }

  const supMap = new Map(suppliers.map((s) => [s.id, s]));

  return products
    .filter((p) => (active === null ? true : Boolean(p.active) === Boolean(active)))
    .map((p) => {
      const sup = supMap.get(p.supplier_id);
      const { amount, percent } = calculateMargin(p.cost_price, p.sale_price);
      return {
        ...p,
        cost_price: Number(p.cost_price),
        sale_price: Number(p.sale_price),
        margin_amount: amount,
        margin_percent: percent,
        supplier_name: sup?.name || 'Proveedor Local',
        supplier: sup || null,
      };
    })
    .filter((p) => {
      if (supplierId && p.supplier_id !== supplierId) return false;
      if (catFilter && catFilter !== 'todas' && normalizeText(p.category) !== catFilter) {
        return false;
      }
      if (!query) return true;
      return (
        normalizeText(p.name).includes(query) ||
        normalizeText(p.description).includes(query) ||
        normalizeText(p.category).includes(query) ||
        normalizeText(p.sku).includes(query) ||
        normalizeText(p.supplier_name).includes(query)
      );
    });
}

export async function createProduct(tenantId, data) {
  let supplierId = data.supplier_id;
  if (!supplierId && data.new_supplier) {
    const createdSup = await createSupplier(tenantId, data.new_supplier);
    supplierId = createdSup.id;
  }

  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `INSERT INTO products (tenant_id, supplier_id, sku, category, name, description, image_url, cost_price, sale_price, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        tenantId,
        supplierId,
        data.sku || `JRV-${Math.floor(100 + Math.random() * 899)}`,
        data.category || 'General',
        data.name,
        data.description || '',
        data.image_url || '/products/cargador-gan.svg',
        Number(data.cost_price),
        Number(data.sale_price),
        data.active !== undefined ? Boolean(data.active) : true,
      ]
    );
    const list = await listProducts(tenantId, { active: null });
    return list.find((p) => p.id === rows[0].id);
  }

  const product = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    supplier_id: supplierId,
    sku: data.sku || `JRV-${Math.floor(100 + Math.random() * 899)}`,
    category: data.category || 'General',
    name: data.name,
    description: data.description || '',
    image_url: data.image_url || '/products/cargador-gan.svg',
    cost_price: Number(data.cost_price),
    sale_price: Number(data.sale_price),
    active: data.active !== undefined ? Boolean(data.active) : true,
    created_at: new Date().toISOString(),
  };
  mem.products.unshift(product);
  const list = await listProducts(tenantId, { active: null });
  return list.find((p) => p.id === product.id);
}

export async function updateProduct(tenantId, id, patch) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `UPDATE products
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           category = COALESCE($5, category),
           image_url = COALESCE($6, image_url),
           cost_price = COALESCE($7, cost_price),
           sale_price = COALESCE($8, sale_price),
           active = COALESCE($9, active)
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        id,
        patch.name ?? null,
        patch.description ?? null,
        patch.category ?? null,
        patch.image_url ?? null,
        patch.cost_price !== undefined ? Number(patch.cost_price) : null,
        patch.sale_price !== undefined ? Number(patch.sale_price) : null,
        patch.active !== undefined ? Boolean(patch.active) : null,
      ]
    );
    if (!rows[0]) return null;
    const list = await listProducts(tenantId, { active: null });
    return list.find((p) => p.id === id);
  }

  const prod = mem.products.find((p) => p.tenant_id === tenantId && p.id === id);
  if (!prod) return null;
  if (patch.name !== undefined) prod.name = patch.name;
  if (patch.description !== undefined) prod.description = patch.description;
  if (patch.category !== undefined) prod.category = patch.category;
  if (patch.image_url !== undefined) prod.image_url = patch.image_url;
  if (patch.cost_price !== undefined) prod.cost_price = Number(patch.cost_price);
  if (patch.sale_price !== undefined) prod.sale_price = Number(patch.sale_price);
  if (patch.active !== undefined) prod.active = Boolean(patch.active);
  const list = await listProducts(tenantId, { active: null });
  return list.find((p) => p.id === id);
}

export async function listOrders(tenantId, filters = {}) {
  const { status = '', supplierId = '', q = '' } = filters;
  const query = normalizeText(q).trim();

  let orders;
  let products;
  let suppliers;
  if (dbMode === 'postgres') {
    const [ordRes, prodRes, supRes] = await Promise.all([
      pgPool.query(
        'SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC',
        [tenantId]
      ),
      pgPool.query('SELECT * FROM products WHERE tenant_id = $1', [tenantId]),
      pgPool.query('SELECT * FROM suppliers WHERE tenant_id = $1', [tenantId]),
    ]);
    orders = ordRes.rows;
    products = prodRes.rows;
    suppliers = supRes.rows;
  } else {
    orders = mem.orders.filter((o) => o.tenant_id === tenantId);
    products = mem.products.filter((p) => p.tenant_id === tenantId);
    suppliers = mem.suppliers.filter((s) => s.tenant_id === tenantId);
  }

  const prodMap = new Map(products.map((p) => [p.id, p]));
  const supMap = new Map(suppliers.map((s) => [s.id, s]));

  return orders
    .map((o) => {
      const prod = prodMap.get(o.product_id);
      const sup = supMap.get(o.supplier_id);
      const totalSale = Number(o.total_sale);
      const totalCost = Number(o.total_cost);
      return {
        ...o,
        total_sale: totalSale,
        total_cost: totalCost,
        margin_total: Math.max(0, totalSale - totalCost),
        product_name: prod?.name || 'Producto',
        items_summary: `${o.quantity}x ${prod?.name || 'Producto'}`,
        supplier_name: sup?.name || 'Proveedor Local',
        supplier_whatsapp: sup?.whatsapp_phone || '',
        supplier_location: sup?.location || '',
      };
    })
    .filter((o) => {
      if (status && o.status !== status) return false;
      if (supplierId && o.supplier_id !== supplierId) return false;
      if (!query) return true;
      return (
        normalizeText(o.id).includes(query) ||
        normalizeText(o.customer_name).includes(query) ||
        normalizeText(o.items_summary).includes(query) ||
        normalizeText(o.supplier_name).includes(query)
      );
    });
}

export async function createOrder(tenantId, data) {
  const nowIso = new Date().toISOString();
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `INSERT INTO orders (tenant_id, product_id, supplier_id, customer_phone, customer_name, quantity, total_sale, total_cost, status, pickup_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        tenantId,
        data.product_id,
        data.supplier_id,
        normalizePhone(data.customer_phone),
        data.customer_name || 'Cliente WhatsApp',
        Number(data.quantity || 1),
        Number(data.total_sale),
        Number(data.total_cost),
        data.status || 'solicitud',
        data.pickup_notes || 'Pendiente confirmación',
      ]
    );
    const list = await listOrders(tenantId);
    return list.find((o) => o.id === rows[0].id);
  }

  const order = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    product_id: data.product_id,
    supplier_id: data.supplier_id,
    customer_phone: normalizePhone(data.customer_phone),
    customer_name: data.customer_name || 'Cliente WhatsApp',
    quantity: Number(data.quantity || 1),
    total_sale: Number(data.total_sale),
    total_cost: Number(data.total_cost),
    status: data.status || 'solicitud',
    pickup_notes: data.pickup_notes || 'Pendiente confirmación',
    created_at: nowIso,
    updated_at: nowIso,
  };
  mem.orders.unshift(order);
  const list = await listOrders(tenantId);
  return list.find((o) => o.id === order.id);
}

export async function updateOrder(tenantId, id, patch) {
  const nowIso = new Date().toISOString();
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `UPDATE orders
       SET status = COALESCE($3, status),
           pickup_notes = COALESCE($4, pickup_notes),
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, patch.status ?? null, patch.pickup_notes ?? null]
    );
    if (!rows[0]) return null;
    const list = await listOrders(tenantId);
    return list.find((o) => o.id === id);
  }

  const order = mem.orders.find((o) => o.tenant_id === tenantId && o.id === id);
  if (!order) return null;
  if (patch.status !== undefined) order.status = patch.status;
  if (patch.pickup_notes !== undefined) order.pickup_notes = patch.pickup_notes;
  order.updated_at = nowIso;
  const list = await listOrders(tenantId);
  return list.find((o) => o.id === id);
}

export async function getDailyPickupRoute(tenantId) {
  const readyOrders = await listOrders(tenantId, { status: 'pedido_proveedor' });
  const grouped = new Map();

  readyOrders.forEach((order) => {
    const key = `${order.supplier_id}::${order.supplier_location}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        supplierId: order.supplier_id,
        supplierName: order.supplier_name,
        whatsappPhone: order.supplier_whatsapp,
        location: order.supplier_location,
        totalCostToPay: 0,
        orders: [],
      });
    }
    const stop = grouped.get(key);
    stop.totalCostToPay += order.total_cost;
    stop.orders.push({
      id: order.id,
      customerName: order.customer_name,
      itemsSummary: order.items_summary,
      pickupNotes: order.pickup_notes,
    });
  });

  return Array.from(grouped.values());
}

export async function listAgents(tenantId) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM agents WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    return rows;
  }
  return mem.agents.filter((a) => a.tenant_id === tenantId);
}

export async function toggleAgent(tenantId, agentId) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `UPDATE agents SET active = NOT active WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, agentId]
    );
    return rows[0] || null;
  }
  const agent = mem.agents.find((a) => a.tenant_id === tenantId && a.id === agentId);
  if (!agent) return null;
  agent.active = !agent.active;
  return agent;
}

// Crea un negocio nuevo a partir de la entrevista de la fábrica. Cada
// entrevista completada produce su propio tenant: nunca reutiliza uno existente.
export async function createTenantFromOnboarding(payload) {
  const {
    businessName,
    businessIndustry = 'Comercio sin inventario propio',
    activationName = 'Jarvis',
    defaultMargin = 40,
    handoffRule = 'Escalar al dueño por WhatsApp y pausar respuestas automáticas',
  } = payload;

  const tenant = {
    id: crypto.randomUUID(),
    name: String(businessName || 'Negocio nuevo').slice(0, 140),
    business_industry: String(businessIndustry).slice(0, 160),
    activation_name: String(activationName || 'Jarvis').slice(0, 60),
    default_margin: Number(defaultMargin),
    handoff_rule: handoffRule,
    wa_phone_number_id: null,
    status: 'onboarding',
    monthly_msg_limit: 1500,
    created_at: new Date().toISOString(),
  };

  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `INSERT INTO tenants (id, name, business_industry, activation_name, default_margin, handoff_rule, status, monthly_msg_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        tenant.id,
        tenant.name,
        tenant.business_industry,
        tenant.activation_name,
        tenant.default_margin,
        tenant.handoff_rule,
        tenant.status,
        tenant.monthly_msg_limit,
      ]
    );
    return rows[0];
  }

  mem.tenants.push(tenant);
  return tenant;
}

export async function deployOnboardingAgents(tenantId, payload) {
  const {
    businessName,
    businessIndustry = 'Comercio sin inventario propio',
    activationName = 'Jarvis',
    ownerWhatsapp,
    defaultMargin = 40,
    handoffRule = 'Escalar al dueño por WhatsApp y pausar respuestas automáticas',
  } = payload;

  const ownerDigits = normalizePhone(ownerWhatsapp);
  const codePrefix = activationName
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase() || 'JARV';
  const personalCode = `JRV-${codePrefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const publicCode = `JRV-PUB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  if (dbMode === 'postgres') {
    await pgPool.query(
      `UPDATE tenants
       SET name = $2,
           business_industry = $3,
           activation_name = $4,
           default_margin = $5,
           handoff_rule = $6,
           status = 'active'
       WHERE id = $1`,
      [
        tenantId,
        businessName,
        businessIndustry,
        activationName,
        Number(defaultMargin),
        handoffRule,
      ]
    );

    if (ownerDigits) {
      await upsertOwnerUser(tenantId, ownerDigits, `Dueño · ${businessName}`);
    }

    const personalTools = [
      'search_catalog_owner',
      'propose_create_product',
      'propose_purchase_order',
      'list_daily_pickups',
    ];
    const publicTools = [
      'search_public_catalog',
      'create_customer_order',
      'escalate_out_of_catalog',
    ];

    const personalPrompt = `Eres ${activationName}, asistente privado de ${businessName} (${businessIndustry}). Margen sugerido ${defaultMargin}%. Toda escritura requiere pending_actions.`;
    const publicPrompt = `Eres el asesor público de ${businessName}. Nunca reveles costos ni proveedores. Regla fuera de catálogo: ${handoffRule}`;

    const existing = await listAgents(tenantId);
    const prevPersonal = existing.find((a) => a.type === 'personal');
    const prevPublic = existing.find((a) => a.type === 'attention');

    let personalAgent;
    if (prevPersonal) {
      const { rows } = await pgPool.query(
        `UPDATE agents SET activation_code = $3, system_prompt = $4, active = true WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenantId, prevPersonal.id, personalCode, personalPrompt]
      );
      personalAgent = rows[0];
    } else {
      const { rows } = await pgPool.query(
        `INSERT INTO agents (tenant_id, type, access_policy, activation_code, system_prompt, allowed_tools, active)
         VALUES ($1, 'personal', 'owner_only', $2, $3, $4::jsonb, true) RETURNING *`,
        [tenantId, personalCode, personalPrompt, JSON.stringify(personalTools)]
      );
      personalAgent = rows[0];
    }

    let attentionAgent;
    if (prevPublic) {
      const { rows } = await pgPool.query(
        `UPDATE agents SET activation_code = $3, system_prompt = $4, active = true WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenantId, prevPublic.id, publicCode, publicPrompt]
      );
      attentionAgent = rows[0];
    } else {
      const { rows } = await pgPool.query(
        `INSERT INTO agents (tenant_id, type, access_policy, activation_code, system_prompt, allowed_tools, active)
         VALUES ($1, 'attention', 'public', $2, $3, $4::jsonb, true) RETURNING *`,
        [tenantId, publicCode, publicPrompt, JSON.stringify(publicTools)]
      );
      attentionAgent = rows[0];
    }

    await addAuditLog(tenantId, {
      actor: `owner:${ownerDigits || 'crm'}`,
      action: 'agents.onboarding_completed',
      result: `Activó ${activationName} y agente público para ${businessName} (${personalCode}).`,
    });

    return {
      tenantId,
      activationCode: personalCode,
      usageCaps: { monthlyMsgLimit: 1500, ownerCommandsPerDay: 250 },
      agents: { personal: personalAgent, attention: attentionAgent },
    };
  }

  const tenant = await getTenant(tenantId);
  if (tenant) {
    tenant.name = businessName;
    tenant.business_industry = businessIndustry;
    tenant.activation_name = activationName;
    tenant.default_margin = Number(defaultMargin);
    tenant.handoff_rule = handoffRule;
    tenant.status = 'active';
  }
  if (ownerDigits) {
    await upsertOwnerUser(tenantId, ownerDigits, `Dueño · ${businessName}`);
  }

  let personal = mem.agents.find(
    (a) => a.tenant_id === tenantId && a.type === 'personal'
  );
  if (!personal) {
    personal = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'personal',
      access_policy: 'owner_only',
      allowed_tools: [
        'search_catalog_owner',
        'propose_create_product',
        'propose_purchase_order',
        'list_daily_pickups',
      ],
      created_at: new Date().toISOString(),
    };
    mem.agents.unshift(personal);
  }
  personal.activation_code = personalCode;
  personal.system_prompt = `Eres ${activationName}, asistente privado de ${businessName} (${businessIndustry}). Margen base ${defaultMargin}%.`;
  personal.active = true;

  let attention = mem.agents.find(
    (a) => a.tenant_id === tenantId && a.type === 'attention'
  );
  if (!attention) {
    attention = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      type: 'attention',
      access_policy: 'public',
      allowed_tools: [
        'search_public_catalog',
        'create_customer_order',
        'escalate_out_of_catalog',
      ],
      created_at: new Date().toISOString(),
    };
    mem.agents.unshift(attention);
  }
  attention.activation_code = publicCode;
  attention.system_prompt = `Agente público de ${businessName}. Oculta costos y proveedores. Regla: ${handoffRule}`;
  attention.active = true;

  await addAuditLog(tenantId, {
    actor: `owner:${ownerDigits || 'crm'}`,
    action: 'agents.onboarding_completed',
    result: `Activó ${activationName} y agente público para ${businessName} (${personalCode}).`,
  });

  return {
    tenantId,
    activationCode: personalCode,
    usageCaps: {
      monthlyMsgLimit: tenant?.monthly_msg_limit || 1500,
      ownerCommandsPerDay: 250,
    },
    agents: { personal, attention },
  };
}

export async function getOrCreateConversation(
  tenantId,
  participantPhone,
  channelMode = 'client',
  agentId = null
) {
  const digits = normalizePhone(participantPhone);
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `INSERT INTO conversations (tenant_id, agent_id, participant_phone, channel_mode)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, participant_phone, channel_mode)
       DO UPDATE SET last_message_at = NOW(), agent_id = COALESCE(EXCLUDED.agent_id, conversations.agent_id)
       RETURNING *`,
      [tenantId, agentId, digits, channelMode]
    );
    return rows[0];
  }

  let conv = mem.conversations.find(
    (c) =>
      c.tenant_id === tenantId &&
      c.participant_phone === digits &&
      c.channel_mode === channelMode
  );
  if (!conv) {
    conv = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      agent_id: agentId,
      participant_phone: digits,
      channel_mode: channelMode,
      onboarding_step: channelMode === 'onboarding' ? 1 : null,
      context_json: {},
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    mem.conversations.push(conv);
  } else {
    conv.last_message_at = new Date().toISOString();
  }
  return conv;
}

export async function findActiveOnboardingConversation(tenantId, participantPhone) {
  const digits = normalizePhone(participantPhone);
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `SELECT * FROM conversations
       WHERE tenant_id = $1 AND participant_phone = $2 AND channel_mode = 'onboarding'
         AND onboarding_step BETWEEN 1 AND 5
       LIMIT 1`,
      [tenantId, digits]
    );
    return rows[0] || null;
  }
  return (
    mem.conversations.find(
      (c) =>
        c.tenant_id === tenantId &&
        c.participant_phone === digits &&
        c.channel_mode === 'onboarding' &&
        c.onboarding_step >= 1 &&
        c.onboarding_step <= 5
    ) || null
  );
}

export async function updateConversation(tenantId, convId, patch) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `UPDATE conversations
       SET channel_mode = COALESCE($3, channel_mode),
           onboarding_step = $4,
           context_json = COALESCE($5::jsonb, context_json),
           last_message_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        convId,
        patch.channel_mode ?? null,
        patch.onboarding_step !== undefined ? patch.onboarding_step : null,
        patch.context_json ? JSON.stringify(patch.context_json) : null,
      ]
    );
    return rows[0] || null;
  }
  const conv = mem.conversations.find((c) => c.tenant_id === tenantId && c.id === convId);
  if (!conv) return null;
  if (patch.channel_mode !== undefined) conv.channel_mode = patch.channel_mode;
  if (patch.onboarding_step !== undefined) conv.onboarding_step = patch.onboarding_step;
  if (patch.context_json !== undefined) conv.context_json = patch.context_json;
  conv.last_message_at = new Date().toISOString();
  return conv;
}

export async function insertInboundMessage(tenantId, msg) {
  const waId = msg.wa_message_id || null;
  if (dbMode === 'postgres') {
    if (waId) {
      const { rows } = await pgPool.query(
        `INSERT INTO messages (tenant_id, conversation_id, wa_message_id, direction, sender_phone, message_type, body_text, media_url, raw_payload)
         VALUES ($1,$2,$3,'inbound',$4,$5,$6,$7,$8::jsonb)
         ON CONFLICT (wa_message_id) DO NOTHING
         RETURNING *`,
        [
          tenantId,
          msg.conversation_id,
          waId,
          normalizePhone(msg.sender_phone),
          msg.message_type || 'text',
          msg.body_text || '',
          msg.media_url || null,
          JSON.stringify(msg.raw_payload || {}),
        ]
      );
      if (!rows[0]) return { inserted: false, message: null };
      return { inserted: true, message: rows[0] };
    }

    const { rows } = await pgPool.query(
      `INSERT INTO messages (tenant_id, conversation_id, direction, sender_phone, message_type, body_text, media_url, raw_payload)
       VALUES ($1,$2,'inbound',$3,$4,$5,$6,$7::jsonb)
       RETURNING *`,
      [
        tenantId,
        msg.conversation_id,
        normalizePhone(msg.sender_phone),
        msg.message_type || 'text',
        msg.body_text || '',
        msg.media_url || null,
        JSON.stringify(msg.raw_payload || {}),
      ]
    );
    return { inserted: true, message: rows[0] };
  }

  if (waId && mem.messages.some((m) => m.wa_message_id === waId)) {
    return { inserted: false, message: null };
  }
  const saved = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    conversation_id: msg.conversation_id,
    wa_message_id: waId,
    direction: 'inbound',
    sender_phone: normalizePhone(msg.sender_phone),
    message_type: msg.message_type || 'text',
    body_text: msg.body_text || '',
    media_url: msg.media_url || null,
    raw_payload: msg.raw_payload || {},
    created_at: new Date().toISOString(),
  };
  mem.messages.push(saved);
  return { inserted: true, message: saved };
}

export async function insertOutboundMessage(tenantId, msg) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `INSERT INTO messages (tenant_id, conversation_id, wa_message_id, direction, sender_phone, message_type, body_text, media_url)
       VALUES ($1,$2,$3,'outbound',$4,$5,$6,$7)
       RETURNING *`,
      [
        tenantId,
        msg.conversation_id,
        msg.wa_message_id || null,
        normalizePhone(msg.sender_phone || 'system'),
        msg.media_url ? 'image' : 'text',
        msg.body_text || '',
        msg.media_url || null,
      ]
    );
    return rows[0];
  }
  const saved = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    conversation_id: msg.conversation_id,
    wa_message_id: msg.wa_message_id || null,
    direction: 'outbound',
    sender_phone: normalizePhone(msg.sender_phone || 'system'),
    message_type: msg.media_url ? 'image' : 'text',
    body_text: msg.body_text || '',
    media_url: msg.media_url || null,
    created_at: new Date().toISOString(),
  };
  mem.messages.push(saved);
  return saved;
}

export async function listPendingActions(tenantId, status = 'pending') {
  const now = new Date();
  if (dbMode === 'postgres') {
    await pgPool.query(
      `UPDATE pending_actions SET status = 'expired'
       WHERE tenant_id = $1 AND status = 'pending' AND expires_at < NOW()`,
      [tenantId]
    );
    const { rows } = status
      ? await pgPool.query(
          `SELECT * FROM pending_actions WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC`,
          [tenantId, status]
        )
      : await pgPool.query(
          `SELECT * FROM pending_actions WHERE tenant_id = $1 ORDER BY created_at DESC`,
          [tenantId]
        );
    return rows;
  }

  mem.pending_actions.forEach((pa) => {
    if (pa.tenant_id === tenantId && pa.status === 'pending' && new Date(pa.expires_at) < now) {
      pa.status = 'expired';
    }
  });

  return mem.pending_actions
    .filter((pa) => pa.tenant_id === tenantId && (!status || pa.status === status))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function createPendingAction(tenantId, data) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + env.pendingActionTtlHours * 60 * 60 * 1000
  ).toISOString();

  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `INSERT INTO pending_actions (tenant_id, order_id, action_type, target_phone, payload_json, preview_text, status, expires_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,'pending',$7)
       RETURNING *`,
      [
        tenantId,
        data.order_id || null,
        data.action_type,
        normalizePhone(data.target_phone),
        JSON.stringify(data.payload_json || {}),
        data.preview_text,
        expiresAt,
      ]
    );
    return rows[0];
  }

  const action = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    order_id: data.order_id || null,
    action_type: data.action_type,
    target_phone: normalizePhone(data.target_phone),
    payload_json: data.payload_json || {},
    preview_text: data.preview_text,
    status: 'pending',
    expires_at: expiresAt,
    decided_at: null,
    created_at: now.toISOString(),
  };
  mem.pending_actions.unshift(action);
  return action;
}

export async function getPendingActionById(tenantId, actionId) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM pending_actions WHERE tenant_id = $1 AND id = $2 LIMIT 1',
      [tenantId, actionId]
    );
    return rows[0] || null;
  }
  return (
    mem.pending_actions.find((pa) => pa.tenant_id === tenantId && pa.id === actionId) ||
    null
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Busca una acción solo por su id, sin conocer el negocio (lo usa el botón de
// WhatsApp, que solo trae el id). Es la única consulta sin filtro de tenant_id:
// quien la llama DEBE comprobar enseguida que el teléfono es dueño del negocio
// de la acción (action.tenant_id) antes de mostrar o ejecutar nada.
export async function findPendingActionForDecision(actionId) {
  const id = String(actionId || '');
  if (!UUID_RE.test(id)) return null;
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM pending_actions WHERE id = $1 LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }
  return mem.pending_actions.find((pa) => pa.id === id) || null;
}

// Teléfonos de los dueños (rol owner) de un negocio.
export async function listOwnerPhones(tenantId) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `SELECT phone FROM users WHERE tenant_id = $1 AND role = 'owner' ORDER BY created_at`,
      [tenantId]
    );
    return rows.map((r) => normalizePhone(r.phone)).filter(Boolean);
  }
  return mem.users
    .filter((u) => u.tenant_id === tenantId && u.role === 'owner')
    .map((u) => normalizePhone(u.phone))
    .filter(Boolean);
}

export async function markPendingActionDecision(tenantId, actionId, decision) {
  const nowIso = new Date().toISOString();
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `UPDATE pending_actions
       SET status = $3, decided_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
       RETURNING *`,
      [tenantId, actionId, decision]
    );
    return rows[0] || null;
  }

  const pa = mem.pending_actions.find(
    (item) => item.tenant_id === tenantId && item.id === actionId && item.status === 'pending'
  );
  if (!pa) return null;
  pa.status = decision;
  pa.decided_at = nowIso;
  return pa;
}

export async function addAuditLog(tenantId, entry) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      `INSERT INTO audit_log (tenant_id, actor, action, result)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [tenantId, entry.actor, entry.action, entry.result]
    );
    return rows[0];
  }
  const saved = {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    actor: entry.actor,
    action: entry.action,
    result: entry.result,
    created_at: new Date().toISOString(),
  };
  mem.audit_log.unshift(saved);
  return saved;
}

export async function listAuditLog(tenantId, limit = 15) {
  if (dbMode === 'postgres') {
    const { rows } = await pgPool.query(
      'SELECT * FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2',
      [tenantId, limit]
    );
    return rows;
  }
  return mem.audit_log
    .filter((l) => l.tenant_id === tenantId)
    .slice(0, limit);
}

export async function getDashboardSummary(tenantId) {
  const [orders, products, suppliers, pendingActions, recentActivity] =
    await Promise.all([
      listOrders(tenantId),
      listProducts(tenantId),
      listSuppliers(tenantId),
      listPendingActions(tenantId, 'pending'),
      listAuditLog(tenantId, 10),
    ]);

  const totalSales = orders.reduce((acc, o) => acc + o.total_sale, 0);
  const totalCost = orders.reduce((acc, o) => acc + o.total_cost, 0);
  const projectedNetMargin = Math.max(0, totalSales - totalCost);
  const avgMarginPct =
    totalSales > 0 ? Math.round((projectedNetMargin / totalSales) * 1000) / 10 : 0;

  const pipelineCounts = {
    solicitud: 0,
    cotizando: 0,
    por_confirmar: 0,
    pedido_proveedor: 0,
    recogida_entrega: 0,
  };
  orders.forEach((o) => {
    if (pipelineCounts[o.status] !== undefined) {
      pipelineCounts[o.status] += 1;
    }
  });

  const pendingPickups = orders
    .filter((o) => o.status !== 'recogida_entrega' && o.status !== 'entregado')
    .map((o) => ({
      orderId: o.id,
      supplierName: o.supplier_name,
      supplierWhatsapp: o.supplier_whatsapp,
      location: o.supplier_location,
      pickupNotes: o.pickup_notes,
      itemsSummary: o.items_summary,
    }));

  return {
    kpis: {
      projectedNetMargin,
      totalSales,
      totalCost,
      avgMarginPct,
      activeOrdersCount: orders.length,
      pendingHitlCount: pendingActions.length,
      catalogCount: products.length,
      suppliersCount: suppliers.length,
    },
    pipelineCounts,
    pendingPickups,
    recentActivity,
  };
}
