import React, { useEffect, useMemo, useState } from 'react';
import { Menu, ShieldAlert, Search, CheckCircle2 } from 'lucide-react';
import {
  TENANTS,
  PIPELINE_STAGES,
  NAV_ITEMS,
  initialSuppliers,
  initialProducts,
  initialOrders,
  initialAgents,
  initialPendingActions,
  initialActivity,
  calculateMargin,
  formatCurrency,
} from './data/mockStore';
import {
  api,
  fetchBackendBundle,
  mapBackendOrder,
  mapBackendPendingAction,
  mapBackendProduct,
} from './services/api';
import Sidebar from './components/layout/Sidebar';
import PipelineBar from './components/layout/PipelineBar';
import RightConfirmationDrawer from './components/layout/RightConfirmationDrawer';
import DashboardPage from './pages/DashboardPage';
import CatalogSuppliersPage from './pages/CatalogSuppliersPage';
import OrdersLogisticsPage from './pages/OrdersLogisticsPage';
import AgentsFactoryPage from './pages/AgentsFactoryPage';
import WhatsAppSimulatorPage from './pages/WhatsAppSimulatorPage';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function nowTimeLabel() {
  return new Date().toLocaleTimeString('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
  });
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
  ]);

  const cleaned = normalizeText(query).replace(/[¿?¡!.,:;()]/g, ' ');
  const tokens = cleaned
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token) && !/^\d+$/.test(token));

  if (tokens.length === 0) return [];

  return productList
    .map((product) => {
      const haystack = normalizeText(
        `${product.name} ${product.description || ''} ${product.category} ${product.sku} ${product.supplierName}`
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

function parseOwnerSaveCommand(text) {
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
    : Math.round(costPrice * 1.55);

  const supplierSection = text.match(/proveedor\s*(?:es|:)?\s*([^\n]+)/i);
  let supplierName = 'Proveedor Local';
  let supplierWhatsapp = '+506 8888 8888';

  if (supplierSection) {
    const rawSup = supplierSection[1].split(',')[0].trim();
    const phoneMatch = rawSup.match(/(\+?[\d][\d\s-]{6,})/);
    if (phoneMatch) {
      const digits = phoneMatch[1].replace(/\D/g, '');
      supplierWhatsapp =
        digits.length === 8
          ? `+506 ${digits.slice(0, 4)} ${digits.slice(4)}`
          : `+${digits}`;
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
    supplierWhatsapp,
  };
}

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [tenants, setTenants] = useState(TENANTS);
  const [activeTenantId, setActiveTenantId] = useState(TENANTS[0].id);
  const [backendOnline, setBackendOnline] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState(null);

  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [agents, setAgents] = useState(initialAgents);
  const [pendingActions, setPendingActions] = useState(initialPendingActions);
  const [decisionHistory, setDecisionHistory] = useState([]);
  const [activity, setActivity] = useState(initialActivity);

  const [assistantConfig, setAssistantConfig] = useState({
    businessName: TENANTS[0].name,
    businessIndustry: 'Tecnología y accesorios sin inventario propio',
    wakeWord: 'Jarvis',
    ownerWhatsapp: '+506 8888 8888',
    defaultMarginPct: 40,
    handoffRule:
      'Escalar al dueño por WhatsApp y pausar respuestas automáticas',
    activationCode: 'JRV-2026-CR',
    usageCaps: {
      ownerCommandsPerDay: 250,
      customerMessagesPerMonth: 1500,
    },
  });

  const [ownerMessages, setOwnerMessages] = useState([
    {
      id: 'om-1',
      sender: 'agent',
      author: 'Jarvis (Privado)',
      time: '12:10',
      text: 'Hola, soy Jarvis, tu asistente privado de Jarvi Stock. Escríbeme comandos para guardar productos, consultar quién distribuye un artículo o adjunta una foto para preparar una propuesta HITL.',
    },
  ]);

  const [clientMessages, setClientMessages] = useState([
    {
      id: 'cm-1',
      sender: 'agent',
      author: 'Asesor Virtual · Tienda',
      time: '12:12',
      text: '¡Hola! Bienvenido a nuestra tienda. Pregúntame por cualquier producto, disponibilidad o precio para entrega hoy.',
    },
  ]);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileHitlOpen, setMobileHitlOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const hydrateFromBackend = async (preferredTenantId = null) => {
    try {
      const bundle = await fetchBackendBundle(preferredTenantId);
      setBackendOnline(true);
      if (bundle.tenants.length > 0) {
        setTenants(bundle.tenants);
        setActiveTenantId(bundle.activeTenantId);
        const current = bundle.tenants.find((t) => t.id === bundle.activeTenantId);
        if (current) {
          setAssistantConfig((prev) => ({
            ...prev,
            businessName: current.name,
            businessIndustry: current.businessIndustry || prev.businessIndustry,
            wakeWord: current.activationName || prev.wakeWord,
            defaultMarginPct: current.defaultMargin || prev.defaultMarginPct,
            handoffRule: current.handoffRule || prev.handoffRule,
          }));
        }
      }
      setSuppliers(bundle.suppliers);
      setProducts(bundle.products);
      setOrders(bundle.orders);
      setPendingActions(bundle.pendingActions);
      if (bundle.agents.length > 0) setAgents(bundle.agents);
      if (bundle.activity.length > 0) setActivity(bundle.activity);
    } catch {
      setBackendOnline(false);
    }
  };

  useEffect(() => {
    hydrateFromBackend();
  }, []);

  const handleSelectTenant = (nextTenantId) => {
    setActiveTenantId(nextTenantId);
    if (backendOnline) {
      hydrateFromBackend(nextTenantId);
    }
  };

  const activeTenant = useMemo(
    () => tenants.find((t) => t.id === activeTenantId) || tenants[0],
    [tenants, activeTenantId]
  );

  const triggerToast = (message) => {
    setToast(message);
    window.clearTimeout(window.__jarviToastTimer);
    window.__jarviToastTimer = window.setTimeout(() => {
      setToast(null);
    }, 3600);
  };

  const pushActivity = (agentName, action, tag) => {
    setActivity((prev) => [
      {
        id: `ACT-${Date.now()}-${Math.floor(Math.random() * 100)}`,
        agentName,
        action,
        tag,
        time: 'Ahora mismo',
      },
      ...prev,
    ]);
  };

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      const stageOk = !selectedStage || order.stage === selectedStage;
      const searchOk =
        !q ||
        order.id.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.itemsSummary.toLowerCase().includes(q) ||
        order.supplierName.toLowerCase().includes(q);
      return stageOk && searchOk;
    });
  }, [orders, selectedStage, searchQuery]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  const handleApproveAction = async (actionId) => {
    const action = pendingActions.find((a) => a.id === actionId);
    if (!action) return;

    if (backendOnline) {
      try {
        const res = await api.approvePendingAction(activeTenantId, actionId);
        await hydrateFromBackend(activeTenantId);
        const deliveryNote = res?.whatsappDelivery?.sentViaApi
          ? 'Enviado por Meta Cloud API'
          : 'Ejecutado (simulación WA)';
        setDecisionHistory((prev) => [
          {
            id: action.id,
            title: action.title,
            decision: 'approved',
            resultNote: deliveryNote,
            decidedAt: 'Ahora',
          },
          ...prev,
        ]);
        triggerToast(`Acción aprobada y ejecutada (${deliveryNote}).`);
        return;
      } catch {
        // fallback al manejo local si falla red
      }
    }

    setPendingActions((prev) => prev.filter((a) => a.id !== actionId));

    let resultNote = 'Acción ejecutada';

    if (action.type === 'create_product' && action.newProduct) {
      let resolvedSupplierId = action.newProduct.supplierId;
      let resolvedSupplierName = action.newProduct.supplierName;

      if (action.newSupplier) {
        const existingSup = suppliers.find(
          (s) =>
            normalizeText(s.name) === normalizeText(action.newSupplier.name)
        );
        if (existingSup) {
          resolvedSupplierId = existingSup.id;
          resolvedSupplierName = existingSup.name;
        } else {
          const createdSup = {
            id: action.newSupplier.id || `PROV-0${suppliers.length + 1}`,
            name: action.newSupplier.name,
            category: action.newSupplier.category || 'Distribuidor WhatsApp',
            whatsapp: action.newSupplier.whatsapp,
            location: action.newSupplier.location || 'San José · Por confirmar',
            pickupWindow: 'Hoy 10:00 - 18:00',
            avgResponseMin: 7,
            reliability: '100%',
            contactPerson: action.newSupplier.name,
            notes: 'Registrado desde WhatsApp HITL.',
          };
          resolvedSupplierId = createdSup.id;
          resolvedSupplierName = createdSup.name;
          setSuppliers((prev) => [createdSup, ...prev]);
        }
      }

      const { amount, percent } = calculateMargin(
        action.newProduct.costPrice,
        action.newProduct.salePrice
      );
      const productToInsert = {
        ...action.newProduct,
        supplierId: resolvedSupplierId,
        supplierName: resolvedSupplierName,
        marginAmount: amount,
        marginPercent: percent,
      };
      setProducts((prev) => {
        if (prev.some((p) => p.sku === productToInsert.sku)) return prev;
        return [productToInsert, ...prev];
      });
      resultNote = `SKU ${productToInsert.sku} agregado`;
      pushActivity(
        'Confirmación Humana',
        `Aprobó y publicó "${productToInsert.name}" (${percent}% margen) con ${resolvedSupplierName}.`,
        'Ejecutado HITL'
      );
      triggerToast(`Producto "${productToInsert.name}" guardado en el catálogo.`);
    } else if (action.type === 'purchase_order' && action.orderId) {
      const targetStage = action.nextStage || 'pedido_proveedor';
      setOrders((prev) =>
        prev.map((order) =>
          order.id === action.orderId
            ? {
                ...order,
                stage: targetStage,
                pickupSlot: 'OC enviada · Recoger hoy 17:00 hrs',
                updatedAt: 'Ahora mismo',
              }
            : order
        )
      );
      resultNote = `OC enviada (${action.orderId})`;
      pushActivity(
        'Confirmación Humana',
        `Aprobó orden de compra ${action.orderId} para ${action.supplierName} por WhatsApp.`,
        'Ejecutado HITL'
      );
      triggerToast(`Orden de compra ${action.orderId} enviada por WhatsApp.`);
    } else if (action.type === 'purchase_order' && !action.orderId) {
      resultNote = `Pedido enviado a ${action.supplierName}`;
      pushActivity(
        'Confirmación Humana',
        `Autorizó solicitud de compra directa a ${action.supplierName} por WhatsApp.`,
        'Ejecutado HITL'
      );
      triggerToast(`Solicitud a ${action.supplierName} aprobada y ejecutada.`);
    } else if (action.orderId) {
      const targetStage = action.nextStage || 'por_confirmar';
      setOrders((prev) =>
        prev.map((order) =>
          order.id === action.orderId
            ? {
                ...order,
                stage: targetStage,
                pickupSlot: 'Cotización enviada · Esperando OK',
                updatedAt: 'Ahora mismo',
              }
            : order
        )
      );
      resultNote = `Cotización enviada (${action.orderId})`;
      pushActivity(
        'Confirmación Humana',
        `Aprobó envío de cotización ${action.orderId} por WhatsApp.`,
        'Ejecutado HITL'
      );
      triggerToast(`Cotización ${action.orderId} enviada al cliente.`);
    } else {
      resultNote = 'Traspaso atendido';
      pushActivity(
        'Confirmación Humana',
        `Atendió solicitud escalada: "${action.title}".`,
        'Ejecutado HITL'
      );
      triggerToast('Solicitud humana marcada como ejecutada.');
    }

    setDecisionHistory((prev) => [
      {
        id: action.id,
        title: action.title,
        decision: 'approved',
        resultNote,
        decidedAt: 'Ahora',
      },
      ...prev,
    ]);
  };

  const handleDiscardAction = async (actionId) => {
    const action = pendingActions.find((a) => a.id === actionId);
    if (!action) return;

    if (backendOnline) {
      try {
        await api.rejectPendingAction(activeTenantId, actionId);
        await hydrateFromBackend(activeTenantId);
      } catch {
        // continúa en local
      }
    }

    setPendingActions((prev) => prev.filter((a) => a.id !== actionId));
    setDecisionHistory((prev) => [
      {
        id: action.id,
        title: action.title,
        decision: 'discarded',
        resultNote: 'Descartado por operador',
        decidedAt: 'Ahora',
      },
      ...prev,
    ]);
    pushActivity(
      'Confirmación Humana',
      `Descartó la propuesta: "${action.title}".`,
      'Descartado'
    );
    triggerToast('Acción descartada de la bandeja HITL.');
  };

  const handleRestoreDemoHitl = () => {
    setPendingActions(initialPendingActions);
    triggerToast('Cola HITL restaurada con acciones demo.');
  };

  const handleTogglePickup = async (orderId) => {
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;
    const nextCompleted = !target.pickupCompleted;
    const nextStage = nextCompleted ? 'recogida_entrega' : 'pedido_proveedor';
    const nextNotes = nextCompleted
      ? 'Recolectado · En entrega última milla'
      : 'Apartado listo para recoger';

    if (backendOnline) {
      try {
        const res = await api.updateOrder(activeTenantId, orderId, {
          status: nextStage,
          pickup_notes: nextNotes,
        });
        if (res?.order) {
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? mapBackendOrder(res.order) : o))
          );
          return;
        }
      } catch {
        // fallback local
      }
    }

    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              pickupCompleted: nextCompleted,
              stage: nextStage,
              pickupSlot: nextNotes,
              updatedAt: 'Ahora mismo',
            }
          : order
      )
    );
  };

  const handleAdvanceOrderStage = async (orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const currentIndex = PIPELINE_STAGES.findIndex((s) => s.id === order.stage);
    if (currentIndex === -1 || currentIndex >= PIPELINE_STAGES.length - 1) return;

    const nextStage = PIPELINE_STAGES[currentIndex + 1];
    const nextNotes =
      nextStage.id === 'pedido_proveedor'
        ? 'Apartado listo · Recoger hoy'
        : nextStage.id === 'recogida_entrega'
          ? 'Recolectado · Mensajero en ruta'
          : order.pickupSlot;

    if (backendOnline) {
      try {
        const res = await api.updateOrder(activeTenantId, orderId, {
          status: nextStage.id,
          pickup_notes: nextNotes,
        });
        if (res?.order) {
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? mapBackendOrder(res.order) : o))
          );
          triggerToast(`${order.displayId || orderId} avanzó a ${nextStage.shortLabel}.`);
          return;
        }
      } catch {
        // fallback local
      }
    }

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              stage: nextStage.id,
              pickupCompleted:
                nextStage.id === 'recogida_entrega' ? true : o.pickupCompleted,
              pickupSlot: nextNotes,
              updatedAt: 'Ahora mismo',
            }
          : o
      )
    );
    pushActivity(
      'Pipeline Comercial',
      `Pedido ${orderId} avanzó a "${nextStage.label}".`,
      'Pipeline'
    );
    triggerToast(`${orderId} avanzó a ${nextStage.shortLabel}.`);
  };

  const handleCreateProductAndSupplier = async (payload) => {
    if (backendOnline) {
      try {
        await api.createProduct(activeTenantId, {
          name: payload.name,
          description: payload.description,
          category: payload.category,
          image_url: payload.image,
          cost_price: payload.costPrice,
          sale_price: payload.salePrice,
          supplier_id: payload.supplierMode === 'existing' ? payload.supplierId : null,
          new_supplier:
            payload.supplierMode === 'new' && payload.newSupplier
              ? {
                  name: payload.newSupplier.name,
                  whatsapp_phone: payload.newSupplier.whatsapp,
                  location: payload.newSupplier.location,
                }
              : null,
        });
        await hydrateFromBackend(activeTenantId);
        triggerToast(`"${payload.name}" guardado en PostgreSQL/Backend.`);
        return;
      } catch {
        // fallback local
      }
    }

    let targetSupplier = suppliers.find((s) => s.id === payload.supplierId);

    if (payload.supplierMode === 'new' && payload.newSupplier) {
      const newSupplierId = `PROV-0${suppliers.length + 1}`;
      targetSupplier = {
        id: newSupplierId,
        name: payload.newSupplier.name,
        category: payload.newSupplier.category || payload.category,
        whatsapp: payload.newSupplier.whatsapp,
        location: payload.newSupplier.location,
        pickupWindow: 'Hoy 10:00 - 18:00',
        avgResponseMin: 8,
        reliability: '100%',
        contactPerson: 'Contacto Directo',
        notes: 'Registrado desde alta rápida de producto.',
      };
      setSuppliers((prev) => [targetSupplier, ...prev]);
    }

    if (!targetSupplier) {
      targetSupplier = suppliers[0];
    }

    const { amount, percent } = calculateMargin(
      payload.costPrice,
      payload.salePrice
    );
    const skuCode = `JRV-${Math.floor(100 + Math.random() * 899)}`;

    const newProduct = {
      id: `PROD-${Date.now()}`,
      sku: skuCode,
      name: payload.name,
      description: payload.description,
      category: payload.category,
      supplierId: targetSupplier.id,
      supplierName: targetSupplier.name,
      image: payload.image,
      costPrice: payload.costPrice,
      salePrice: payload.salePrice,
      marginAmount: amount,
      marginPercent: percent,
      stockStatus: 'Stock confirmado hoy',
      deliveryEta: 'Mismo día',
      salesCount: 0,
    };

    setProducts((prev) => [newProduct, ...prev]);
    pushActivity(
      'Catálogo Sin Stock',
      `Agregó "${newProduct.name}" (${percent}% margen) asignado a ${targetSupplier.name}.`,
      'Catálogo'
    );
    triggerToast(`"${newProduct.name}" publicado con ${percent}% de margen.`);
  };

  const handleRequestFromSupplier = async (product, supplier) => {
    const prefilledMessage = `Hola ${supplier.name}, confirmamos solicitud de "${product.name}" (SKU ${product.sku}) por ${formatCurrency(
      product.costPrice
    )} costo mayorista. ¿Apartado disponible para recoger hoy en ${supplier.location}?`;

    const impactSummary = `Costo ${formatCurrency(product.costPrice)} · Venta ${formatCurrency(
      product.salePrice
    )} · Margen ${formatCurrency(product.marginAmount)} (${product.marginPercent}%)`;

    if (backendOnline) {
      try {
        const res = await api.createPendingAction(activeTenantId, {
          action_type: 'purchase_order',
          target_phone: supplier.whatsapp,
          preview_text: prefilledMessage,
          payload_json: {
            title: `Pedir "${product.name}" a ${supplier.name}`,
            agentName: 'Jarvi Cotizador B2B',
            supplierId: supplier.id,
            supplierName: supplier.name,
            impactSummary,
          },
        });
        if (res?.action) {
          setPendingActions((prev) => [mapBackendPendingAction(res.action), ...prev]);
          triggerToast(`Solicitud para ${supplier.name} encolada en Confirmación Humana.`);
          return;
        }
      } catch {
        // fallback local
      }
    }

    const newAction = {
      id: `HITL-${Date.now()}`,
      type: 'purchase_order',
      badge: 'Pedido a Proveedor',
      priority: 'Alta',
      title: `Pedir "${product.name}" a ${supplier.name}`,
      agentId: 'AGT-02',
      agentName: 'Jarvi Cotizador B2B',
      supplierId: supplier.id,
      supplierName: supplier.name,
      whatsappTarget: supplier.whatsapp,
      impactSummary,
      previewMessage: prefilledMessage,
      createdAt: 'Ahora mismo',
    };

    setPendingActions((prev) => [newAction, ...prev]);
    pushActivity(
      'Jarvi Cotizador B2B',
      `Encoló solicitud de compra de "${product.name}" para ${supplier.name} en bandeja HITL.`,
      'HITL Pendiente'
    );
    triggerToast(`Solicitud para ${supplier.name} encolada en Confirmación Humana.`);
  };

  const handleCheckSupplierStock = async (supplier) => {
    const previewText = `Hola ${
      supplier.contactPerson || supplier.name
    }, ¿nos confirmas existencias del día para los SKUs activos de Jarvi Stock?`;

    if (backendOnline) {
      try {
        const res = await api.createPendingAction(activeTenantId, {
          action_type: 'supplier_stock_check',
          target_phone: supplier.whatsapp,
          preview_text: previewText,
          payload_json: {
            title: `Solicitar actualización de stock a ${supplier.name}`,
            agentName: 'Jarvi Cotizador B2B',
            supplierId: supplier.id,
            supplierName: supplier.name,
            impactSummary: `Proveedor en ${supplier.location}`,
          },
        });
        if (res?.action) {
          setPendingActions((prev) => [mapBackendPendingAction(res.action), ...prev]);
          triggerToast(`Consulta para ${supplier.name} lista en bandeja HITL.`);
          return;
        }
      } catch {
        // fallback local
      }
    }

    const newAction = {
      id: `HITL-${Date.now()}`,
      type: 'quote_approval',
      badge: 'Consulta WhatsApp B2B',
      priority: 'Media',
      title: `Solicitar actualización de stock a ${supplier.name}`,
      agentId: 'AGT-02',
      agentName: 'Jarvi Cotizador B2B',
      supplierId: supplier.id,
      supplierName: supplier.name,
      whatsappTarget: supplier.whatsapp,
      impactSummary: `Proveedor en ${supplier.location} · Respuesta ~${supplier.avgResponseMin} min`,
      previewMessage: previewText,
      createdAt: 'Ahora mismo',
    };
    setPendingActions((prev) => [newAction, ...prev]);
    pushActivity(
      'Jarvi Cotizador B2B',
      `Redactó consulta de inventario por WhatsApp para ${supplier.name}.`,
      'HITL Pendiente'
    );
    triggerToast(`Consulta para ${supplier.name} lista en bandeja HITL.`);
  };

  const handleToggleAgent = async (agentId) => {
    if (backendOnline) {
      try {
        await api.toggleAgent(activeTenantId, agentId);
      } catch {
        // continua local
      }
    }
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? { ...a, status: a.status === 'active' ? 'paused' : 'active' }
          : a
      )
    );
  };

  const handleSaveWizardConfig = async (wizardValues) => {
    if (backendOnline) {
      try {
        const deployed = await api.submitOnboarding(activeTenantId, {
          businessName: wizardValues.businessName,
          businessIndustry: wizardValues.businessIndustry,
          activationName: wizardValues.wakeWord,
          ownerWhatsapp: wizardValues.ownerWhatsapp,
          defaultMargin: wizardValues.defaultMarginPct,
          handoffRule: wizardValues.handoffRule,
        });
        setAssistantConfig({
          ...wizardValues,
          activationCode: deployed.activationCode,
          usageCaps: {
            ownerCommandsPerDay: deployed.usageCaps?.ownerCommandsPerDay || 250,
            customerMessagesPerMonth: deployed.usageCaps?.monthlyMsgLimit || 1500,
          },
        });
        await hydrateFromBackend(activeTenantId);
        triggerToast(`Agentes desplegados en backend (${deployed.activationCode}).`);
        return;
      } catch {
        // fallback local
      }
    }

    const code = `JRV-${wizardValues.wakeWord
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase()}-${Math.floor(1000 + Math.random() * 8999)}`;

    setAssistantConfig({
      ...wizardValues,
      activationCode: code,
      usageCaps: {
        ownerCommandsPerDay: 250,
        customerMessagesPerMonth: 1500,
      },
    });

    const ownerAgent = {
      id: `AGT-OWN-${Date.now()}`,
      name: `${wizardValues.wakeWord} · Asistente Dueño`,
      role: `Privado para ${wizardValues.ownerWhatsapp} · ${wizardValues.businessName}`,
      model: 'Private Owner Copilot',
      status: 'active',
      conversationsToday: 1,
      conversionRate: `${wizardValues.defaultMarginPct}% margen base`,
      hitlRule: 'Confirmación obligatoria antes de guardar SKUs o enviar OC.',
      lastAction: `Activado con código ${code}`,
    };

    const publicAgent = {
      id: `AGT-PUB-${Date.now() + 1}`,
      name: `Agente Público · ${wizardValues.businessName}`,
      role: 'Atención al Cliente WhatsApp (oculta costos y proveedores)',
      model: 'B2C Privacy Guard v2',
      status: 'active',
      conversationsToday: 1,
      conversionRate: '100% privacidad',
      hitlRule: wizardValues.handoffRule,
      lastAction: `Listo para atender ventas de ${wizardValues.businessIndustry}`,
    };

    setAgents((prev) => [ownerAgent, publicAgent, ...prev.slice(0, 2)]);
    pushActivity(
      'Fábrica de Agentes',
      `Configuró asistente "${wizardValues.wakeWord}" y agente público para ${wizardValues.businessName} (Código ${code}).`,
      'Agentes'
    );
    triggerToast(`Agentes creados y activados con código ${code}.`);
  };

  const handleSendOwnerCommand = async (text, attachedPhoto) => {
    const time = nowTimeLabel();
    const wakeWord = assistantConfig.wakeWord || 'Jarvis';

    const userMsg = {
      id: `om-${Date.now()}-u`,
      sender: 'user',
      author: `Dueño (${assistantConfig.ownerWhatsapp})`,
      time,
      text,
      image: attachedPhoto?.url || null,
    };

    if (backendOnline) {
      try {
        const res = await api.processMessage(activeTenantId, {
          fromPhone: assistantConfig.ownerWhatsapp,
          text,
          mediaUrl: attachedPhoto?.url || null,
          forceMode: 'owner',
        });

        const botMsg = {
          id: `om-${Date.now()}-a`,
          sender: 'agent',
          author: `${wakeWord} (Privado)`,
          time,
          text: res.replyText,
        };
        const extras = [userMsg, botMsg];
        if (res.createdPendingAction) {
          const mappedAction = mapBackendPendingAction(res.createdPendingAction);
          setPendingActions((prev) => [mappedAction, ...prev]);
          extras.push({
            id: `om-${Date.now()}-s`,
            sender: 'system',
            text: `Tarjeta HITL creada: ${mappedAction.title}`,
          });
          triggerToast('Acción encolada en Confirmación Humana (Backend).');
        }
        setOwnerMessages((prev) => [...prev, ...extras]);
        return;
      } catch {
        // fallback local
      }
    }

    const parsedSave = parseOwnerSaveCommand(text);

    if (parsedSave || attachedPhoto) {
      const productName = parsedSave?.productName || 'Producto desde fotografía';
      const costPrice = parsedSave?.costPrice || 12000;
      const salePrice =
        parsedSave?.salePrice ||
        Math.round(costPrice / (1 - (assistantConfig.defaultMarginPct || 40) / 100));
      const supplierName = parsedSave?.supplierName || 'MotoASAP';
      const supplierWhatsapp = parsedSave?.supplierWhatsapp || '+506 8888 8888';

      const { amount, percent } = calculateMargin(costPrice, salePrice);
      const sku = `JRV-${Math.floor(100 + Math.random() * 899)}`;
      const existingSupplier = suppliers.find(
        (s) => normalizeText(s.name) === normalizeText(supplierName)
      );

      const hitlAction = {
        id: `HITL-${Date.now()}`,
        type: 'create_product',
        badge: attachedPhoto ? 'Alta por Foto + IA' : 'Alta desde WhatsApp',
        priority: 'Alta',
        title: `Guardar "${productName}" (${supplierName})`,
        agentId: 'AGT-OWN',
        agentName: `${wakeWord} (Asistente Dueño)`,
        supplierId: existingSupplier?.id || `PROV-NEW-${Date.now()}`,
        supplierName: existingSupplier?.name || supplierName,
        whatsappTarget: existingSupplier?.whatsapp || supplierWhatsapp,
        impactSummary: `Costo ${formatCurrency(costPrice)} · Venta ${formatCurrency(
          salePrice
        )} · Ganancia ${formatCurrency(amount)} (${percent}%)`,
        previewMessage: `Registrar "${productName}" (SKU ${sku}) con proveedor ${supplierName} (${supplierWhatsapp}) para venta sin stock.`,
        newSupplier: existingSupplier
          ? null
          : {
              id: `PROV-${Date.now()}`,
              name: supplierName,
              whatsapp: supplierWhatsapp,
              location: 'San José · Recogida local',
              category: assistantConfig.businessIndustry || 'Repuestos y Accesorios',
            },
        newProduct: {
          id: `PROD-${Date.now()}`,
          sku,
          name: productName,
          description: `Agregado por comando de ${wakeWord} vía WhatsApp.`,
          category: 'Catálogo Rápido',
          supplierId: existingSupplier?.id || `PROV-NEW-${Date.now()}`,
          supplierName: existingSupplier?.name || supplierName,
          image: attachedPhoto?.url || '/products/cargador-gan.svg',
          costPrice,
          salePrice,
          stockStatus: 'Stock confirmado hoy',
          deliveryEta: 'Mismo día',
          salesCount: 0,
        },
        createdAt: 'Ahora mismo',
      };

      setPendingActions((prev) => [hitlAction, ...prev]);
      pushActivity(
        `${wakeWord} (Dueño)`,
        `Preparó alta de "${productName}" con ${supplierName} en cola HITL.`,
        'HITL Pendiente'
      );

      const botMsg = {
        id: `om-${Date.now()}-a`,
        sender: 'agent',
        author: `${wakeWord} (Privado)`,
        time,
        text: `Entendido. Preparé "${productName}" (Costo ${formatCurrency(
          costPrice
        )} → Venta ${formatCurrency(salePrice)}, Margen ${formatCurrency(
          amount
        )} / ${percent}%) con el proveedor ${supplierName} (${supplierWhatsapp}).\n\nPor seguridad, ya quedó en el panel derecho de Confirmación Humana Obligatoria para que lo apruebes antes de publicarlo.`,
      };
      const sysMsg = {
        id: `om-${Date.now()}-s`,
        sender: 'system',
        text: `Tarjeta HITL creada en el panel derecho: Guardar "${productName}"`,
      };

      setOwnerMessages((prev) => [...prev, userMsg, botMsg, sysMsg]);
      triggerToast(`Propuesta HITL creada para "${productName}".`);
      return;
    }

    const matchedProducts = findMatchingProducts(text, products);
    const pendingProductActions = pendingActions.filter(
      (a) => a.type === 'create_product' && a.newProduct
    );
    const matchedPending = findMatchingProducts(
      text,
      pendingProductActions.map((a) => a.newProduct)
    );

    const normalized = normalizeText(text);
    const wantsPurchase =
      normalized.includes('pide') ||
      normalized.includes('pedir') ||
      normalized.includes('ordena') ||
      normalized.includes('compra');

    if (matchedProducts.length > 0) {
      const topProduct = matchedProducts[0];
      const sup = suppliers.find((s) => s.id === topProduct.supplierId);

      if (wantsPurchase && sup) {
        handleRequestFromSupplier(topProduct, sup);
        const botMsg = {
          id: `om-${Date.now()}-a`,
          sender: 'agent',
          author: `${wakeWord} (Privado)`,
          time,
          text: `Preparé la orden al proveedor ${sup.name} (${sup.whatsapp}) por "${topProduct.name}" a costo ${formatCurrency(
            topProduct.costPrice
          )}. Confírmala en el panel derecho para enviarla.`,
        };
        const sysMsg = {
          id: `om-${Date.now()}-s`,
          sender: 'system',
          text: `Orden HITL creada para ${sup.name}`,
        };
        setOwnerMessages((prev) => [...prev, userMsg, botMsg, sysMsg]);
        return;
      }

      const lines = matchedProducts.slice(0, 3).map((item) => {
        const s = suppliers.find((supItem) => supItem.id === item.supplierId);
        return `• ${item.name} (${item.sku})\n  Distribuidor: ${
          s?.name || item.supplierName
        } · Tel: ${s?.whatsapp || 'N/D'}\n  Ubicación: ${
          s?.location || 'Local'
        }\n  Costo: ${formatCurrency(item.costPrice)} · Venta: ${formatCurrency(
          item.salePrice
        )} · Margen: ${formatCurrency(item.marginAmount)} (${item.marginPercent}%)`;
      });

      const botMsg = {
        id: `om-${Date.now()}-a`,
        sender: 'agent',
        author: `${wakeWord} (Privado)`,
        time,
        text: `Encontré ${matchedProducts.length} coincidencia(s) en tu inventario activo:\n\n${lines.join(
          '\n\n'
        )}`,
      };
      setOwnerMessages((prev) => [...prev, userMsg, botMsg]);
      return;
    }

    if (matchedPending.length > 0) {
      const pendingProd = matchedPending[0];
      const botMsg = {
        id: `om-${Date.now()}-a`,
        sender: 'agent',
        author: `${wakeWord} (Privado)`,
        time,
        text: `"${pendingProd.name}" aún está en tu bandeja de Confirmación Humana (panel derecho) con el proveedor ${pendingProd.supplierName}. Haz clic en "Aprobar y Ejecutar" para guardarlo oficialmente en el catálogo.`,
      };
      setOwnerMessages((prev) => [...prev, userMsg, botMsg]);
      return;
    }

    const fallbackMsg = {
      id: `om-${Date.now()}-a`,
      sender: 'agent',
      author: `${wakeWord} (Privado)`,
      time,
      text: `No encontré ese producto registrado aún en tu catálogo actual (${products.length} SKUs). Si quieres darlo de alta, escríbeme algo como:\n"Guarda filtro de aire CRF250, costo 12000, venta 18500, proveedor MotoASAP 88888888"`,
    };
    setOwnerMessages((prev) => [...prev, userMsg, fallbackMsg]);
  };

  const registerClientOrderFromChat = (product, customerText) => {
    const time = nowTimeLabel();
    const newOrderId = `ORD-${Math.floor(2100 + Math.random() * 800)}`;
    const supplier = suppliers.find((s) => s.id === product.supplierId);

    const newOrder = {
      id: newOrderId,
      customerName: 'Cliente WhatsApp',
      customerWhatsapp: '+506 8910 2218',
      deliveryZone: 'GAM · Dirección por confirmar',
      itemsSummary: `1x ${product.name}`,
      supplierId: supplier?.id || product.supplierId,
      supplierName: supplier?.name || product.supplierName,
      supplierWhatsapp: supplier?.whatsapp || '+506 8841 2310',
      supplierLocation: supplier?.location || 'San José Centro',
      stage: 'solicitud',
      costTotal: product.costPrice,
      saleTotal: product.salePrice,
      marginTotal: product.marginAmount,
      pickupSlot: 'Pendiente confirmación del dueño (HITL)',
      pickupCompleted: false,
      paymentMethod: 'Contra entrega / SINPE',
      updatedAt: 'Ahora mismo',
    };

    const hitlOrderAction = {
      id: `HITL-${Date.now()}`,
      type: 'purchase_order',
      badge: 'Pedido Cliente (HITL)',
      priority: 'Alta',
      title: `Confirmar pedido #${newOrderId} (${product.name})`,
      agentId: 'AGT-PUB',
      agentName: 'Agente Atención al Cliente',
      orderId: newOrderId,
      nextStage: 'pedido_proveedor',
      supplierId: newOrder.supplierId,
      supplierName: newOrder.supplierName,
      whatsappTarget: newOrder.supplierWhatsapp,
      impactSummary: `Costo ${formatCurrency(product.costPrice)} · Venta ${formatCurrency(
        product.salePrice
      )} · Margen ${formatCurrency(product.marginAmount)} (${product.marginPercent}%)`,
      previewMessage: `Cliente solicitó "${product.name}" (${customerText}). Autorizar envío de orden al proveedor ${newOrder.supplierName} (${newOrder.supplierWhatsapp}).`,
      createdAt: 'Ahora mismo',
    };

    setOrders((prev) => [newOrder, ...prev]);
    setPendingActions((prev) => [hitlOrderAction, ...prev]);
    pushActivity(
      'Agente Atención al Cliente',
      `Registró pedido #${newOrderId} (${product.name}) en etapa "1. Solicitud Cliente" y lo envió a HITL.`,
      'WhatsApp Cliente'
    );
    triggerToast(`Pedido #${newOrderId} creado en "Solicitud Cliente" + cola HITL.`);

    const botMsg = {
      id: `cm-${Date.now()}-a`,
      sender: 'agent',
      author: `Asesor Virtual · ${assistantConfig.businessName}`,
      time,
      text: `¡Perfecto! Hemos registrado tu solicitud #${newOrderId} por "${product.name}" (${formatCurrency(
        product.salePrice
      )}). Un asesor confirmará tu entrega en minutos.`,
    };
    const sysMsg = {
      id: `cm-${Date.now()}-s`,
      sender: 'system',
      text: `Pedido #${newOrderId} creado en "1. Solicitud Cliente" y enviado a Confirmación Humana`,
    };

    setClientMessages((prev) => [...prev, botMsg, sysMsg]);
  };

  const handleSendClientMessage = async (text) => {
    const time = nowTimeLabel();
    const userMsg = {
      id: `cm-${Date.now()}-u`,
      sender: 'user',
      author: 'Comprador WhatsApp',
      time,
      text,
    };

    if (backendOnline) {
      try {
        const res = await api.processMessage(activeTenantId, {
          fromPhone: '50689102218',
          text,
          forceMode: 'client',
        });

        const publicProducts = (res.publicProducts || []).map((p) =>
          mapBackendProduct({
            ...p,
            cost_price: 0,
            supplier_name: '',
          })
        );

        const botMsg = {
          id: `cm-${Date.now()}-a`,
          sender: 'agent',
          author: `Asesor Virtual · ${assistantConfig.businessName}`,
          time,
          text: res.replyText,
          publicProducts:
            !res.createdOrder && publicProducts.length > 0 ? publicProducts : undefined,
        };

        const extras = [userMsg, botMsg];
        if (res.createdOrder) {
          setOrders((prev) => [mapBackendOrder(res.createdOrder), ...prev]);
        }
        if (res.createdPendingAction) {
          const mappedAction = mapBackendPendingAction(res.createdPendingAction);
          setPendingActions((prev) => [mappedAction, ...prev]);
          extras.push({
            id: `cm-${Date.now()}-s`,
            sender: 'system',
            text: `Acción enviada a Confirmación Humana: ${mappedAction.title}`,
          });
          triggerToast('Solicitud registrada en backend + panel HITL.');
        }

        setClientMessages((prev) => [...prev, ...extras]);
        return;
      } catch {
        // fallback local
      }
    }

    const matchedProducts = findMatchingProducts(text, products);
    const normalized = normalizeText(text);
    const wantsToBuy =
      normalized.includes('comprar') ||
      normalized.includes('quiero') ||
      normalized.includes('pedir') ||
      normalized.includes('ordenar') ||
      normalized.includes('dame') ||
      normalized.includes('me llevo') ||
      normalized.includes('encargar');

    if (matchedProducts.length > 0 && wantsToBuy) {
      setClientMessages((prev) => [...prev, userMsg]);
      registerClientOrderFromChat(matchedProducts[0], text);
      return;
    }

    if (matchedProducts.length > 0) {
      const publicList = matchedProducts.slice(0, 2);
      const botMsg = {
        id: `cm-${Date.now()}-a`,
        sender: 'agent',
        author: `Asesor Virtual · ${assistantConfig.businessName}`,
        time,
        text: `¡Sí! Tenemos disponible ${
          publicList.length === 1 ? 'esta opción' : 'estas opciones'
        } para entrega rápida. Toca “Solicitar compra ahora” si deseas apartarlo:`,
        publicProducts: publicList,
      };
      setClientMessages((prev) => [...prev, userMsg, botMsg]);
      return;
    }

    const handoffAction = {
      id: `HITL-${Date.now()}`,
      type: 'handoff',
      badge: 'Traspaso a Humano',
      priority: 'Media',
      title: 'Cliente preguntó artículo fuera de catálogo',
      agentId: 'AGT-PUB',
      agentName: 'Agente Atención al Cliente',
      supplierName: 'Atención Manual',
      whatsappTarget: '+506 8910 2218',
      impactSummary: `Regla aplicada: ${assistantConfig.handoffRule}`,
      previewMessage: `Consulta recibida: "${text}". Requiere revisión manual del dueño para cotizar con proveedor externo.`,
      createdAt: 'Ahora mismo',
    };

    setPendingActions((prev) => [handoffAction, ...prev]);
    pushActivity(
      'Agente Atención al Cliente',
      `Escaló consulta fuera de catálogo ("${text}") según regla de traspaso.`,
      'HITL Pendiente'
    );

    const botMsg = {
      id: `cm-${Date.now()}-a`,
      sender: 'agent',
      author: `Asesor Virtual · ${assistantConfig.businessName}`,
      time,
      text: `Por el momento ese artículo no aparece en nuestro catálogo automático. Con gusto paso tu consulta a nuestro equipo humano para cotizártelo a la brevedad.`,
    };
    const sysMsg = {
      id: `cm-${Date.now()}-s`,
      sender: 'system',
      text: `Regla de traspaso activada: notificación enviada al panel HITL`,
    };
    setClientMessages((prev) => [...prev, userMsg, botMsg, sysMsg]);
  };

  const handleClientQuickBuy = (product) => {
    if (backendOnline) {
      handleSendClientMessage(`Quiero comprar 1 ${product.name}`);
      return;
    }
    const time = nowTimeLabel();
    const userMsg = {
      id: `cm-${Date.now()}-u`,
      sender: 'user',
      author: 'Comprador WhatsApp',
      time,
      text: `Quiero comprar 1x ${product.name}`,
    };
    setClientMessages((prev) => [...prev, userMsg]);
    registerClientOrderFromChat(product, `Solicitud directa de ${product.name}`);
  };

  return (
    <div className="flex min-h-screen bg-[#F5F5F7] text-[#111827] lg:h-screen lg:overflow-hidden">
      <Sidebar
        navItems={NAV_ITEMS}
        activeView={activeView}
        onSelectView={setActiveView}
        tenants={tenants}
        activeTenant={activeTenant}
        onSelectTenant={handleSelectTenant}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeOrdersCount={orders.length}
        pendingHitlCount={pendingActions.length}
        backendOnline={backendOnline}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:h-screen">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E5E7EB] bg-white/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] p-2 text-[#111827]"
              aria-label="Abrir menú"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div>
              <p className="text-sm font-bold text-[#111827]">Jarvi Stock</p>
              <p className="text-[11px] text-[#6B7280]">{activeTenant.name}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileHitlOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#6D28D9] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            HITL ({pendingActions.length})
          </button>
        </header>

        <main className="ios-scroll flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          <PipelineBar
            stages={PIPELINE_STAGES}
            orders={orders}
            selectedStage={selectedStage}
            onSelectStage={setSelectedStage}
            pendingHitlCount={pendingActions.length}
          />

          {searchQuery.trim() && (
            <div className="flex items-center justify-between rounded-2xl border border-[#DDD6FE] bg-[#F3E8FF] px-4 py-2.5 text-xs text-[#5B21B6]">
              <span className="inline-flex items-center gap-2 font-medium">
                <Search className="h-3.5 w-3.5" />
                Filtro global activo: “{searchQuery}”
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="cursor-pointer font-semibold underline hover:text-[#111827]"
              >
                Limpiar búsqueda
              </button>
            </div>
          )}

          {activeView === 'dashboard' && (
            <DashboardPage
              activeTenant={activeTenant}
              orders={filteredOrders}
              allOrders={orders}
              products={filteredProducts}
              suppliers={filteredSuppliers}
              agents={agents}
              pendingActions={pendingActions}
              activity={activity}
              stages={PIPELINE_STAGES}
              selectedStage={selectedStage}
              onClearStageFilter={() => setSelectedStage(null)}
              onTogglePickup={handleTogglePickup}
              onAdvanceOrderStage={handleAdvanceOrderStage}
              onNavigate={setActiveView}
              onOpenHitlMobile={() => setMobileHitlOpen(true)}
            />
          )}

          {activeView === 'catalog' && (
            <CatalogSuppliersPage
              products={filteredProducts}
              allProducts={products}
              suppliers={filteredSuppliers}
              allSuppliers={suppliers}
              onCreateProductAndSupplier={handleCreateProductAndSupplier}
              onRequestFromSupplier={handleRequestFromSupplier}
              onCheckSupplierStock={handleCheckSupplierStock}
            />
          )}

          {activeView === 'orders' && (
            <OrdersLogisticsPage
              orders={filteredOrders}
              allOrders={orders}
              stages={PIPELINE_STAGES}
              selectedStage={selectedStage}
              onSelectStage={setSelectedStage}
              onAdvanceOrderStage={handleAdvanceOrderStage}
              onTogglePickup={handleTogglePickup}
            />
          )}

          {activeView === 'agents' && (
            <AgentsFactoryPage
              agents={agents}
              assistantConfig={assistantConfig}
              onToggleAgent={handleToggleAgent}
              onSaveWizardConfig={handleSaveWizardConfig}
              onOpenSimulator={() => setActiveView('whatsapp')}
            />
          )}

          {activeView === 'whatsapp' && (
            <WhatsAppSimulatorPage
              activeTenant={activeTenant}
              assistantConfig={assistantConfig}
              ownerMessages={ownerMessages}
              clientMessages={clientMessages}
              onSendOwnerCommand={handleSendOwnerCommand}
              onSendClientMessage={handleSendClientMessage}
              onClientQuickBuy={handleClientQuickBuy}
            />
          )}
        </main>
      </div>

      <RightConfirmationDrawer
        pendingActions={pendingActions}
        decisionHistory={decisionHistory}
        onApprove={handleApproveAction}
        onDiscard={handleDiscardAction}
        onRestoreDemo={handleRestoreDemoHitl}
        isOpenMobile={mobileHitlOpen}
        onCloseMobile={() => setMobileHitlOpen(false)}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#111827] px-4 py-2.5 text-xs font-medium text-white shadow-2xl"
        >
          <CheckCircle2 className="h-4 w-4 text-[#C4B5FD]" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
