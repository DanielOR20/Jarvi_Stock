import express from 'express';
import {
  addAuditLog,
  createOrder,
  createPendingAction,
  createProduct,
  createSupplier,
  deployOnboardingAgents,
  getDailyPickupRoute,
  getDashboardSummary,
  getPendingActionById,
  getTenant,
  getTenants,
  listAgents,
  listOrders,
  listPendingActions,
  listProducts,
  listSuppliers,
  markPendingActionDecision,
  toggleAgent,
  updateOrder,
  updateProduct,
  updateSupplier,
} from '../config/db.js';
import { DEFAULT_TENANT_ID } from '../db/seed.js';
import { processMessage } from '../services/agentRouter.js';
import { sendTextMessage } from '../services/whatsappOutbound.js';

const router = express.Router();

function resolveTenantId(req) {
  return (
    req.headers['x-tenant-id'] ||
    req.query.tenantId ||
    req.body?.tenantId ||
    DEFAULT_TENANT_ID
  );
}

// GET /api/tenants
router.get('/tenants', async (_req, res, next) => {
  try {
    const tenants = await getTenants();
    res.json({ tenants });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const summary = await getDashboardSummary(tenant.id);
    res.json({ tenant, ...summary });
  } catch (err) {
    next(err);
  }
});

// PRODUCTOS
router.get('/products', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const products = await listProducts(tenant.id, {
      q: req.query.q || '',
      category: req.query.category || '',
      supplierId: req.query.supplierId || '',
      active: req.query.active === 'all' ? null : req.query.active !== 'false',
    });
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const { name, cost_price, sale_price } = req.body || {};
    if (!name || cost_price === undefined || sale_price === undefined) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, cost_price y sale_price son obligatorios.',
        },
      });
    }
    const product = await createProduct(tenant.id, req.body);
    await addAuditLog(tenant.id, {
      actor: 'owner:crm',
      action: 'product.created',
      result: `Agregó "${product.name}" al catálogo (${product.margin_percent}% margen).`,
    });
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
});

router.patch('/products/:id', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const product = await updateProduct(tenant.id, req.params.id, req.body || {});
    if (!product) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Producto no encontrado.' },
      });
    }
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

// PROVEEDORES
router.get('/suppliers', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const suppliers = await listSuppliers(tenant.id, req.query.q || '');
    res.json({ suppliers });
  } catch (err) {
    next(err);
  }
});

router.post('/suppliers', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    if (!req.body?.name || !(req.body?.whatsapp_phone || req.body?.whatsapp)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name y whatsapp_phone son obligatorios.',
        },
      });
    }
    const supplier = await createSupplier(tenant.id, req.body);
    res.status(201).json({ supplier });
  } catch (err) {
    next(err);
  }
});

router.patch('/suppliers/:id', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const supplier = await updateSupplier(tenant.id, req.params.id, req.body || {});
    if (!supplier) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Proveedor no encontrado.' },
      });
    }
    res.json({ supplier });
  } catch (err) {
    next(err);
  }
});

// PEDIDOS Y LOGISTICA
router.get('/orders', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const orders = await listOrders(tenant.id, {
      status: req.query.status || '',
      supplierId: req.query.supplierId || '',
      q: req.query.q || '',
    });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

router.get('/orders/daily-pickup-route', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const stops = await getDailyPickupRoute(tenant.id);
    res.json({ stops });
  } catch (err) {
    next(err);
  }
});

router.post('/orders', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const { product_id, supplier_id, total_sale, total_cost } = req.body || {};
    if (!product_id || !supplier_id || total_sale === undefined || total_cost === undefined) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'product_id, supplier_id, total_sale y total_cost son obligatorios.',
        },
      });
    }
    const order = await createOrder(tenant.id, req.body);
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
});

router.patch('/orders/:id', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const order = await updateOrder(tenant.id, req.params.id, req.body || {});
    if (!order) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Pedido no encontrado.' },
      });
    }
    await addAuditLog(tenant.id, {
      actor: 'owner:crm',
      action: 'order.updated',
      result: `Pedido ${order.id} actualizado a etapa "${order.status}".`,
    });
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

// PENDING ACTIONS (HITL)
router.get('/pending-actions', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const status = req.query.status === 'all' ? '' : req.query.status || 'pending';
    const pendingActions = await listPendingActions(tenant.id, status);
    res.json({ pendingActions });
  } catch (err) {
    next(err);
  }
});

router.post('/pending-actions', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const { action_type, target_phone, preview_text, payload_json, order_id } =
      req.body || {};
    if (!action_type || !target_phone || !preview_text) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'action_type, target_phone y preview_text son obligatorios.',
        },
      });
    }
    const action = await createPendingAction(tenant.id, {
      action_type,
      target_phone,
      preview_text,
      payload_json,
      order_id,
    });
    res.status(201).json({ action });
  } catch (err) {
    next(err);
  }
});

router.post('/pending-actions/:id/approve', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const existing = await getPendingActionById(tenant.id, req.params.id);
    if (!existing) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Accion pendiente no encontrada.' },
      });
    }
    if (existing.status !== 'pending') {
      return res.status(409).json({
        error: {
          code: 'ALREADY_DECIDED',
          message: `La accion ya se encuentra en estado "${existing.status}".`,
        },
      });
    }

    const action = await markPendingActionDecision(tenant.id, req.params.id, 'approved');
    let createdProduct = null;
    let updatedOrder = null;
    let whatsappDelivery = null;

    if (action.action_type === 'create_product' && action.payload_json?.product) {
      const prodPayload = action.payload_json.product;
      let supplierId = prodPayload.supplier_id || null;
      if (!supplierId && action.payload_json?.supplier) {
        const sup = await createSupplier(tenant.id, action.payload_json.supplier);
        supplierId = sup.id;
      }
      if (!supplierId) {
        const allSups = await listSuppliers(tenant.id);
        supplierId = allSups[0]?.id;
      }
      createdProduct = await createProduct(tenant.id, {
        ...prodPayload,
        supplier_id: supplierId,
      });
      await addAuditLog(tenant.id, {
        actor: 'owner:hitl',
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
        updatedOrder = await updateOrder(tenant.id, action.order_id, {
          status: nextStage,
          pickup_notes:
            nextStage === 'pedido_proveedor'
              ? 'OC enviada · Recoger hoy'
              : 'Cotización enviada al cliente',
        });
      }

      whatsappDelivery = await sendTextMessage({
        toPhone: action.target_phone,
        body: action.preview_text,
      });

      await addAuditLog(tenant.id, {
        actor: 'owner:hitl',
        action: 'pending_action.approved',
        result: `Ejecutó ${action.action_type} hacia ${action.target_phone}.`,
      });
    } else {
      await addAuditLog(tenant.id, {
        actor: 'owner:hitl',
        action: 'pending_action.approved',
        result: `Atendió traspaso humano: ${action.payload_json?.title || action.id}`,
      });
    }

    res.json({ action, createdProduct, updatedOrder, whatsappDelivery });
  } catch (err) {
    next(err);
  }
});

router.post('/pending-actions/:id/reject', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const existing = await getPendingActionById(tenant.id, req.params.id);
    if (!existing) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Accion pendiente no encontrada.' },
      });
    }
    if (existing.status !== 'pending') {
      return res.status(409).json({
        error: {
          code: 'ALREADY_DECIDED',
          message: `La accion ya se encuentra en estado "${existing.status}".`,
        },
      });
    }

    const action = await markPendingActionDecision(tenant.id, req.params.id, 'rejected');
    await addAuditLog(tenant.id, {
      actor: 'owner:hitl',
      action: 'pending_action.rejected',
      result: `Descartó acción: ${action.payload_json?.title || action.action_type}.`,
    });
    res.json({ action });
  } catch (err) {
    next(err);
  }
});

// AGENTES & ONBOARDING 5 PREGUNTAS
router.get('/agents', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const agents = await listAgents(tenant.id);
    res.json({ agents, tenant });
  } catch (err) {
    next(err);
  }
});

router.patch('/agents/:id/toggle', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const agent = await toggleAgent(tenant.id, req.params.id);
    if (!agent) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Agente no encontrado.' },
      });
    }
    res.json({ agent });
  } catch (err) {
    next(err);
  }
});

router.post('/agents/onboarding', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const { businessName, activationName, ownerWhatsapp } = req.body || {};
    if (!businessName || !activationName || !ownerWhatsapp) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'businessName, activationName y ownerWhatsapp son obligatorios.',
        },
      });
    }
    const deployed = await deployOnboardingAgents(tenant.id, req.body);
    res.status(201).json(deployed);
  } catch (err) {
    next(err);
  }
});

// MOTOR CONVERSACIONAL INTERNO / SIMULADOR
router.post('/engine/process-message', async (req, res, next) => {
  try {
    const tenant = await getTenant(resolveTenantId(req));
    const { fromPhone, messageId, text, mediaUrl, timestamp, forceMode } =
      req.body || {};
    if (!fromPhone || (!text && !mediaUrl)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'fromPhone y text (o mediaUrl) son obligatorios.',
        },
      });
    }
    const result = await processMessage({
      tenantId: tenant.id,
      fromPhone,
      messageId,
      text: text || '',
      mediaUrl: mediaUrl || null,
      timestamp,
      forceMode: forceMode || null,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
