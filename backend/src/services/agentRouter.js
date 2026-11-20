import {
  addAuditLog,
  calculateMargin,
  createOrder,
  createPendingAction,
  createTenantFromOnboarding,
  deployOnboardingAgents,
  FACTORY_TENANT_ID,
  findActiveOnboardingConversation,
  findUserByPhone,
  getDailyPickupRoute,
  getOrCreateConversation,
  getTenant,
  insertOutboundMessage,
  listAgents,
  listPendingActions,
  listProducts,
  listSuppliers,
  normalizePhone,
  updateConversation,
} from '../config/db.js';
import { resolveRoute, stripAgentCode } from './messageRouter.js';
import { buildAgentQrUrl, buildAgentWaLink } from './shareLinks.js';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatColones(value) {
  return `₡${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
}

function findMatchingProducts(query, productList) {
  const stopWords = new Set([
    'quien',
    'distribuye',
    'vende',
    'proveedor',
    'distribuidor',
    'tienen',
    'tiene',
    'hay',
    'disponible',
    'disponibles',
    'cuanto',
    'cuesta',
    'vale',
    'precio',
    'quiero',
    'comprar',
    'pedir',
    'ordenar',
    'dame',
    'busco',
    'necesito',
    'hola',
    'buenas',
    'para',
    'con',
    'del',
    'las',
    'los',
    'una',
    'uno',
    'por',
    'favor',
    'jarvis',
  ]);

  const cleaned = normalizeText(query).replace(/[¿?¡!.,:;()]/g, ' ');
  const tokens = cleaned
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token) && !/^\d+$/.test(token));

  if (tokens.length === 0) return [];

  return productList
    .map((product) => {
      const haystack = normalizeText(
        `${product.name} ${product.description || ''} ${product.category} ${product.sku || ''} ${product.supplier_name || ''}`
      );
      let score = 0;
      tokens.forEach((token) => {
        if (haystack.includes(token)) score += 1;
      });
      return { product, score };
    })
    .filter(
      (entry) =>
        entry.score >= Math.min(2, tokens.length) ||
        (tokens.length === 1 && entry.score === 1)
    )
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);
}

function parseOwnerSaveCommand(text, defaultMarginPct = 40) {
  const normalized = normalizeText(text);
  const hasCreateVerb =
    normalized.includes('guarda') ||
    normalized.includes('agrega') ||
    normalized.includes('crea') ||
    normalized.includes('registra') ||
    normalized.includes('nuevo producto');
  const hasCostAndSale =
    normalized.includes('costo') && normalized.includes('venta');

  if (!hasCreateVerb && !hasCostAndSale) return null;

  const costMatch = text.match(/costo\s*(?:de|:)?\s*[₡$]?\s*([\d.,]+)/i);
  const saleMatch = text.match(/venta\s*(?:de|:)?\s*[₡$]?\s*([\d.,]+)/i);

  const costPrice = costMatch
    ? Number(costMatch[1].replace(/[.,](?=\d{3}\b)/g, '').replace(/,/g, ''))
    : 12000;
  const salePrice = saleMatch
    ? Number(saleMatch[1].replace(/[.,](?=\d{3}\b)/g, '').replace(/,/g, ''))
    : Math.round(costPrice / Math.max(0.1, 1 - defaultMarginPct / 100));

  const supplierSection = text.match(/proveedor\s*(?:es|:)?\s*([^\n]+)/i);
  let supplierName = 'Proveedor Local';
  let supplierPhone = '50688888888';

  if (supplierSection) {
    const rawSup = supplierSection[1].split(',')[0].trim();
    const phoneMatch = rawSup.match(/(\+?[\d][\d\s-]{6,})/);
    if (phoneMatch) {
      const digits = normalizePhone(phoneMatch[1]);
      supplierPhone = digits.length === 8 ? `506${digits}` : digits;
      supplierName = rawSup.replace(phoneMatch[1], '').trim() || 'Proveedor Local';
    } else if (rawSup) {
      supplierName = rawSup;
    }
  }

  let productName = text
    .replace(
      /^(?:jarvis[:,]?\s*)?(?:guarda|guardar|agrega|agregar|crea|crear|registra|registrar|nuevo producto)\s*/i,
      ''
    )
    .replace(/,?\s*costo\s*(?:de|:)?\s*[₡$]?\s*[\d.,]+/gi, '')
    .replace(/,?\s*venta\s*(?:de|:)?\s*[₡$]?\s*[\d.,]+/gi, '')
    .replace(/,?\s*proveedor\s*[^\n]+/gi, '')
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .trim();

  if (!productName) {
    productName = 'Producto Nuevo WhatsApp';
  } else {
    productName = productName.charAt(0).toUpperCase() + productName.slice(1);
  }

  return {
    productName,
    costPrice,
    salePrice,
    supplierName,
    supplierPhone,
  };
}

function toPublicProduct(product) {
  return {
    id: product.id,
    sku: product.sku,
    category: product.category,
    name: product.name,
    description: product.description,
    image_url: product.image_url,
    sale_price: Number(product.sale_price),
  };
}

// La entrevista vive en el negocio interno de la fábrica (FACTORY_TENANT_ID).
// Al terminar crea un negocio NUEVO cuyo dueño es quien escribió (fromPhone):
// el dueño nunca se escribe a mano, para que nadie pueda apropiarse de otro número.
const ONBOARDING_TOTAL = 4;

function onboardingReply(replyText) {
  return { replyText, replyMediaUrl: null, createdPendingAction: null, mode: 'onboarding' };
}

async function handleOnboardingStep(fromPhone, text, existingConv) {
  const tenantId = FACTORY_TENANT_ID;
  const conv =
    existingConv || (await getOrCreateConversation(tenantId, fromPhone, 'onboarding'));
  const normalized = normalizeText(text).trim();

  if (!existingConv || normalized.includes('#onboarding') || normalized.includes('#activar')) {
    await updateConversation(tenantId, conv.id, {
      channel_mode: 'onboarding',
      onboarding_step: 1,
      context_json: {},
    });
    return onboardingReply(
      `¡Hola! Soy el configurador de Jarvi Stock (${ONBOARDING_TOTAL} preguntas rápidas). Al terminar tendrás tu propio negocio con dos agentes, y este número quedará como dueño.\n\nPregunta 1/${ONBOARDING_TOTAL}: ¿Cuál es el nombre de tu negocio y su giro comercial? (Ej. "Repuestos MotoASAP - Repuestos de moto")`
    );
  }

  const step = conv.onboarding_step || 1;
  const ctx = { ...(conv.context_json || {}) };

  if (step === 1) {
    const parts = text.split(/[-–|]/);
    ctx.businessName = (parts[0] || text).trim() || 'Negocio nuevo';
    ctx.businessIndustry = (parts[1] || 'Comercio sin inventario propio').trim();
    await updateConversation(tenantId, conv.id, { onboarding_step: 2, context_json: ctx });
    return onboardingReply(
      `Pregunta 2/${ONBOARDING_TOTAL}: ¿Con qué nombre quieres activar a tu asistente privado? (Ej. "Jarvis")`
    );
  }

  if (step === 2) {
    ctx.activationName = text.trim().slice(0, 60) || 'Jarvis';
    await updateConversation(tenantId, conv.id, { onboarding_step: 3, context_json: ctx });
    return onboardingReply(
      `Pregunta 3/${ONBOARDING_TOTAL}: ¿Qué margen de ganancia (%) sugerido deseas por defecto? (Ej. 35)`
    );
  }

  if (step === 3) {
    const numMatch = text.match(/(\d+(?:[.,]\d+)?)/);
    ctx.defaultMargin = numMatch
      ? Math.min(90, Math.max(5, Number(numMatch[1].replace(',', '.'))))
      : 40;
    await updateConversation(tenantId, conv.id, { onboarding_step: 4, context_json: ctx });
    return onboardingReply(
      `Pregunta 4/${ONBOARDING_TOTAL}: ¿Qué regla aplicamos si un cliente pregunta por algo fuera de catálogo? (Ej. "Escalar al dueño por WhatsApp")`
    );
  }

  ctx.handoffRule =
    text.trim() || 'Escalar al dueño por WhatsApp y pausar respuestas automáticas';
  // El dueño es siempre quien completó la entrevista.
  ctx.ownerWhatsapp = normalizePhone(fromPhone);

  const newTenant = await createTenantFromOnboarding(ctx);
  const deployed = await deployOnboardingAgents(newTenant.id, ctx);
  await updateConversation(tenantId, conv.id, { onboarding_step: null, context_json: ctx });

  const publicCode = deployed.agents?.attention?.activation_code;
  const shareLink = buildAgentWaLink(publicCode);
  const qrUrl = buildAgentQrUrl(publicCode);

  // El código privado no se manda por chat: el dueño ya se reconoce por su número.
  const lines = [
    `¡Listo! Creamos tu negocio "${ctx.businessName}" con dos agentes:`,
    `1) Tu asistente privado "${ctx.activationName}": solo te responde a ti. Escríbele desde este número mencionando "${ctx.activationName}".`,
    `2) Tu agente de atención: responde a tus clientes sin mostrar costos ni proveedores.`,
    '',
    shareLink
      ? `Comparte este enlace con tus clientes:\n${shareLink}`
      : `Tus clientes deben escribir este código a nuestro número: ${publicCode}`,
  ];
  if (qrUrl) lines.push('', 'Este QR lleva al mismo enlace: imprímelo o ponlo en tus redes.');
  lines.push('', `Tope mensual: ${deployed.usageCaps.monthlyMsgLimit} mensajes.`);

  return {
    ...onboardingReply(lines.join('\n')),
    replyMediaUrl: qrUrl,
    onboardingResult: { ...deployed, publicCode, shareLink, qrUrl },
  };
}

async function handleOwnerMode(tenant, fromPhone, text, mediaUrl) {
  const wakeWord = tenant.activation_name || 'Jarvis';
  const defaultMargin = Number(tenant.default_margin || 40);
  const [products, suppliers, pending] = await Promise.all([
    listProducts(tenant.id),
    listSuppliers(tenant.id),
    listPendingActions(tenant.id, 'pending'),
  ]);

  const parsedSave = parseOwnerSaveCommand(text, defaultMargin);
  if (parsedSave || mediaUrl) {
    const productName = parsedSave?.productName || 'Producto detectado por imagen';
    const costPrice = parsedSave?.costPrice || 12000;
    const salePrice =
      parsedSave?.salePrice ||
      Math.round(costPrice / Math.max(0.1, 1 - defaultMargin / 100));
    const supplierName = parsedSave?.supplierName || 'MotoASAP';
    const supplierPhone = parsedSave?.supplierPhone || '50688888888';
    const { amount, percent } = calculateMargin(costPrice, salePrice);

    const existingSup = suppliers.find(
      (s) => normalizeText(s.name) === normalizeText(supplierName)
    );

    const sku = `JRV-${Math.floor(100 + Math.random() * 899)}`;
    const previewText = `Registrar "${productName}" (SKU ${sku}) con proveedor ${supplierName} (${supplierPhone}).`;

    const createdPendingAction = await createPendingAction(tenant.id, {
      action_type: 'create_product',
      target_phone: supplierPhone,
      preview_text: previewText,
      payload_json: {
        title: `Guardar "${productName}" (${supplierName})`,
        agentName: `${wakeWord} (Dueño)`,
        supplierName: existingSup?.name || supplierName,
        impactSummary: `Costo ${formatColones(costPrice)} · Venta ${formatColones(
          salePrice
        )} · Margen ${formatColones(amount)} (${percent}%)`,
        product: {
          sku,
          name: productName,
          description: `Agregado por comando de ${wakeWord} vía WhatsApp.`,
          category: 'Catálogo Rápido',
          supplier_id: existingSup?.id || null,
          image_url: mediaUrl || '/products/cargador-gan.svg',
          cost_price: costPrice,
          sale_price: salePrice,
        },
        supplier: existingSup
          ? null
          : {
              name: supplierName,
              whatsapp_phone: supplierPhone,
              location: 'San José · Recogida local',
              notes: 'Registrado desde WhatsApp HITL',
            },
      },
    });

    await addAuditLog(tenant.id, {
      actor: `agent:personal`,
      action: 'pending_action.created',
      result: `Preparó alta de "${productName}" con ${supplierName} para confirmación HITL.`,
    });

    return {
      replyText: `Entendido (${wakeWord}). Preparé "${productName}" (Costo ${formatColones(
        costPrice
      )} -> Venta ${formatColones(salePrice)}, Margen ${formatColones(
        amount
      )} / ${percent}%) con proveedor ${supplierName} (${supplierPhone}).\n\nPor seguridad quedó pendiente en tu panel de Confirmación Humana (HITL) antes de guardarse.`,
      replyMediaUrl: null,
      createdPendingAction,
      mode: 'owner',
    };
  }

  const normalized = normalizeText(text);
  if (normalized.includes('ruta') || normalized.includes('recogida')) {
    const stops = await getDailyPickupRoute(tenant.id);
    if (stops.length === 0) {
      return {
        replyText: 'No hay paradas pendientes en "Pedido a Proveedor" para recoger hoy.',
        replyMediaUrl: null,
        createdPendingAction: null,
        mode: 'owner',
      };
    }
    const summary = stops
      .map(
        (stop, idx) =>
          `${idx + 1}. ${stop.supplierName} (${stop.location}) · Pago bodega ${formatColones(
            stop.totalCostToPay
          )} · Órdenes: ${stop.orders.map((o) => o.itemsSummary).join(', ')}`
      )
      .join('\n');
    return {
      replyText: `Ruta de recogida del día:\n${summary}`,
      replyMediaUrl: null,
      createdPendingAction: null,
      mode: 'owner',
    };
  }

  const matched = findMatchingProducts(text, products);
  const wantsPurchase =
    normalized.includes('pide') ||
    normalized.includes('pedir') ||
    normalized.includes('ordena') ||
    normalized.includes('compra');

  if (matched.length > 0) {
    const top = matched[0];
    if (wantsPurchase) {
      const supPhone = top.supplier?.whatsapp_phone || '50688412310';
      const previewText = `Hola ${top.supplier_name}, confirmamos solicitud de "${top.name}" (SKU ${top.sku}) por ${formatColones(
        top.cost_price
      )} costo mayorista. ¿Apartado disponible para recoger hoy en ${
        top.supplier?.location || 'bodega'
      }?`;

      const createdPendingAction = await createPendingAction(tenant.id, {
        action_type: 'purchase_order',
        target_phone: supPhone,
        preview_text: previewText,
        payload_json: {
          title: `Pedir "${top.name}" a ${top.supplier_name}`,
          agentName: `${wakeWord} (Dueño)`,
          supplierId: top.supplier_id,
          supplierName: top.supplier_name,
          impactSummary: `Costo ${formatColones(top.cost_price)} · Venta ${formatColones(
            top.sale_price
          )} · Margen ${formatColones(top.margin_amount)} (${top.margin_percent}%)`,
          productId: top.id,
        },
      });

      await addAuditLog(tenant.id, {
        actor: 'agent:personal',
        action: 'pending_action.created',
        result: `Encoló OC de "${top.name}" para ${top.supplier_name} en HITL.`,
      });

      return {
        replyText: `Preparé la orden para ${top.supplier_name} (${supPhone}) por "${top.name}" a ${formatColones(
          top.cost_price
        )}. Aprueba en tu bandeja HITL para enviarla.`,
        replyMediaUrl: null,
        createdPendingAction,
        mode: 'owner',
      };
    }

    const lines = matched.slice(0, 3).map((item) => {
      return `• ${item.name} (${item.sku})\n  Distribuidor: ${item.supplier_name} · Tel: ${
        item.supplier?.whatsapp_phone || 'N/D'
      }\n  Ubicación: ${item.supplier?.location || 'Local'}\n  Costo: ${formatColones(
        item.cost_price
      )} · Venta: ${formatColones(item.sale_price)} · Margen: ${formatColones(
        item.margin_amount
      )} (${item.margin_percent}%)`;
    });

    return {
      replyText: `Encontré ${matched.length} coincidencia(s) en tu inventario activo:\n\n${lines.join(
        '\n\n'
      )}`,
      replyMediaUrl: null,
      createdPendingAction: null,
      mode: 'owner',
    };
  }

  const pendingProducts = pending
    .filter((pa) => pa.action_type === 'create_product' && pa.payload_json?.product)
    .map((pa) => ({
      ...pa.payload_json.product,
      supplier_name: pa.payload_json.supplierName || 'Proveedor Local',
    }));
  const matchedPending = findMatchingProducts(text, pendingProducts);
  if (matchedPending.length > 0) {
    const p = matchedPending[0];
    return {
      replyText: `"${p.name}" aún está en tu bandeja HITL esperando aprobación con el proveedor ${p.supplier_name}. Aprueba la tarjeta para guardarlo en catálogo.`,
      replyMediaUrl: null,
      createdPendingAction: null,
      mode: 'owner',
    };
  }

  return {
    replyText: `No encontré coincidencias en tu catálogo (${products.length} productos). Para dar de alta un artículo envía: "Guarda filtro de aire CRF250, costo 12000, venta 18500, proveedor MotoASAP 88888888".`,
    replyMediaUrl: null,
    createdPendingAction: null,
    mode: 'owner',
  };
}

async function handleClientMode(tenant, fromPhone, text) {
  const products = await listProducts(tenant.id, { active: true });
  const matched = findMatchingProducts(text, products);
  const normalized = normalizeText(text);

  const wantsToBuy =
    normalized.includes('comprar') ||
    normalized.includes('quiero') ||
    normalized.includes('pedir') ||
    normalized.includes('ordenar') ||
    normalized.includes('dame') ||
    normalized.includes('me llevo') ||
    normalized.includes('encargar');

  if (matched.length > 0 && wantsToBuy) {
    const chosen = matched[0];
    const qtyMatch = text.match(/\b([1-9])\b/);
    const quantity = qtyMatch ? Number(qtyMatch[1]) : 1;
    const totalSale = Number(chosen.sale_price) * quantity;
    const totalCost = Number(chosen.cost_price) * quantity;
    const margin = Math.max(0, totalSale - totalCost);
    const marginPct = totalSale > 0 ? Math.round((margin / totalSale) * 1000) / 10 : 0;

    const createdOrder = await createOrder(tenant.id, {
      product_id: chosen.id,
      supplier_id: chosen.supplier_id,
      customer_phone: fromPhone,
      customer_name: 'Cliente WhatsApp',
      quantity,
      total_sale: totalSale,
      total_cost: totalCost,
      status: 'solicitud',
      pickup_notes: 'Pendiente confirmación del dueño (HITL)',
    });

    const supPhone = chosen.supplier?.whatsapp_phone || '50688412310';
    const createdPendingAction = await createPendingAction(tenant.id, {
      order_id: createdOrder.id,
      action_type: 'purchase_order',
      target_phone: supPhone,
      preview_text: `Cliente solicitó ${quantity}x "${chosen.name}". Autorizar orden al proveedor ${chosen.supplier_name} (${supPhone}).`,
      payload_json: {
        title: `Confirmar pedido ${quantity}x ${chosen.name}`,
        agentName: 'Agente Atención al Cliente',
        supplierId: chosen.supplier_id,
        supplierName: chosen.supplier_name,
        nextStage: 'pedido_proveedor',
        impactSummary: `Costo ${formatColones(totalCost)} · Venta ${formatColones(
          totalSale
        )} · Margen ${formatColones(margin)} (${marginPct}%)`,
      },
    });

    await addAuditLog(tenant.id, {
      actor: 'agent:attention',
      action: 'order.created_from_whatsapp',
      result: `Registró pedido de ${quantity}x ${chosen.name} en etapa "solicitud" y creó confirmación HITL.`,
    });

    return {
      replyText: `¡Perfecto! Registramos tu solicitud por ${quantity}x ${chosen.name} (${formatColones(
        totalSale
      )}). Un asesor confirmará tu entrega en minutos.`,
      replyMediaUrl: null,
      createdPendingAction,
      createdOrder,
      publicProducts: [toPublicProduct(chosen)],
      mode: 'client',
    };
  }

  if (matched.length > 0) {
    const publicProducts = matched.slice(0, 2).map(toPublicProduct);
    const first = publicProducts[0];
    return {
      replyText: `¡Sí! Tenemos disponible ${first.name} por ${formatColones(
        first.sale_price
      )} con entrega rápida. ${first.description || ''} ¿Deseas realizar tu pedido?`,
      replyMediaUrl: first.image_url || null,
      createdPendingAction: null,
      publicProducts,
      mode: 'client',
    };
  }

  const createdPendingAction = await createPendingAction(tenant.id, {
    action_type: 'human_handoff',
    target_phone: normalizePhone(fromPhone) || '50689102218',
    preview_text: `Consulta fuera de catálogo: "${text}". Regla configurada: ${tenant.handoff_rule}`,
    payload_json: {
      title: 'Cliente preguntó artículo fuera de catálogo',
      agentName: 'Agente Atención al Cliente',
      supplierName: 'Atención Manual',
      impactSummary: `Regla aplicada: ${tenant.handoff_rule}`,
    },
  });

  await addAuditLog(tenant.id, {
    actor: 'agent:attention',
    action: 'handoff.triggered',
    result: `Escaló consulta fuera de catálogo ("${text}") según regla de traspaso.`,
  });

  return {
    replyText:
      'Por el momento ese artículo no aparece en nuestro catálogo automático. Con gusto paso tu consulta a nuestro equipo humano para cotizártelo de inmediato.',
    replyMediaUrl: null,
    createdPendingAction,
    publicProducts: [],
    mode: 'client',
  };
}

// Rutas del simulador del CRM: el negocio viene fijado por el panel.
async function resolveLegacyRoute(tenantId, fromPhone, text, forceMode) {
  const normalized = normalizeText(text).trim();
  const inProgress = await findActiveOnboardingConversation(FACTORY_TENANT_ID, fromPhone);
  if (normalized.startsWith('#onboarding') || normalized.startsWith('#activar')) {
    return { tenantId: FACTORY_TENANT_ID, mode: 'onboarding', reason: 'factory_command' };
  }
  if (inProgress || forceMode === 'onboarding') {
    return {
      tenantId: FACTORY_TENANT_ID,
      mode: 'onboarding',
      reason: inProgress ? 'onboarding_in_progress' : 'factory_command',
    };
  }
  if (forceMode) return { tenantId, mode: forceMode, reason: 'forced' };
  const user = await findUserByPhone(tenantId, fromPhone);
  return { tenantId, mode: user?.role === 'owner' ? 'owner' : 'client', reason: 'simulator' };
}

/**
 * Procesa un mensaje entrante.
 * - Sin tenantId (número compartido): decide el negocio con resolveRoute().
 * - Con tenantId (simulador del panel o número propio del negocio): usa ese negocio.
 * - `route` permite pasar una ruta ya calculada (el webhook la calcula antes
 *   de guardar el mensaje entrante).
 */
export async function processMessage({
  tenantId = null,
  fromPhone,
  messageId = null,
  text = '',
  mediaUrl = null,
  timestamp = new Date().toISOString(),
  forceMode = null,
  route = null,
}) {
  const resolved =
    route ||
    (tenantId
      ? await resolveLegacyRoute(tenantId, fromPhone, text, forceMode)
      : await resolveRoute({ fromPhone, text }));

  const mode = resolved.mode;
  const tenant = await getTenant(resolved.tenantId);
  if (!tenant) {
    throw new Error('Tenant no encontrado.');
  }

  // Si el cliente llegó con un código, abandona cualquier entrevista a medias.
  if (resolved.code) {
    const pending = await findActiveOnboardingConversation(FACTORY_TENANT_ID, fromPhone);
    if (pending) {
      await updateConversation(FACTORY_TENANT_ID, pending.id, { onboarding_step: null });
    }
  }

  const convMode = ['owner', 'client', 'onboarding'].includes(mode) ? mode : 'client';
  let selectedAgentId = resolved.agentId || null;
  if (!selectedAgentId && (mode === 'owner' || mode === 'client')) {
    const agents = await listAgents(tenant.id);
    selectedAgentId =
      agents.find((a) => (mode === 'owner' ? a.type === 'personal' : a.type === 'attention'))
        ?.id || null;
  }

  // Solo se continúa una entrevista si la ruta lo dice; en otro caso empieza de
  // cero (aunque el webhook ya haya creado la fila de la conversación).
  const activeOnboarding =
    mode === 'onboarding' && resolved.reason === 'onboarding_in_progress'
      ? await findActiveOnboardingConversation(FACTORY_TENANT_ID, fromPhone)
      : null;

  const conversation = await getOrCreateConversation(
    tenant.id,
    fromPhone,
    convMode,
    selectedAgentId
  );

  // El código solo sirve para elegir el agente; no se interpreta como consulta.
  const body = resolved.code ? stripAgentCode(text) : text;

  let result;
  if (mode === 'unavailable') {
    result = {
      replyText: 'Este negocio no está atendiendo por WhatsApp en este momento. Intenta más tarde.',
      replyMediaUrl: null,
      createdPendingAction: null,
      mode,
    };
  } else if (mode === 'onboarding') {
    result = await handleOnboardingStep(fromPhone, text, activeOnboarding);
  } else if (resolved.code && !body && !mediaUrl) {
    result = {
      replyText:
        mode === 'owner'
          ? `Hola, soy ${tenant.activation_name || 'Jarvis'}, tu asistente de ${tenant.name}. ¿Qué necesitas?`
          : `¡Hola! Bienvenido a ${tenant.name}. ¿Qué producto buscas?`,
      replyMediaUrl: null,
      createdPendingAction: null,
      mode,
    };
  } else if (mode === 'owner') {
    result = await handleOwnerMode(tenant, fromPhone, body, mediaUrl);
  } else {
    result = await handleClientMode(tenant, fromPhone, body);
  }

  await insertOutboundMessage(tenant.id, {
    conversation_id: conversation.id,
    wa_message_id: messageId ? `${messageId}:reply` : null,
    sender_phone: 'system',
    body_text: result.replyText,
    media_url: result.replyMediaUrl,
  });

  return {
    ...result,
    timestamp,
    tenantId: tenant.id,
    route: { mode, reason: resolved.reason },
  };
}
