import React, { useState } from 'react';
import {
  Bot,
  ShieldCheck,
  Sparkles,
  Power,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  Lock,
  EyeOff,
  Building2,
  MessageSquareText,
  Sliders,
  RotateCcw,
} from 'lucide-react';

const HANDOFF_PRESETS = [
  'Escalar al dueño por WhatsApp y pausar respuestas automáticas',
  'Tomar nombre y necesidad del cliente, y prometer respuesta en 10 min',
  'Ofrecer productos similares del catálogo antes de escalar a humano',
];

const STEPS = [
  { id: 1, title: 'Negocio y giro', short: 'Negocio' },
  { id: 2, title: 'Nombre activación', short: 'Asistente' },
  { id: 3, title: 'WhatsApp del dueño', short: 'Dueño' },
  { id: 4, title: 'Margen sugerido', short: 'Margen' },
  { id: 5, title: 'Regla de traspaso', short: 'Traspaso' },
];

export default function AgentsFactoryPage({
  agents,
  assistantConfig,
  onToggleAgent,
  onSaveWizardConfig,
  onOpenSimulator,
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardDone, setWizardDone] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [form, setForm] = useState({
    businessName: assistantConfig.businessName || 'NovaGadgets CR',
    businessIndustry:
      assistantConfig.businessIndustry || 'Tecnología y accesorios sin stock',
    wakeWord: assistantConfig.wakeWord || 'Jarvis',
    ownerWhatsapp: assistantConfig.ownerWhatsapp || '+506 8888 8888',
    defaultMarginPct: assistantConfig.defaultMarginPct || 40,
    handoffRule:
      assistantConfig.handoffRule ||
      'Escalar al dueño por WhatsApp y pausar respuestas automáticas',
  });

  const canContinue = () => {
    if (currentStep === 1) {
      return form.businessName.trim().length > 1 && form.businessIndustry.trim().length > 1;
    }
    if (currentStep === 2) return form.wakeWord.trim().length > 1;
    if (currentStep === 3) return form.ownerWhatsapp.trim().length >= 8;
    if (currentStep === 4) {
      return Number(form.defaultMarginPct) >= 5 && Number(form.defaultMarginPct) <= 90;
    }
    return form.handoffRule.trim().length > 3;
  };

  const handleNext = () => {
    if (!canContinue()) return;
    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1);
      return;
    }
    onSaveWizardConfig({
      businessName: form.businessName.trim(),
      businessIndustry: form.businessIndustry.trim(),
      wakeWord: form.wakeWord.trim(),
      ownerWhatsapp: form.ownerWhatsapp.trim(),
      defaultMarginPct: Number(form.defaultMarginPct),
      handoffRule: form.handoffRule.trim(),
    });
    setWizardDone(true);
  };

  const handleResetWizard = () => {
    setCurrentStep(1);
    setWizardDone(false);
  };

  const handleCopyCode = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(assistantConfig.activationCode).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const progressPct = wizardDone ? 100 : (currentStep / 5) * 100;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6D28D9]">
            Configurador Sin Código · Dual Agent Architecture
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[#111827]">
            Fábrica de Agentes
          </h1>
        </div>

        <button
          type="button"
          onClick={onOpenSimulator}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-[#111827] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#6D28D9]"
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          Probar en Simulador WhatsApp
        </button>
      </div>

      {/* Asistente interactivo de 5 preguntas paso a paso */}
      <section className="ios-card overflow-hidden">
        <div className="border-b border-[#E5E7EB] bg-[#FAFAFB] px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6D28D9] text-white">
                <Sliders className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-[#111827]">
                  Asistente de Configuración de Agentes (5 pasos)
                </h2>
                <p className="text-xs text-[#6B7280]">
                  Genera tu Asistente Privado del Dueño + Agente Público de Ventas sin código
                </p>
              </div>
            </div>

            <span className="rounded-full bg-[#EDE9FE] px-3 py-1 text-xs font-bold text-[#5B21B6]">
              {wizardDone ? 'Configuración lista' : `Paso ${currentStep} de 5`}
            </span>
          </div>

          {/* Barra de progreso + indicadores de paso */}
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
            <div
              className="h-full rounded-full bg-[#6D28D9] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2">
            {STEPS.map((step) => {
              const isCurrent = !wizardDone && currentStep === step.id;
              const isCompleted = wizardDone || currentStep > step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (wizardDone || step.id <= currentStep) {
                      setWizardDone(false);
                      setCurrentStep(step.id);
                    }
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition ${
                    isCurrent
                      ? 'bg-[#6D28D9] text-white'
                      : isCompleted
                        ? 'bg-[#F3E8FF] text-[#5B21B6] cursor-pointer'
                        : 'bg-white text-[#6B7280] border border-[#E5E7EB]'
                  }`}
                >
                  <span>{step.id}.</span>
                  <span className="hidden sm:inline">{step.short}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cuerpo del paso actual o resultado final */}
        <div className="p-6">
          {!wizardDone ? (
            <div className="mx-auto max-w-2xl space-y-5">
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E8FF] px-3 py-1 text-[11px] font-semibold text-[#6D28D9]">
                      <Building2 className="h-3.5 w-3.5" />
                      Pregunta 1 de 5
                    </span>
                    <h3 className="mt-2.5 text-lg font-bold text-[#111827]">
                      ¿Cuál es el nombre de tu negocio y su giro comercial?
                    </h3>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      Los agentes usarán esta identidad para presentarse con clientes y proveedores.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[#111827]">
                        Nombre del negocio
                      </label>
                      <input
                        type="text"
                        value={form.businessName}
                        onChange={(e) =>
                          setForm({ ...form, businessName: e.target.value })
                        }
                        placeholder="Ej. Repuestos MotoASAP"
                        className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F5F5F7] px-4 py-3 text-sm text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[#111827]">
                        Giro comercial
                      </label>
                      <input
                        type="text"
                        value={form.businessIndustry}
                        onChange={(e) =>
                          setForm({ ...form, businessIndustry: e.target.value })
                        }
                        placeholder="Ej. Repuestos de moto, gadgets, hogar..."
                        className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F5F5F7] px-4 py-3 text-sm text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E8FF] px-3 py-1 text-[11px] font-semibold text-[#6D28D9]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Pregunta 2 de 5
                    </span>
                    <h3 className="mt-2.5 text-lg font-bold text-[#111827]">
                      ¿Con qué nombre activarás a tu asistente personal privado?
                    </h3>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      Cuando escribas por WhatsApp desde tu número autorizado, responderá este asistente.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#111827]">
                      Nombre de activación
                    </label>
                    <input
                      type="text"
                      value={form.wakeWord}
                      onChange={(e) =>
                        setForm({ ...form, wakeWord: e.target.value })
                      }
                      placeholder="Ej. Jarvis"
                      className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F5F5F7] px-4 py-3 text-sm font-semibold text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                    />
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {['Jarvis', 'Jarvi Pro', 'Copiloto Stock', 'Nexo'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setForm({ ...form, wakeWord: preset })}
                          className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition ${
                            form.wakeWord === preset
                              ? 'bg-[#111827] text-white'
                              : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E8FF] px-3 py-1 text-[11px] font-semibold text-[#6D28D9]">
                      <Lock className="h-3.5 w-3.5" />
                      Pregunta 3 de 5
                    </span>
                    <h3 className="mt-2.5 text-lg font-bold text-[#111827]">
                      ¿Cuál es el número de WhatsApp del dueño autorizado?
                    </h3>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      Solo este número podrá consultar costos, márgenes, proveedores y aprobar órdenes HITL.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#111827]">
                      WhatsApp del dueño
                    </label>
                    <input
                      type="tel"
                      value={form.ownerWhatsapp}
                      onChange={(e) =>
                        setForm({ ...form, ownerWhatsapp: e.target.value })
                      }
                      placeholder="+506 8888 8888"
                      className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F5F5F7] px-4 py-3 text-sm font-semibold text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E8FF] px-3 py-1 text-[11px] font-semibold text-[#6D28D9]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Pregunta 4 de 5
                    </span>
                    <h3 className="mt-2.5 text-lg font-bold text-[#111827]">
                      ¿Qué margen de ganancia sugerido deseas aplicar por defecto?
                    </h3>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      Cuando subas una foto o lista de costos de proveedor, tu asistente calculará el precio de venta sugerido con este margen.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAFB] p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#6B7280]">
                        Margen objetivo sobre venta
                      </span>
                      <span className="rounded-full bg-[#6D28D9] px-3.5 py-1 text-base font-bold text-white">
                        {form.defaultMarginPct}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min="15"
                      max="70"
                      value={form.defaultMarginPct}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          defaultMarginPct: Number(e.target.value),
                        })
                      }
                      className="mt-4 w-full accent-[#6D28D9]"
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[25, 35, 40, 50].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() =>
                            setForm({ ...form, defaultMarginPct: pct })
                          }
                          className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition ${
                            Number(form.defaultMarginPct) === pct
                              ? 'bg-[#111827] text-white'
                              : 'border border-[#E5E7EB] bg-white text-[#6B7280]'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3E8FF] px-3 py-1 text-[11px] font-semibold text-[#6D28D9]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Pregunta 5 de 5
                    </span>
                    <h3 className="mt-2.5 text-lg font-bold text-[#111827]">
                      Regla de traspaso a humano si un cliente pregunta algo fuera de catálogo
                    </h3>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      Evita alucinaciones: define cómo actuará el agente público cuando no exista el producto.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {HANDOFF_PRESETS.map((rule) => (
                      <button
                        key={rule}
                        type="button"
                        onClick={() => setForm({ ...form, handoffRule: rule })}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 text-left text-xs font-medium transition ${
                          form.handoffRule === rule
                            ? 'border-[#6D28D9] bg-[#F3E8FF] text-[#5B21B6]'
                            : 'border-[#E5E7EB] bg-[#FAFAFB] text-[#111827] hover:bg-white'
                        }`}
                      >
                        <span>{rule}</span>
                        {form.handoffRule === rule && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#6D28D9]" />
                        )}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={2}
                    value={form.handoffRule}
                    onChange={(e) =>
                      setForm({ ...form, handoffRule: e.target.value })
                    }
                    className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F5F5F7] px-4 py-2.5 text-xs text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                  />
                </div>
              )}

              {/* Controles de paso */}
              <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-5">
                <button
                  type="button"
                  disabled={currentStep === 1}
                  onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                    currentStep === 1
                      ? 'cursor-not-allowed text-[#9CA3AF]'
                      : 'cursor-pointer border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F5F5F7]'
                  }`}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Anterior
                </button>

                <button
                  type="button"
                  disabled={!canContinue()}
                  onClick={handleNext}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#6D28D9] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(109,40,217,0.25)] transition hover:bg-[#5B21B6] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {currentStep === 5 ? 'Generar Perfiles de Agentes' : 'Siguiente'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Resumen generado al completar las 5 preguntas */
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#111827] p-5 text-white">
                <div>
                  <span className="rounded-full bg-[#6D28D9] px-3 py-1 text-[11px] font-bold text-white">
                    Perfiles generados y guardados
                  </span>
                  <h3 className="mt-2 text-lg font-bold">
                    {assistantConfig.businessName} · Asistente “{assistantConfig.wakeWord}”
                  </h3>
                  <p className="mt-0.5 text-xs text-white/70">
                    Dueño autorizado: {assistantConfig.ownerWhatsapp} · Margen base:{' '}
                    {assistantConfig.defaultMarginPct}%
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-white/60">
                        Código de activación
                      </p>
                      <p className="text-sm font-bold tracking-wider text-[#EDE9FE]">
                        {assistantConfig.activationCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="cursor-pointer rounded-xl bg-white/15 p-2 text-white hover:bg-[#6D28D9]"
                      title="Copiar código de activación"
                    >
                      {copiedCode ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetWizard}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reconfigurar
                  </button>
                </div>
              </div>

              {/* Dos perfiles generados: Asistente del Dueño (privado) + Agente Atención al Cliente (público) */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Perfil 1: Asistente del Dueño */}
                <article className="rounded-2xl border border-[#DDD6FE] bg-[#F3E8FF]/50 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#111827] text-white">
                        <Lock className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="rounded-full bg-[#111827] px-2.5 py-0.5 text-[10px] font-bold text-white">
                          PRIVADO · HITL OBLIGATORIO
                        </span>
                        <h4 className="mt-1 text-base font-bold text-[#111827]">
                          Asistente del Dueño ({assistantConfig.wakeWord})
                        </h4>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-[#374151]">
                    Operador interno exclusivo para{' '}
                    <strong>{assistantConfig.ownerWhatsapp}</strong>. Interpreta comandos de voz/texto y fotos de listas de precios, calcula el{' '}
                    <strong>{assistantConfig.defaultMarginPct}%</strong> de margen y encola cada escritura en el panel derecho de Confirmación Humana.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-[#DDD6FE] bg-white p-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase text-[#6B7280]">Tope diario</p>
                      <p className="font-bold text-[#111827]">
                        {assistantConfig.usageCaps.ownerCommandsPerDay} comandos/día
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-[#6B7280]">Visibilidad</p>
                      <p className="font-bold text-[#6D28D9]">Costos + Proveedores</p>
                    </div>
                  </div>
                </article>

                {/* Perfil 2: Agente de Atención al Cliente */}
                <article className="ios-card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#6D28D9] text-white">
                        <EyeOff className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="rounded-full bg-[#EDE9FE] px-2.5 py-0.5 text-[10px] font-bold text-[#5B21B6]">
                          PÚBLICO · B2C WHATSAPP
                        </span>
                        <h4 className="mt-1 text-base font-bold text-[#111827]">
                          Agente de Atención al Cliente
                        </h4>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-[#374151]">
                    Atiende consultas de compradores para{' '}
                    <strong>{assistantConfig.businessName}</strong> mostrando foto, descripción y precio de venta.{' '}
                    <strong>Oculta estrictamente costos y teléfonos de proveedores.</strong>
                  </p>

                  <div className="mt-3 rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] px-3 py-2 text-[11px] text-[#374151]">
                    <span className="font-semibold text-[#111827]">
                      Regla fuera de catálogo:{' '}
                    </span>
                    {assistantConfig.handoffRule}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-xl border border-[#E5E7EB] bg-white p-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase text-[#6B7280]">Tope mensual</p>
                      <p className="font-bold text-[#111827]">
                        {assistantConfig.usageCaps.customerMessagesPerMonth} mensajes/mes
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-[#6B7280]">Privacidad</p>
                      <p className="font-bold text-[#6D28D9]">0% datos de costo</p>
                    </div>
                  </div>
                </article>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onOpenSimulator}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#6D28D9] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(109,40,217,0.25)] transition hover:bg-[#5B21B6]"
                >
                  Probar {assistantConfig.wakeWord} y Modo Cliente ahora
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Flota de agentes activos en el negocio */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#6B7280]">
            Agentes Desplegados ({agents.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {agents.map((agent) => {
            const isActive = agent.status === 'active';
            return (
              <article
                key={agent.id}
                className="ios-card-interactive flex flex-col justify-between p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                        isActive
                          ? 'bg-[#6D28D9] text-white'
                          : 'border border-[#E5E7EB] bg-[#F5F5F7] text-[#6B7280]'
                      }`}
                    >
                      <Bot className="h-5 w-5" />
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleAgent(agent.id)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                        isActive
                          ? 'bg-[#EDE9FE] text-[#5B21B6]'
                          : 'border border-[#E5E7EB] bg-[#F5F5F7] text-[#6B7280]'
                      }`}
                    >
                      <Power className="h-3 w-3" />
                      {isActive ? 'Activo' : 'Pausado'}
                    </button>
                  </div>

                  <h3 className="mt-4 text-base font-semibold text-[#111827]">
                    {agent.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#6B7280]">{agent.role}</p>

                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] p-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#6B7280]">
                        Interacciones hoy
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-[#111827]">
                        {agent.conversationsToday}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#6B7280]">
                        Efectividad
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-[#6D28D9]">
                        {agent.conversionRate}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-[#EDE9FE] bg-[#F3E8FF]/60 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5B21B6]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Regla HITL / Seguridad
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#374151]">
                      {agent.hitlRule}
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-[#E5E7EB] pt-3 text-[11px] text-[#6B7280]">
                  <p className="flex items-center gap-1 font-medium text-[#111827]">
                    <Sparkles className="h-3 w-3 text-[#6D28D9]" />
                    Última acción
                  </p>
                  <p className="mt-0.5">{agent.lastAction}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
