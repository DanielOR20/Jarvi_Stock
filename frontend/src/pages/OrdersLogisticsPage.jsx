import React, { useMemo, useState } from 'react';
import {
  MapPin,
  Phone,
  ArrowRight,
  CheckCircle2,
  Clock,
  Route,
  ExternalLink,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { buildWhatsAppLink, formatCurrency } from '../data/mockStore';

export default function OrdersLogisticsPage({
  orders,
  allOrders,
  stages,
  selectedStage,
  onSelectStage,
  onAdvanceOrderStage,
  onTogglePickup,
}) {
  const [viewMode, setViewMode] = useState('table');
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  // Ruta de Recogida del Día: agrupa automáticamente los pedidos en etapa "pedido_proveedor" por distribuidor y ubicación
  const dailyPickupRoutes = useMemo(() => {
    const readyOrders = allOrders.filter(
      (order) => order.stage === 'pedido_proveedor'
    );
    const grouped = new Map();

    readyOrders.forEach((order) => {
      const key = `${order.supplierId}::${order.supplierLocation}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          supplierId: order.supplierId,
          supplierName: order.supplierName,
          supplierLocation: order.supplierLocation,
          supplierWhatsapp: order.supplierWhatsapp,
          orders: [],
          totalCost: 0,
        });
      }
      const entry = grouped.get(key);
      entry.orders.push(order);
      entry.totalCost += order.costTotal;
    });

    return Array.from(grouped.values());
  }, [allOrders]);

  return (
    <div className="space-y-6">
      {/* Encabezado y filtros sincronizados con las 5 etapas */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6D28D9]">
            Ejecución Última Milla & Proveedores
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[#111827]">
            Pedidos y Logística
          </h1>
        </div>

        <div className="inline-flex rounded-2xl border border-[#E5E7EB] bg-white p-1">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'table'
                ? 'bg-[#111827] text-white'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Tabla
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'cards'
                ? 'bg-[#111827] text-white'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Tarjetas
          </button>
        </div>
      </div>

      {/* Tarjeta resumen superior: Ruta de Recogida del Día */}
      <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#111827] text-white shadow-[0_12px_28px_rgba(17,24,39,0.14)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#6D28D9] text-white">
              <Route className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white">
                Ruta de Recogida del Día
              </h2>
              <p className="text-xs text-white/65">
                Pedidos en etapa “4. Pedido a Proveedor” agrupados por distribuidor y ubicación
              </p>
            </div>
          </div>

          <span className="rounded-full bg-[#EDE9FE] px-3 py-1 text-xs font-bold text-[#5B21B6]">
            {dailyPickupRoutes.length}{' '}
            {dailyPickupRoutes.length === 1 ? 'parada activa' : 'paradas activas'}
          </span>
        </div>

        <div className="p-5">
          {dailyPickupRoutes.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-6 text-center">
              <p className="text-xs font-medium text-white/80">
                No hay pedidos pendientes en etapa “Pedido a Proveedor”.
              </p>
              <p className="mt-1 text-[11px] text-white/55">
                Aprueba una Orden de Compra en el panel derecho o avanza un pedido para sumarlo a la ruta de hoy.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              {dailyPickupRoutes.map((stop, idx) => {
                const waText = `Hola ${stop.supplierName}, vamos en camino a recoger los pedidos: ${stop.orders
                  .map((o) => `${o.id} (${o.itemsSummary})`)
                  .join(', ')}.`;

                return (
                  <div
                    key={stop.key}
                    className="flex flex-col justify-between rounded-2xl border border-white/12 bg-white/[0.06] p-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="rounded-full bg-[#6D28D9] px-2.5 py-0.5 text-[10px] font-bold text-white">
                            Parada #{idx + 1}
                          </span>
                          <h3 className="mt-2 text-sm font-semibold text-white">
                            {stop.supplierName}
                          </h3>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-white/60">Pago en bodega</p>
                          <p className="text-sm font-bold text-[#EDE9FE]">
                            {formatCurrency(stop.totalCost)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 space-y-1 text-xs text-white/75">
                        <p className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#C4B5FD]" />
                          <span>{stop.supplierLocation}</span>
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-[#C4B5FD]" />
                          <span>{stop.supplierWhatsapp}</span>
                        </p>
                      </div>

                      <div className="mt-3 space-y-1.5">
                        {stop.orders.map((order) => (
                          <div
                            key={order.id}
                            className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.07] px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-[#EDE9FE]">
                                {order.displayId || order.id}
                              </span>{' '}
                              <span className="text-white/90">
                                · {order.itemsSummary}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => onTogglePickup(order.id)}
                              className="shrink-0 cursor-pointer rounded-lg bg-[#6D28D9] px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-[#5B21B6]"
                            >
                              Recogido
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end border-t border-white/10 pt-3">
                      <a
                        href={buildWhatsAppLink(stop.supplierWhatsapp, waText)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-[11px] font-semibold text-[#111827] transition hover:bg-[#EDE9FE] hover:text-[#5B21B6]"
                      >
                        Avisar llegada por WhatsApp
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Selector de etapas sincronizado con PipelineBar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSelectStage(null)}
          className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            !selectedStage
              ? 'bg-[#111827] text-white'
              : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
          }`}
        >
          Todas ({allOrders.length})
        </button>
        {stages.map((stage) => {
          const count = allOrders.filter((o) => o.stage === stage.id).length;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() =>
                onSelectStage(selectedStage === stage.id ? null : stage.id)
              }
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                selectedStage === stage.id
                  ? 'bg-[#6D28D9] text-white'
                  : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#6D28D9]/40 hover:text-[#111827]'
              }`}
            >
              {stage.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Vista Tabla o Tarjetas */}
      {orders.length === 0 ? (
        <div className="ios-card px-6 py-12 text-center">
          <p className="text-sm font-semibold text-[#111827]">
            No hay pedidos en esta etapa del pipeline
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">
            Selecciona otra etapa arriba o avanza pedidos existentes.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <section className="ios-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#FAFAFB] text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  <th className="px-5 py-3.5">Pedido / Cliente</th>
                  <th className="px-4 py-3.5">Etapa Pipeline</th>
                  <th className="px-4 py-3.5">Proveedor Responsable</th>
                  <th className="px-4 py-3.5 text-right">Venta / Margen</th>
                  <th className="px-5 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {orders.map((order) => {
                  const stageObj = stages.find((s) => s.id === order.stage);
                  const isLastStage = order.stage === 'recogida_entrega';
                  const isExpanded = expandedOrderId === order.id;
                  const marginPct =
                    order.saleTotal > 0
                      ? Math.round((order.marginTotal / order.saleTotal) * 1000) / 10
                      : 0;

                  return (
                    <React.Fragment key={order.id}>
                      <tr className="transition hover:bg-[#FAFAFB]">
                        <td className="px-5 py-4 align-top">
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg bg-[#111827] px-2 py-0.5 text-[11px] font-bold text-white">
                              {order.displayId || order.id}
                            </span>
                            <span className="text-sm font-semibold text-[#111827]">
                              {order.customerName}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-medium text-[#374151]">
                            {order.itemsSummary}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#6B7280]">
                            {order.deliveryZone}
                          </p>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <span className="inline-flex rounded-full bg-[#F3E8FF] px-3 py-1 text-[11px] font-semibold text-[#6D28D9]">
                            {stageObj?.label || order.stage}
                          </span>
                          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#6B7280]">
                            <Clock className="h-3 w-3" />
                            {order.pickupSlot}
                          </p>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <p className="text-xs font-semibold text-[#111827]">
                            {order.supplierName}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#6B7280]">
                            {order.supplierWhatsapp}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#6B7280]">
                            {order.supplierLocation}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-right align-top">
                          <p className="text-sm font-bold text-[#111827]">
                            {formatCurrency(order.saleTotal)}
                          </p>
                          <p className="text-xs font-bold text-[#6D28D9]">
                            +{formatCurrency(order.marginTotal)} ({marginPct}%)
                          </p>
                          <p className="text-[11px] text-[#6B7280]">
                            Costo {formatCurrency(order.costTotal)}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-right align-top">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedOrderId(isExpanded ? null : order.id)
                              }
                              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-2 text-[11px] font-medium text-[#111827] hover:bg-[#F5F5F7]"
                            >
                              Detalle
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={isLastStage}
                              onClick={() => onAdvanceOrderStage(order.id)}
                              className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${
                                isLastStage
                                  ? 'cursor-default bg-[#F5F5F7] text-[#6B7280]'
                                  : 'cursor-pointer bg-[#6D28D9] text-white hover:bg-[#5B21B6]'
                              }`}
                            >
                              {isLastStage ? 'Completado' : 'Avanzar'}
                              {!isLastStage && <ArrowRight className="h-3 w-3" />}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#FAFAFB]">
                          <td colSpan={5} className="px-5 py-3.5">
                            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-3.5 text-xs">
                              <div className="space-y-1">
                                <p className="font-semibold text-[#111827]">
                                  Cliente: {order.customerName} · {order.customerWhatsapp}
                                </p>
                                <p className="text-[#6B7280]">
                                  Dirección entrega: {order.deliveryZone} · Pago:{' '}
                                  {order.paymentMethod || 'Contra entrega'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={buildWhatsAppLink(
                                    order.customerWhatsapp,
                                    `Hola ${order.customerName}, actualización de tu pedido ${order.id}: ${order.pickupSlot}.`
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3 py-1.5 text-[11px] font-semibold text-[#111827] hover:bg-[#EDE9FE] hover:text-[#5B21B6]"
                                >
                                  WhatsApp Cliente
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => onTogglePickup(order.id)}
                                  className={`inline-flex cursor-pointer items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-semibold ${
                                    order.pickupCompleted
                                      ? 'bg-[#EDE9FE] text-[#5B21B6]'
                                      : 'bg-[#111827] text-white'
                                  }`}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {order.pickupCompleted
                                    ? 'Recolección confirmada'
                                    : 'Confirmar recogida'}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {orders.map((order) => {
            const stageObj = stages.find((s) => s.id === order.stage);
            const isLastStage = order.stage === 'recogida_entrega';
            const marginPct =
              order.saleTotal > 0
                ? Math.round((order.marginTotal / order.saleTotal) * 1000) / 10
                : 0;

            return (
              <article key={order.id} className="ios-card-interactive p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-[#111827] px-2.5 py-0.5 text-xs font-bold text-white">
                        {order.displayId || order.id}
                      </span>
                      <span className="rounded-full bg-[#F3E8FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#6D28D9]">
                        {stageObj?.label || order.stage}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-[#111827]">
                      {order.customerName}
                    </h3>
                    <p className="text-xs text-[#6B7280]">
                      {order.customerWhatsapp} · {order.deliveryZone}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-[#6B7280]">Margen ({marginPct}%)</p>
                    <p className="text-base font-bold text-[#6D28D9]">
                      +{formatCurrency(order.marginTotal)}
                    </p>
                    <p className="text-[11px] text-[#6B7280]">
                      Venta {formatCurrency(order.saleTotal)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] p-3.5 text-xs">
                  <p className="font-semibold text-[#111827]">{order.itemsSummary}</p>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 text-[#374151] sm:grid-cols-2">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#6D28D9]" />
                      {order.supplierName}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-[#111827]" />
                      {order.supplierWhatsapp}
                    </span>
                  </div>
                  <p className="mt-2 inline-flex items-center gap-1.5 font-medium text-[#5B21B6]">
                    <Clock className="h-3.5 w-3.5" />
                    {order.pickupSlot}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onTogglePickup(order.id)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      order.pickupCompleted
                        ? 'bg-[#EDE9FE] text-[#5B21B6]'
                        : 'border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {order.pickupCompleted ? 'Recolección completada' : 'Marcar recolección'}
                  </button>

                  <button
                    type="button"
                    disabled={isLastStage}
                    onClick={() => onAdvanceOrderStage(order.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                      isLastStage
                        ? 'cursor-default bg-[#F5F5F7] text-[#6B7280]'
                        : 'cursor-pointer bg-[#6D28D9] text-white hover:bg-[#5B21B6]'
                    }`}
                  >
                    {isLastStage ? 'Etapa final alcanzada' : 'Avanzar de etapa'}
                    {!isLastStage && <ArrowRight className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
