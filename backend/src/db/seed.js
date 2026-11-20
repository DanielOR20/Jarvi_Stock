import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';

export const DEFAULT_TENANT_ID = '11111111-1111-4111-8111-111111111101';

export function buildSeedData() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const tenants = [
    {
      id: DEFAULT_TENANT_ID,
      name: 'NovaGadgets CR',
      business_industry: 'Tecnología y accesorios sin inventario propio',
      activation_name: 'Jarvis',
      default_margin: 40,
      handoff_rule: 'Escalar al dueño por WhatsApp y pausar respuestas automáticas',
      wa_phone_number_id: env.whatsapp.phoneNumberId || '109283746501928',
      status: 'active',
      monthly_msg_limit: 1500,
      created_at: now.toISOString(),
    },
    {
      id: '11111111-1111-4111-8111-111111111102',
      name: 'Aura Home Studio',
      business_industry: 'Hogar e iluminación inteligente',
      activation_name: 'Aura',
      default_margin: 45,
      handoff_rule: 'Tomar nombre y necesidad del cliente, y prometer respuesta en 10 min',
      wa_phone_number_id: null,
      status: 'active',
      monthly_msg_limit: 1500,
      created_at: now.toISOString(),
    },
  ];

  const users = [
    {
      id: '22222222-2222-4222-8222-222222222201',
      tenant_id: DEFAULT_TENANT_ID,
      phone: '50688888888',
      name: 'Dueño Principal',
      role: 'owner',
      created_at: now.toISOString(),
    },
    {
      id: '22222222-2222-4222-8222-222222222202',
      tenant_id: DEFAULT_TENANT_ID,
      phone: '50682914412',
      name: 'Valeria Mendoza',
      role: 'contact',
      created_at: now.toISOString(),
    },
  ];

  const suppliers = [
    {
      id: '33333333-3333-4333-8333-333333333301',
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Importadora Tech Centro',
      whatsapp_phone: '50688412310',
      location: 'San José Centro, Av. Central · Local 14B',
      notes: 'Apartado inmediato por WhatsApp con folio numérico.',
      created_at: now.toISOString(),
    },
    {
      id: '33333333-3333-4333-8333-333333333302',
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Distribuidora Lumen & Hogar',
      whatsapp_phone: '50687239041',
      location: 'Escazú, Plaza Roble · Bodega 4',
      notes: 'Entrega empaque neutro listo para dropshipping local.',
      created_at: now.toISOString(),
    },
    {
      id: '33333333-3333-4333-8333-333333333303',
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Mayorista Kinetix Audio',
      whatsapp_phone: '50683904458',
      location: 'Curridabat, Plaza del Sol · Nivel 1',
      notes: 'Garantía directa 90 días y reemplazo en mostrador.',
      created_at: now.toISOString(),
    },
    {
      id: '33333333-3333-4333-8333-333333333304',
      tenant_id: DEFAULT_TENANT_ID,
      name: 'Atelier Café & Lifestyle',
      whatsapp_phone: '50686127784',
      location: 'Barrio Escalante, San José · Casa 28',
      notes: 'Acepta recolección por mensajero con código QR.',
      created_at: now.toISOString(),
    },
  ];

  const products = [
    {
      id: '44444444-4444-4444-8444-444444444401',
      tenant_id: DEFAULT_TENANT_ID,
      supplier_id: '33333333-3333-4333-8333-333333333303',
      sku: 'JRV-AUD-01',
      category: 'Audio',
      name: 'Audífonos Studio ANC Pro',
      description: 'Cancelación activa híbrida de 42dB, batería 40h y carga rápida USB-C.',
      image_url: '/products/audifonos-anc.svg',
      cost_price: 18500,
      sale_price: 36900,
      active: true,
      created_at: now.toISOString(),
    },
    {
      id: '44444444-4444-4444-8444-444444444402',
      tenant_id: DEFAULT_TENANT_ID,
      supplier_id: '33333333-3333-4333-8333-333333333301',
      sku: 'JRV-WTC-09',
      category: 'Wearables',
      name: 'Smartwatch Obsidian S9',
      description: 'Pantalla AMOLED 1.9", llamadas Bluetooth y resistencia al agua IP68.',
      image_url: '/products/smartwatch-pro.svg',
      cost_price: 24000,
      sale_price: 44900,
      active: true,
      created_at: now.toISOString(),
    },
    {
      id: '44444444-4444-4444-8444-444444444403',
      tenant_id: DEFAULT_TENANT_ID,
      supplier_id: '33333333-3333-4333-8333-333333333302',
      sku: 'JRV-LMP-04',
      category: 'Home Office',
      name: 'Lámpara Escritorio MagSafe',
      description: 'Brazo minimalista aluminio con base de carga inalámbrica magnética 15W.',
      image_url: '/products/lampara-mag.svg',
      cost_price: 11200,
      sale_price: 23900,
      active: true,
      created_at: now.toISOString(),
    },
    {
      id: '44444444-4444-4444-8444-444444444404',
      tenant_id: DEFAULT_TENANT_ID,
      supplier_id: '33333333-3333-4333-8333-333333333301',
      sku: 'JRV-KBD-75',
      category: 'Periféricos',
      name: 'Teclado Mecánico Low-Profile 75%',
      description: 'Switches táctiles silenciosos, tri-modo inalámbrico y chasis aluminio.',
      image_url: '/products/teclado-mecanico.svg',
      cost_price: 29500,
      sale_price: 56900,
      active: true,
      created_at: now.toISOString(),
    },
    {
      id: '44444444-4444-4444-8444-444444444405',
      tenant_id: DEFAULT_TENANT_ID,
      supplier_id: '33333333-3333-4333-8333-333333333304',
      sku: 'JRV-BAG-12',
      category: 'Lifestyle',
      name: 'Mochila Urban Tech Impermeable',
      description: 'Compartimento acolchado 16", puerto de carga externo y cierres sellados.',
      image_url: '/products/mochila-tech.svg',
      cost_price: 14500,
      sale_price: 31500,
      active: true,
      created_at: now.toISOString(),
    },
    {
      id: '44444444-4444-4444-8444-444444444406',
      tenant_id: DEFAULT_TENANT_ID,
      supplier_id: '33333333-3333-4333-8333-333333333304',
      sku: 'JRV-COF-02',
      category: 'Lifestyle',
      name: 'Cafetera Espresso Portátil USB-C',
      description: 'Presión 20 bares compatible con cápsulas y café molido para viaje.',
      image_url: '/products/cafetera-portatil.svg',
      cost_price: 19800,
      sale_price: 41900,
      active: true,
      created_at: now.toISOString(),
    },
  ];

  const orders = [
    {
      id: '55555555-5555-4555-8555-555555555501',
      tenant_id: DEFAULT_TENANT_ID,
      product_id: '44444444-4444-4444-8444-444444444402',
      supplier_id: '33333333-3333-4333-8333-333333333301',
      customer_phone: '50682914412',
      customer_name: 'Valeria Mendoza',
      quantity: 2,
      total_sale: 89800,
      total_cost: 48000,
      status: 'por_confirmar',
      pickup_notes: 'Pendiente aprobar OC (17:00 hrs) · Rohrmoser, San José',
      created_at: new Date(now.getTime() - 4 * 60000).toISOString(),
      updated_at: new Date(now.getTime() - 4 * 60000).toISOString(),
    },
    {
      id: '55555555-5555-4555-8555-555555555502',
      tenant_id: DEFAULT_TENANT_ID,
      product_id: '44444444-4444-4444-8444-444444444401',
      supplier_id: '33333333-3333-4333-8333-333333333303',
      customer_phone: '50687731190',
      customer_name: 'Diego Villalobos',
      quantity: 1,
      total_sale: 36900,
      total_cost: 18500,
      status: 'pedido_proveedor',
      pickup_notes: 'Apartado listo · Recoger hoy 16:30 · Los Yoses, Montes de Oca',
      created_at: new Date(now.getTime() - 19 * 60000).toISOString(),
      updated_at: new Date(now.getTime() - 19 * 60000).toISOString(),
    },
    {
      id: '55555555-5555-4555-8555-555555555503',
      tenant_id: DEFAULT_TENANT_ID,
      product_id: '44444444-4444-4444-8444-444444444404',
      supplier_id: '33333333-3333-4333-8333-333333333301',
      customer_phone: '50686098831',
      customer_name: 'Sofía Castellanos',
      quantity: 1,
      total_sale: 56900,
      total_cost: 29500,
      status: 'recogida_entrega',
      pickup_notes: 'Recolectado · Mensajero en ruta hacia Escazú Centro',
      created_at: new Date(now.getTime() - 36 * 60000).toISOString(),
      updated_at: new Date(now.getTime() - 36 * 60000).toISOString(),
    },
    {
      id: '55555555-5555-4555-8555-555555555504',
      tenant_id: DEFAULT_TENANT_ID,
      product_id: '44444444-4444-4444-8444-444444444406',
      supplier_id: '33333333-3333-4333-8333-333333333304',
      customer_phone: '50684419920',
      customer_name: 'Mateo Rincón',
      quantity: 1,
      total_sale: 41900,
      total_cost: 19800,
      status: 'cotizando',
      pickup_notes: 'Esperando confirmación cliente · Santa Ana, Lindora',
      created_at: new Date(now.getTime() - 12 * 60000).toISOString(),
      updated_at: new Date(now.getTime() - 12 * 60000).toISOString(),
    },
  ];

  const agents = [
    {
      id: '66666666-6666-4666-8666-666666666601',
      tenant_id: DEFAULT_TENANT_ID,
      type: 'personal',
      access_policy: 'owner_only',
      activation_code: 'JRV-JARV-2026',
      system_prompt:
        'Asistente privado Jarvis para el dueño. Puede consultar costos, márgenes y proveedores, y encolar altas de producto y órdenes de compra en pending_actions.',
      allowed_tools: [
        'search_catalog_owner',
        'propose_create_product',
        'propose_purchase_order',
        'list_daily_pickups',
      ],
      active: true,
      created_at: now.toISOString(),
    },
    {
      id: '66666666-6666-4666-8666-666666666602',
      tenant_id: DEFAULT_TENANT_ID,
      type: 'attention',
      access_policy: 'public',
      activation_code: 'JRV-PUB-2026',
      system_prompt:
        'Agente público B2C. Responde con foto, descripción y precio de venta. Nunca revela costos ni proveedores. Registra pedidos en estado solicitud.',
      allowed_tools: [
        'search_public_catalog',
        'create_customer_order',
        'escalate_out_of_catalog',
      ],
      active: true,
      created_at: now.toISOString(),
    },
  ];

  const pending_actions = [
    {
      id: '77777777-7777-4777-8777-777777777701',
      tenant_id: DEFAULT_TENANT_ID,
      order_id: '55555555-5555-4555-8555-555555555501',
      action_type: 'purchase_order',
      target_phone: '50688412310',
      payload_json: {
        title: 'Enviar OC a Importadora Tech Centro',
        agentName: 'Jarvis (Dueño)',
        supplierId: '33333333-3333-4333-8333-333333333301',
        supplierName: 'Importadora Tech Centro',
        nextStage: 'pedido_proveedor',
        impactSummary: 'Costo ₡48,000 · Venta ₡89,800 · Margen ₡41,800 (46.5%)',
      },
      preview_text:
        'Hola Ricardo (Importadora Tech Centro), confirmamos orden de 2x Smartwatch Obsidian S9 (₡24,000 c/u). Pasamos a recoger hoy a las 17:00 hrs en Local 14B.',
      status: 'pending',
      expires_at: expiresAt,
      decided_at: null,
      created_at: new Date(now.getTime() - 4 * 60000).toISOString(),
    },
    {
      id: '77777777-7777-4777-8777-777777777702',
      tenant_id: DEFAULT_TENANT_ID,
      order_id: null,
      action_type: 'create_product',
      target_phone: '50688412310',
      payload_json: {
        title: 'Guardar "Cargador GaN 100W Dual USB-C" en catálogo',
        agentName: 'Jarvis (Catálogo)',
        supplierName: 'Importadora Tech Centro',
        impactSummary: 'Costo ₡10,900 · Venta ₡23,500 · Margen ₡12,600 (53.6%)',
        product: {
          sku: 'JRV-GAN-100',
          name: 'Cargador GaN 100W Dual USB-C',
          description: 'Carga rápida 100W dual para laptop y teléfono con protección térmica.',
          category: 'Energía & Carga',
          supplier_id: '33333333-3333-4333-8333-333333333301',
          image_url: '/products/cargador-gan.svg',
          cost_price: 10900,
          sale_price: 23500,
        },
      },
      preview_text:
        'Extraído de lista PDF enviada por Importadora Tech Centro hoy 11:40. SKU sugerido: JRV-GAN-100.',
      status: 'pending',
      expires_at: expiresAt,
      decided_at: null,
      created_at: new Date(now.getTime() - 11 * 60000).toISOString(),
    },
    {
      id: '77777777-7777-4777-8777-777777777703',
      tenant_id: DEFAULT_TENANT_ID,
      order_id: '55555555-5555-4555-8555-555555555504',
      action_type: 'quote_approval',
      target_phone: '50684419920',
      payload_json: {
        title: 'Confirmar cotización a Mateo Rincón',
        agentName: 'Agente Atención al Cliente',
        supplierName: 'Atelier Café & Lifestyle',
        nextStage: 'por_confirmar',
        impactSummary: 'Costo ₡19,800 · Venta ₡41,900 · Margen ₡22,100 (52.7%)',
      },
      preview_text:
        '¡Hola Mateo! Confirmamos disponibilidad inmediata de tu Cafetera Espresso Portátil USB-C por ₡41,900 con entrega hoy en Santa Ana. ¿Confirmamos tu pedido?',
      status: 'pending',
      expires_at: expiresAt,
      decided_at: null,
      created_at: new Date(now.getTime() - 17 * 60000).toISOString(),
    },
  ];

  const audit_log = [
    {
      id: '88888888-8888-4888-8888-888888888801',
      tenant_id: DEFAULT_TENANT_ID,
      actor: 'agent:personal',
      action: 'pending_action.created',
      result: 'Validó stock de 2x Smartwatch Obsidian S9 y preparó OC para revisión HITL.',
      created_at: new Date(now.getTime() - 4 * 60000).toISOString(),
    },
    {
      id: '88888888-8888-4888-8888-888888888802',
      tenant_id: DEFAULT_TENANT_ID,
      actor: 'agent:personal',
      action: 'catalog.proposal',
      result: 'Propuso alta de Cargador GaN 100W Dual USB-C con 53.6% de margen.',
      created_at: new Date(now.getTime() - 11 * 60000).toISOString(),
    },
    {
      id: '88888888-8888-4888-8888-888888888803',
      tenant_id: DEFAULT_TENANT_ID,
      actor: 'agent:attention',
      action: 'quote.prepared',
      result: 'Preparó cotización de Cafetera Espresso Portátil USB-C para Mateo Rincón.',
      created_at: new Date(now.getTime() - 17 * 60000).toISOString(),
    },
  ];

  return {
    tenants,
    users,
    suppliers,
    products,
    orders,
    agents,
    conversations: [],
    messages: [],
    pending_actions,
    audit_log,
  };
}

export async function seedPostgres(pool) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schemaSql);

  const data = buildSeedData();

  for (const t of data.tenants) {
    await pool.query(
      `INSERT INTO tenants (id, name, business_industry, activation_name, default_margin, handoff_rule, wa_phone_number_id, status, monthly_msg_limit, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO NOTHING`,
      [
        t.id,
        t.name,
        t.business_industry,
        t.activation_name,
        t.default_margin,
        t.handoff_rule,
        t.wa_phone_number_id,
        t.status,
        t.monthly_msg_limit,
        t.created_at,
      ]
    );
  }

  for (const u of data.users) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, phone, name, role, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.tenant_id, u.phone, u.name, u.role, u.created_at]
    );
  }

  for (const s of data.suppliers) {
    await pool.query(
      `INSERT INTO suppliers (id, tenant_id, name, whatsapp_phone, location, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.tenant_id, s.name, s.whatsapp_phone, s.location, s.notes, s.created_at]
    );
  }

  for (const p of data.products) {
    await pool.query(
      `INSERT INTO products (id, tenant_id, supplier_id, sku, category, name, description, image_url, cost_price, sale_price, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO NOTHING`,
      [
        p.id,
        p.tenant_id,
        p.supplier_id,
        p.sku,
        p.category,
        p.name,
        p.description,
        p.image_url,
        p.cost_price,
        p.sale_price,
        p.active,
        p.created_at,
      ]
    );
  }

  for (const o of data.orders) {
    await pool.query(
      `INSERT INTO orders (id, tenant_id, product_id, supplier_id, customer_phone, customer_name, quantity, total_sale, total_cost, status, pickup_notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        o.id,
        o.tenant_id,
        o.product_id,
        o.supplier_id,
        o.customer_phone,
        o.customer_name,
        o.quantity,
        o.total_sale,
        o.total_cost,
        o.status,
        o.pickup_notes,
        o.created_at,
        o.updated_at,
      ]
    );
  }

  for (const a of data.agents) {
    await pool.query(
      `INSERT INTO agents (id, tenant_id, type, access_policy, activation_code, system_prompt, allowed_tools, active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [
        a.id,
        a.tenant_id,
        a.type,
        a.access_policy,
        a.activation_code,
        a.system_prompt,
        JSON.stringify(a.allowed_tools),
        a.active,
        a.created_at,
      ]
    );
  }

  for (const pa of data.pending_actions) {
    await pool.query(
      `INSERT INTO pending_actions (id, tenant_id, order_id, action_type, target_phone, payload_json, preview_text, status, expires_at, decided_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        pa.id,
        pa.tenant_id,
        pa.order_id,
        pa.action_type,
        pa.target_phone,
        JSON.stringify(pa.payload_json),
        pa.preview_text,
        pa.status,
        pa.expires_at,
        pa.decided_at,
        pa.created_at,
      ]
    );
  }

  for (const log of data.audit_log) {
    await pool.query(
      `INSERT INTO audit_log (id, tenant_id, actor, action, result, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [log.id, log.tenant_id, log.actor, log.action, log.result, log.created_at]
    );
  }
}

const isCliRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliRun) {
  if (!env.databaseUrl) {
    console.log('[seed] DATABASE_URL no definido; no hay PostgreSQL remoto que poblar.');
    process.exit(0);
  }
  const pool = new pg.Pool({ connectionString: env.databaseUrl });
  try {
    await seedPostgres(pool);
    console.log('[seed] Esquema y datos iniciales aplicados en PostgreSQL correctamente.');
  } finally {
    await pool.end();
  }
}
