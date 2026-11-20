import React from 'react';
import {
  TrendingUp,
  ShoppingBag,
  Layers,
  MapPin,
  Phone,
  Clock,
  CheckCircle2,
  Bot,
  ArrowUpRight,
  CircleDot,
  Sparkles,
} from 'lucide-react';
import { formatCurrency } from '../data/mockStore';

function getStageBadge(stages, stageId) {
  const stage = stages.find((s) => s.id === stageId);
  return stage ? stage.label : stageId;
}

export default function DashboardPage({
  activeTenant,
  orders,
  allOrders,
  products,
  suppliers,
  agents,
  pendingActions,
  activity,
  stages,
  selectedStage,
  onClearStageFilter,
  onTogglePickup,
  onAdvanceOrderStage,
  onNavigate,
  onOpenHitlMobile,
}) {
  const totalSales = allOrders.reduce((sum, o) => sum + o.saleTotal, 0);
  const totalCost = allOrders.reduce((sum, o) => sum + o.costTotal, 0);
  const totalMargin = allOrders.reduce((sum, o) => sum + o.marginTotal, 0);
  const avgOrderMarginPct =
    totalSales > 0 ? Math.round((totalMargin / totalSales) * 1000) / 10 : 0;

  const avgCatalogMarginPct =
    products.length > 0
      ? Math.round(
          (products.reduce((sum, p) => sum + p.marginPercent, 0) / products.length) * 10
        ) / 10
      : 0;

  const pendingPickups = allOrders.filter((o) => !o.pickupCompleted);
  const activeAgentsCount = agents.filter((a) => a.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Encabezado contextual */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6D28D9]">
            {activeTenant.name} · Operación Sin Inventario
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[#111827]">
            Centro de Control Comercial
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('whatsapp')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-semibold text-[#111827] shadow-xs transition hover:border-[#6D28D9]/40 hover:bg-[#F3E8FF] hover:text-[#5B21B6]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#6D28D9]" />
            Simular pedido WhatsApp
          </button>

          <button
            type="button"
            onClick={onOpenHitlMobile}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-[#111827] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#1F2937] xl:hidden"
          >
            Bandeja HITL
            <span className="rounded-full bg-[#6D28D9] px-2 py-0.5 text-[10px]">
              {pendingActions.length}
            </span>
          </button>
        </div>
      </div>

      {/* 3 Tarjetas KPI de alto contraste: Negro, Morado y Blanco */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* KPI 1: Negro Carbón (#111827) */}
        <article className="relative overflow-hidden rounded-2xl bg-[#111827] p-5 text-white shadow-[0_10px_26px_rgba(17,24,39,0.16)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-white/65">
                Margen Neto Proyectado
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white">
                {formatCurrency(totalMargin)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-[#EDE9FE]">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
            <span className="text-white/65">
              Venta {formatCurrency(totalSales)} · Costo {formatCurrency(totalCost)}
            </span>
            <span className="rounded-full bg-[#EDE9FE] px-2.5 py-0.5 text-[11px] font-bold text-[#5B21B6]">
              {avgOrderMarginPct}% margen
            </span>
          </div>
        </article>

        {/* KPI 2: Morado Real (#6D28D9) */}
        <article className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#6D28D9] to-[#5B21B6] p-5 text-white shadow-[0_12px_28px_rgba(109,40,217,0.28)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-white/80">
                Pedidos Activos en Pipeline
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white">
                {allOrders.length}{' '}
                <span className="text-base font-medium text-white/80">órdenes</span>
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white">
              <ShoppingBag className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3 text-xs">
            <span className="text-white/85">
              {pendingPickups.length} recogidas pendientes hoy
            </span>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#5B21B6]">
              {pendingActions.length} HITL
            </span>
          </div>
        </article>

        {/* KPI 3: Blanco Puro (#FFFFFF) */}
        <article className="ios-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-[#6B7280]">
                Catálogo Sin Stock & Red Local
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-[#111827]">
                {products.length}{' '}
                <span className="text-base font-medium text-[#6B7280]">SKUs</span>
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F3E8FF] text-[#6D28D9]">
              <Layers className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-[#E5E7EB] pt-3 text-xs">
            <span className="text-[#6B7280]">
              {suppliers.length} proveedores · {activeAgentsCount} agentes activos
            </span>
            <span className="rounded-full bg-[#F3E8FF] px-2.5 py-0.5 text-[11px] font-bold text-[#6D28D9]">
              {avgCatalogMarginPct}% prom.
            </span>
          </div>
        </article>
      </div>

      {/* Resumen de márgenes y pedidos activos */}
      <section className="ios-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111827]">
              Resumen de Márgenes y Pedidos Activos
            </h2>
            <p className="text-xs text-[#6B7280]">
              Capital propio inmovilizado: ₡0 · Compra contra pedido validado
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedStage && (
              <button
                type="button"
                onClick={onClearStageFilter}
                className="rounded-full bg-[#EDE9FE] px-3 py-1 text-[11px] font-semibold text-[#5B21B6] transition hover:bg-[#DDD6FE]"
              >
                Filtro: {getStageBadge(stages, selectedStage)} ×
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3 py-1.5 text-xs font-medium text-[#111827] transition hover:border-[#6D28D9]/40 hover:bg-[#F3E8FF] hover:text-[#5B21B6]"
            >
              Ver logística completa
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-[#111827]">
              No hay pedidos que coincidan con el filtro actual
            </p>
            <p className="mt-1 text-xs text-[#6B7280]">
              Limpia el filtro de etapa o el buscador para ver toda la operación.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {orders.map((order) => {
              const marginPct =
                order.saleTotal > 0
                  ? Math.round((order.marginTotal / order.saleTotal) * 1000) / 10
                  : 0;
              const isFinalStage = order.stage === 'recogida_entrega';

              return (
                <div
                  key={order.id}
                  className="flex flex-col gap-4 px-5 py-4 transition hover:bg-[#FAFAFB] md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-[#111827] px-2 py-0.5 text-[11px] font-bold text-white">
                        {order.displayId || order.id}
                      </span>
                      <span className="text-sm font-semibold text-[#111827]">
                        {order.customerName}
                      </span>
                      <span className="rounded-full bg-[#F3E8FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#6D28D9]">
                        {getStageBadge(stages, order.stage)}
                      </span>
                      <span className="text-[11px] text-[#6B7280]">
                        · {order.updatedAt}
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs font-medium text-[#374151]">
                      {order.itemsSummary}{' '}
                      <span className="text-[#6B7280]">
                        · Proveedor: {order.supplierName} ({order.deliveryZone})
                      </span>
                    </p>

                    {/* Barra visual de relación costo vs margen */}
                    <div className="mt-2.5 flex max-w-md items-center gap-2.5">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E5E7EB]">
                        <div
                          className="h-full rounded-full bg-[#6D28D9]"
                          style={{ width: `${Math.min(100, marginPct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-[#5B21B6]">
                        {marginPct}% margen
                      </span>
                    </div>
                  </div>

                  {/* Cifras y acción rápida */}
                  <div className="flex flex-wrap items-center justify-between gap-4 md:justify-end">
                    <div className="grid grid-cols-3 gap-4 text-right">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6B7280]">
                          Costo
                        </p>
                        <p className="text-xs font-semibold text-[#374151]">
                          {formatCurrency(order.costTotal)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6B7280]">
                          Venta
                        </p>
                        <p className="text-xs font-semibold text-[#111827]">
                          {formatCurrency(order.saleTotal)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[#6D28D9]">
                          Margen
                        </p>
                        <p className="text-xs font-bold text-[#6D28D9]">
                          +{formatCurrency(order.marginTotal)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isFinalStage}
                      onClick={() => onAdvanceOrderStage(order.id)}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        isFinalStage
                          ? 'cursor-default border border-[#E5E7EB] bg-[#F5F5F7] text-[#6B7280]'
                          : 'cursor-pointer border border-[#E5E7EB] bg-white text-[#111827] hover:border-[#6D28D9] hover:bg-[#F3E8FF] hover:text-[#5B21B6]'
                      }`}
                    >
                      {isFinalStage ? 'En entrega' : 'Avanzar etapa'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Fila inferior: Recogidas pendientes por proveedor + Actividad reciente de agentes */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Lista rápida de recogidas pendientes por proveedor */}
        <section className="ios-card flex flex-col">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[#111827]">
                Recogidas Pendientes por Proveedor
              </h2>
              <p className="text-xs text-[#6B7280]">
                Coordinación de recolección local sin bodega propia
              </p>
            </div>
            <span className="rounded-full bg-[#111827] px-2.5 py-1 text-[11px] font-semibold text-white">
              {pendingPickups.length} activas
            </span>
          </div>

          <div className="divide-y divide-[#E5E7EB]">
            {allOrders.map((order) => (
              <div
                key={`pickup-${order.id}`}
                className="flex items-start justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#111827]">
                      {order.supplierName}
                    </span>
                    <span className="rounded-full bg-[#F5F5F7] px-2 py-0.5 text-[10px] font-semibold text-[#6B7280] border border-[#E5E7EB]">
                      {order.displayId || order.id}
                    </span>
                  </div>
                  <p className="text-xs text-[#374151]">{order.itemsSummary}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B7280]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-[#6D28D9]" />
                      {order.supplierLocation}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3 text-[#111827]" />
                      {order.supplierWhatsapp}
                    </span>
                  </div>
                  <p className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5B21B6]">
                    <Clock className="h-3 w-3" />
                    {order.pickupSlot}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onTogglePickup(order.id)}
                  className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${
                    order.pickupCompleted
                      ? 'bg-[#EDE9FE] text-[#5B21B6]'
                      : 'border border-[#E5E7EB] bg-white text-[#111827] hover:border-[#6D28D9] hover:bg-[#F3E8FF] hover:text-[#5B21B6]'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {order.pickupCompleted ? 'Recogido' : 'Marcar recogido'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Actividad reciente de agentes */}
        <section className="ios-card flex flex-col">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[#111827]">
                Actividad Reciente de Agentes
              </h2>
              <p className="text-xs text-[#6B7280]">
                Trazabilidad en vivo de cotizaciones, WhatsApp y HITL
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('agents')}
              className="cursor-pointer rounded-full bg-[#F3E8FF] px-3 py-1 text-[11px] font-semibold text-[#6D28D9] transition hover:bg-[#EDE9FE]"
            >
              {activeAgentsCount} activos
            </button>
          </div>

          <div className="divide-y divide-[#E5E7EB]">
            {activity.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F5F5F7] border border-[#E5E7EB] text-[#6D28D9]">
                  {item.tag.includes('HITL') || item.tag.includes('Ejecutado') ? (
                    <CircleDot className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#111827]">
                      {item.agentName}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#F3E8FF] px-2 py-0.5 text-[10px] font-semibold text-[#6D28D9]">
                        {item.tag}
                      </span>
                      <span className="text-[11px] text-[#6B7280]">{item.time}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#374151]">
                    {item.action}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
