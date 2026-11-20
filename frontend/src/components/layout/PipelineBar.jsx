import React from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { formatCurrency } from '../../data/mockStore';

export default function PipelineBar({
  stages,
  orders,
  selectedStage,
  onSelectStage,
  pendingHitlCount,
}) {
  return (
    <section
      aria-label="Pipeline comercial"
      className="ios-card px-4 py-3.5 sm:px-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2 w-2 rounded-full bg-[#6D28D9]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#111827]">
            Pipeline Comercial Sin Inventario
          </h2>
          <span className="hidden rounded-full bg-[#F3E8FF] px-2.5 py-0.5 text-[11px] font-medium text-[#6D28D9] sm:inline-flex">
            {orders.length} pedidos en flujo
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedStage ? (
            <button
              type="button"
              onClick={() => onSelectStage(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F5F5F7] px-3 py-1 text-[11px] font-medium text-[#111827] transition hover:border-[#6D28D9]/40 hover:bg-[#EDE9FE] hover:text-[#5B21B6]"
            >
              <RotateCcw className="h-3 w-3" />
              Mostrar todas las etapas
            </button>
          ) : (
            <span className="text-[11px] text-[#6B7280]">
              Haz clic en una etapa para filtrar pedidos
            </span>
          )}
        </div>
      </div>

      {/* Chevrons horizontales */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:items-stretch lg:gap-0">
        {stages.map((stage, index) => {
          const stageOrders = orders.filter((order) => order.stage === stage.id);
          const count = stageOrders.length;
          const stageRevenue = stageOrders.reduce((acc, o) => acc + o.saleTotal, 0);
          const isSelected = selectedStage === stage.id;
          const isHitlAttention = stage.id === 'por_confirmar' && pendingHitlCount > 0;
          const subtitleText =
            stage.id === 'por_confirmar' && pendingHitlCount > 0
              ? `${pendingHitlCount} en cola HITL`
              : stageRevenue > 0
                ? `${formatCurrency(stageRevenue)} en curso`
                : 'Sin órdenes activas';

          let chevronClass = 'rounded-xl lg:rounded-none';
          if (index === 0) {
            chevronClass = 'rounded-xl lg:rounded-l-2xl lg:rounded-r-none pipeline-chevron-first';
          } else if (index === stages.length - 1) {
            chevronClass =
              'rounded-xl lg:rounded-r-2xl lg:rounded-l-none lg:-ml-2.5 pipeline-chevron-last';
          } else {
            chevronClass = 'rounded-xl lg:-ml-2.5 pipeline-chevron-mid';
          }

          let surfaceClasses =
            'bg-[#F5F5F7] text-[#111827] hover:bg-[#EDE9FE]/70 border border-[#E5E7EB] lg:border-0';
          if (isSelected) {
            surfaceClasses =
              'bg-[#6D28D9] text-white shadow-[0_6px_18px_rgba(109,40,217,0.28)]';
          } else if (isHitlAttention) {
            surfaceClasses =
              'bg-[#F3E8FF] text-[#5B21B6] hover:bg-[#EDE9FE] border border-[#DDD6FE] lg:border-0';
          } else if (count > 0) {
            surfaceClasses =
              'bg-[#111827] text-white hover:bg-[#1F2937]';
          }

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onSelectStage(isSelected ? null : stage.id)}
              title={stage.description}
              className={`group relative flex flex-1 items-center justify-between px-4 py-2.5 text-left transition-all cursor-pointer ${chevronClass} ${surfaceClasses} ${
                index > 0 ? 'lg:pl-6' : ''
              } ${index < stages.length - 1 ? 'lg:pr-5' : ''}`}
            >
              <div className="min-w-0 pr-2">
                <p
                  className={`truncate text-[12px] font-semibold leading-tight ${
                    isSelected || count > 0
                      ? isSelected
                        ? 'text-white'
                        : isHitlAttention
                          ? 'text-[#5B21B6]'
                          : 'text-white'
                      : 'text-[#111827]'
                  }`}
                >
                  {stage.label}
                </p>
                <p
                  className={`mt-0.5 truncate text-[11px] ${
                    isSelected
                      ? 'text-white/80'
                      : isHitlAttention
                        ? 'text-[#6D28D9]'
                        : count > 0
                          ? 'text-white/65'
                          : 'text-[#6B7280]'
                  }`}
                >
                  {subtitleText}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {stage.id === 'recogida_entrega' && count > 0 && !isSelected && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#EDE9FE]" />
                )}
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold ${
                    isSelected
                      ? 'bg-white text-[#6D28D9]'
                      : isHitlAttention
                        ? 'bg-[#6D28D9] text-white'
                        : count > 0
                          ? 'bg-[#6D28D9] text-white'
                          : 'bg-white text-[#6B7280] border border-[#E5E7EB]'
                  }`}
                >
                  {count}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
