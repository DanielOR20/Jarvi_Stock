import React from 'react';
import {
  ShieldAlert,
  Check,
  X,
  Bot,
  MessageCircle,
  PackagePlus,
  Send,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { buildWhatsAppLink } from '../../data/mockStore';

function getActionIcon(type) {
  if (type === 'create_product') return PackagePlus;
  if (type === 'quote_approval') return MessageCircle;
  return Send;
}

export default function RightConfirmationDrawer({
  pendingActions,
  decisionHistory,
  onApprove,
  onDiscard,
  onRestoreDemo,
  isOpenMobile,
  onCloseMobile,
}) {
  return (
    <>
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-[#0B0A10]/50 backdrop-blur-xs xl:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        aria-label="Confirmación Humana Obligatoria"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[390px] flex-col border-l border-[#E5E7EB] bg-white transition-transform duration-200 xl:static xl:z-auto xl:h-screen xl:w-[376px] xl:shrink-0 xl:translate-x-0 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl' : 'translate-x-full'
        }`}
      >
        {/* Cabecera fija HITL */}
        <div className="border-b border-[#E5E7EB] bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3E8FF] text-[#6D28D9]">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold tracking-tight text-[#111827]">
                  Confirmación Humana Obligatoria
                </h2>
                <p className="text-[11px] text-[#6B7280]">
                  Revisión HITL antes de ejecutar por WhatsApp
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#EDE9FE] px-2.5 py-1 text-[11px] font-semibold text-[#6D28D9]">
                {pendingActions.length} pendientes
              </span>
              <button
                type="button"
                onClick={onCloseMobile}
                className="rounded-xl p-1.5 text-[#6B7280] hover:bg-[#F5F5F7] hover:text-[#111827] xl:hidden"
                aria-label="Cerrar panel de confirmación"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Lista scrolleable de acciones */}
        <div className="ios-scroll flex-1 space-y-3.5 overflow-y-auto bg-[#F5F5F7]/70 p-4">
          {pendingActions.length === 0 ? (
            <div className="ios-card flex flex-col items-center px-5 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F3E8FF] text-[#6D28D9]">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-[#111827]">
                Bandeja HITL al día
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                No hay órdenes de compra ni altas de productos esperando aprobación humana.
              </p>
              <button
                type="button"
                onClick={onRestoreDemo}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-xs font-medium text-[#111827] transition hover:border-[#6D28D9]/40 hover:bg-[#F3E8FF] hover:text-[#5B21B6]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Recargar cola demo (3 acciones)
              </button>
            </div>
          ) : (
            pendingActions.map((action) => {
              const TypeIcon = getActionIcon(action.type);
              const showWaLink =
                Boolean(action.whatsappTarget) && action.type !== 'create_product';
              return (
                <article
                  key={action.id}
                  className="ios-card-interactive p-4"
                >
                  {/* Etiquetas superiores */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E8FF] px-2.5 py-1 text-[11px] font-semibold text-[#6D28D9]">
                      <TypeIcon className="h-3 w-3" />
                      {action.badge}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          action.priority === 'Alta'
                            ? 'bg-[#111827] text-white'
                            : 'border border-[#E5E7EB] bg-[#F5F5F7] text-[#6B7280]'
                        }`}
                      >
                        {action.priority}
                      </span>
                      <span className="text-[11px] text-[#6B7280]">
                        {action.createdAt}
                      </span>
                    </div>
                  </div>

                  {/* Título y metadata */}
                  <h3 className="mt-2.5 text-[13px] font-semibold leading-snug text-[#111827]">
                    {action.title}
                  </h3>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6B7280]">
                    <span className="inline-flex items-center gap-1 font-medium text-[#374151]">
                      <Bot className="h-3.5 w-3.5 text-[#6D28D9]" />
                      {action.agentName}
                    </span>
                    <span>·</span>
                    <span className="truncate">{action.whatsappTarget}</span>
                  </div>

                  {/* Impacto financiero */}
                  <div className="mt-2.5 rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] px-3 py-2 text-[11px] font-medium text-[#111827]">
                    {action.impactSummary}
                  </div>

                  {/* Mensaje WhatsApp / payload preparado */}
                  <div className="mt-2.5 rounded-xl border border-[#EDE9FE] bg-white p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#6D28D9]">
                        <Sparkles className="h-3 w-3" />
                        Borrador preparado por IA
                      </p>
                      {showWaLink && (
                        <a
                          href={buildWhatsAppLink(
                            action.whatsappTarget,
                            action.previewMessage
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#5B21B6] hover:underline"
                        >
                          wa.me
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-[#374151]">
                      “{action.previewMessage}”
                    </p>
                  </div>

                  {/* Botones funcionales */}
                  <div className="mt-3.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onApprove(action.id)}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#6D28D9] px-3 py-2.5 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(109,40,217,0.22)] transition hover:bg-[#5B21B6] active:scale-[0.99]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Aprobar y Ejecutar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDiscard(action.id)}
                      className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-xs font-medium text-[#6B7280] transition hover:border-[#111827]/20 hover:bg-[#F5F5F7] hover:text-[#111827]"
                    >
                      <X className="h-3.5 w-3.5" />
                      Descartar
                    </button>
                  </div>
                </article>
              );
            })
          )}

          {/* Historial de decisiones humanas recientes */}
          {decisionHistory.length > 0 && (
            <div className="pt-2">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Últimas decisiones ({decisionHistory.length})
              </p>
              <div className="space-y-2">
                {decisionHistory.slice(0, 4).map((item) => (
                  <div
                    key={item.id + item.decidedAt}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[#111827]">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#6B7280]">
                        {item.resultNote} · {item.decidedAt}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        item.decision === 'approved'
                          ? 'bg-[#EDE9FE] text-[#5B21B6]'
                          : 'border border-[#E5E7EB] bg-[#F5F5F7] text-[#6B7280]'
                      }`}
                    >
                      {item.decision === 'approved' ? 'Ejecutado' : 'Descartado'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
