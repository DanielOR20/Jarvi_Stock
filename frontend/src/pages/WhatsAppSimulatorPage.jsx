import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Bot,
  User,
  Lock,
  EyeOff,
  Camera,
  Sparkles,
  ShoppingBag,
  ShieldCheck,
  X,
  Phone,
} from 'lucide-react';
import { formatCurrency } from '../data/mockStore';

export default function WhatsAppSimulatorPage({
  activeTenant,
  assistantConfig,
  ownerMessages,
  clientMessages,
  onSendOwnerCommand,
  onSendClientMessage,
  onClientQuickBuy,
}) {
  const [mode, setMode] = useState('owner'); // 'owner' | 'client'
  const [inputText, setInputText] = useState('');
  const [attachedPhoto, setAttachedPhoto] = useState(null);
  const messagesEndRef = useRef(null);

  const activeMessages = mode === 'owner' ? ownerMessages : clientMessages;
  const wakeWord = assistantConfig.wakeWord || 'Jarvis';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, mode]);

  const ownerQuickCommands = [
    'Guarda filtro de aire CRF250, costo 12000, venta 18500, proveedor MotoASAP 88888888',
    '¿Quién distribuye filtro CRF250?',
    '¿Quién distribuye Audífonos Studio ANC Pro?',
  ];

  const clientQuickMessages = [
    'Hola, ¿tienen Audífonos Studio ANC Pro?',
    'Quiero comprar 1 Smartwatch Obsidian S9',
    '¿Venden cascos de fibra de carbono?',
  ];

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachedPhoto({
          name: file.name,
          url: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSimulateSamplePhoto = () => {
    setAttachedPhoto({
      name: 'catalogo-filtro-crf250.svg',
      url: '/products/cargador-gan.svg',
    });
    if (!inputText.trim()) {
      setInputText(
        'Guarda filtro de aire CRF250, costo 12000, venta 18500, proveedor MotoASAP 88888888'
      );
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed && !attachedPhoto) return;

    if (mode === 'owner') {
      onSendOwnerCommand(
        trimmed || 'Adjunto foto de producto nuevo para catálogo',
        attachedPhoto
      );
      setAttachedPhoto(null);
    } else {
      onSendClientMessage(trimmed);
    }
    setInputText('');
  };

  return (
    <div className="space-y-5">
      {/* Cabecera + Selector superior de modos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6D28D9]">
            Sandbox Conversacional en Tiempo Real · {activeTenant.name}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[#111827]">
            Simulador WhatsApp
          </h1>
        </div>

        {/* Selector de modo estilo iOS segmented pill */}
        <div className="inline-flex rounded-2xl border border-[#E5E7EB] bg-white p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setMode('owner')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              mode === 'owner'
                ? 'bg-[#111827] text-white shadow-xs'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <Lock className="h-3.5 w-3.5 text-[#C4B5FD]" />
            Modo Dueño ({wakeWord})
          </button>

          <button
            type="button"
            onClick={() => setMode('client')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              mode === 'client'
                ? 'bg-[#6D28D9] text-white shadow-xs'
                : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <EyeOff className="h-3.5 w-3.5" />
            Modo Cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Columna izquierda: comandos rápidos y reglas del modo */}
        <aside className="space-y-4 xl:col-span-4">
          <div
            className={`rounded-2xl p-5 ${
              mode === 'owner'
                ? 'bg-[#111827] text-white'
                : 'border border-[#DDD6FE] bg-[#F3E8FF] text-[#111827]'
            }`}
          >
            <div className="flex items-center gap-2">
              {mode === 'owner' ? (
                <Lock className="h-4 w-4 text-[#C4B5FD]" />
              ) : (
                <EyeOff className="h-4 w-4 text-[#6D28D9]" />
              )}
              <h2 className="text-sm font-bold">
                {mode === 'owner'
                  ? `Canal Privado · ${wakeWord}`
                  : 'Canal Público · Comprador Externo'}
              </h2>
            </div>

            <p
              className={`mt-2 text-xs leading-relaxed ${
                mode === 'owner' ? 'text-white/75' : 'text-[#374151]'
              }`}
            >
              {mode === 'owner'
                ? `Identidad verificada (${assistantConfig.ownerWhatsapp}). Puede consultar costos, márgenes y proveedores, o enviar comandos/fotos que van directo al panel HITL.`
                : 'Muestra foto, descripción y precio de venta público. Oculta costos y proveedores; si el cliente compra, crea el pedido en "1. Solicitud Cliente" y lo envía a HITL.'}
            </p>
          </div>

          <div className="ios-card p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6D28D9]">
              <Sparkles className="h-3.5 w-3.5" />
              {mode === 'owner'
                ? 'Comandos de prueba (1 clic)'
                : 'Consultas de comprador (1 clic)'}
            </p>

            <div className="mt-3 space-y-2">
              {(mode === 'owner' ? ownerQuickCommands : clientQuickMessages).map(
                (prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      if (mode === 'owner') {
                        onSendOwnerCommand(prompt, null);
                      } else {
                        onSendClientMessage(prompt);
                      }
                    }}
                    className="w-full cursor-pointer rounded-2xl border border-[#E5E7EB] bg-[#FAFAFB] px-3.5 py-2.5 text-left text-xs font-medium text-[#111827] transition hover:border-[#6D28D9] hover:bg-[#F3E8FF] hover:text-[#5B21B6]"
                  >
                    “{prompt}”
                  </button>
                )
              )}
            </div>

            {mode === 'owner' && (
              <div className="mt-3 border-t border-[#E5E7EB] pt-3">
                <button
                  type="button"
                  onClick={handleSimulateSamplePhoto}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#DDD6FE] bg-[#F3E8FF] px-3 py-2 text-xs font-semibold text-[#5B21B6] transition hover:bg-[#EDE9FE]"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Cargar foto simulada + comando CRF250
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Columna derecha: teléfono iOS estilo chat */}
        <section className="xl:col-span-8">
          <div className="mx-auto flex h-[580px] max-w-2xl flex-col overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white shadow-[0_18px_42px_rgba(17,24,39,0.1)]">
            {/* Notch / header estilo iOS WhatsApp */}
            <div
              className={`flex items-center justify-between px-5 py-3.5 ${
                mode === 'owner'
                  ? 'bg-[#0B0A10] text-white'
                  : 'border-b border-[#E5E7EB] bg-white text-[#111827]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                    mode === 'owner'
                      ? 'bg-[#6D28D9] text-white'
                      : 'bg-[#111827] text-white'
                  }`}
                >
                  {mode === 'owner' ? wakeWord.slice(0, 2).toUpperCase() : 'CL'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">
                      {mode === 'owner'
                        ? `${wakeWord} · Asistente del Dueño`
                        : `${assistantConfig.businessName} · Tienda WhatsApp`}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        mode === 'owner'
                          ? 'bg-[#6D28D9] text-white'
                          : 'bg-[#EDE9FE] text-[#5B21B6]'
                      }`}
                    >
                      {mode === 'owner' ? 'Privado' : 'Público'}
                    </span>
                  </div>
                  <p
                    className={`flex items-center gap-1.5 text-[11px] ${
                      mode === 'owner' ? 'text-white/60' : 'text-[#6B7280]'
                    }`}
                  >
                    <Phone className="h-3 w-3" />
                    {mode === 'owner'
                      ? assistantConfig.ownerWhatsapp
                      : activeTenant.whatsappConnected}
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  mode === 'owner'
                    ? 'bg-white/10 text-[#EDE9FE]'
                    : 'bg-[#F5F5F7] text-[#111827]'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#6D28D9]" />
                En línea
              </span>
            </div>

            {/* Hilo de mensajes */}
            <div className="ios-scroll flex-1 space-y-3.5 overflow-y-auto bg-[#F5F5F7] p-4 sm:p-5">
              {activeMessages.map((msg) => {
                if (msg.sender === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="inline-flex max-w-md items-center gap-1.5 rounded-full border border-[#DDD6FE] bg-[#F3E8FF] px-3.5 py-1.5 text-center text-[11px] font-semibold text-[#5B21B6]">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        <span>{msg.text}</span>
                      </div>
                    </div>
                  );
                }

                const isOutgoingUser = msg.sender === 'user';

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutgoingUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                        isOutgoingUser
                          ? mode === 'owner'
                            ? 'bg-[#6D28D9] text-white rounded-br-md'
                            : 'bg-[#111827] text-white rounded-br-md'
                          : 'border border-[#E5E7EB] bg-white text-[#111827] rounded-bl-md'
                      }`}
                    >
                      <div
                        className={`flex items-center gap-1.5 text-[10px] font-semibold ${
                          isOutgoingUser ? 'text-white/75' : 'text-[#6D28D9]'
                        }`}
                      >
                        {isOutgoingUser ? (
                          <User className="h-3 w-3" />
                        ) : (
                          <Bot className="h-3 w-3" />
                        )}
                        <span>{msg.author}</span>
                        <span>· {msg.time}</span>
                      </div>

                      {msg.image && (
                        <div className="overflow-hidden rounded-xl border border-white/20 bg-white/95 p-1.5">
                          <img
                            src={msg.image}
                            alt="Adjunto de producto"
                            className="h-28 w-full rounded-lg object-contain"
                          />
                        </div>
                      )}

                      <p className="whitespace-pre-line">{msg.text}</p>

                      {/* Tarjetas de producto públicas (Solo foto, descripción y precio de venta — cero costos/proveedores) */}
                      {msg.publicProducts && msg.publicProducts.length > 0 && (
                        <div className="space-y-2.5 pt-1">
                          {msg.publicProducts.map((item) => (
                            <div
                              key={item.id}
                              className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#FAFAFB] text-[#111827]"
                            >
                              <div className="flex items-center gap-3 p-3">
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  className="h-16 w-16 shrink-0 rounded-xl border border-[#E5E7EB] bg-white object-contain p-1"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-semibold uppercase text-[#6D28D9]">
                                    {item.category} · Entrega {item.deliveryEta}
                                  </p>
                                  <h4 className="truncate text-xs font-bold text-[#111827]">
                                    {item.name}
                                  </h4>
                                  {item.description && (
                                    <p className="mt-0.5 line-clamp-2 text-[11px] text-[#6B7280]">
                                      {item.description}
                                    </p>
                                  )}
                                  <p className="mt-1 text-sm font-bold text-[#111827]">
                                    {formatCurrency(item.salePrice)}
                                  </p>
                                </div>
                              </div>

                              <div className="border-t border-[#E5E7EB] bg-white px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => onClientQuickBuy(item)}
                                  className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#6D28D9] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#5B21B6]"
                                >
                                  <ShoppingBag className="h-3.5 w-3.5" />
                                  Solicitar compra ahora
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Preview de foto adjunta (Modo Dueño) */}
            {mode === 'owner' && attachedPhoto && (
              <div className="flex items-center justify-between border-t border-[#E5E7EB] bg-[#FAFAFB] px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <img
                    src={attachedPhoto.url}
                    alt={attachedPhoto.name}
                    className="h-10 w-10 rounded-xl border border-[#E5E7EB] bg-white object-contain p-0.5"
                  />
                  <div>
                    <p className="text-xs font-semibold text-[#111827]">
                      Foto adjunta lista para análisis IA
                    </p>
                    <p className="text-[11px] text-[#6B7280]">{attachedPhoto.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedPhoto(null)}
                  className="rounded-full p-1 text-[#6B7280] hover:bg-[#E5E7EB] hover:text-[#111827]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Barra de entrada estilo iMessage / WhatsApp iOS */}
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 border-t border-[#E5E7EB] bg-white px-4 py-3"
            >
              {mode === 'owner' && (
                <label
                  title="Adjuntar foto de producto o lista"
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-[#E5E7EB] bg-[#F5F5F7] text-[#111827] transition hover:border-[#6D28D9] hover:bg-[#F3E8FF] hover:text-[#5B21B6]"
                >
                  <Camera className="h-4 w-4" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              )}

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  mode === 'owner'
                    ? `Escribe a ${wakeWord}: "Guarda filtro..., costo..., venta..., proveedor..."`
                    : 'Escribe como cliente: "¿Tienen Audífonos?" o "Quiero comprar..."'
                }
                className="flex-1 rounded-2xl border border-[#E5E7EB] bg-[#F5F5F7] px-4 py-2.5 text-xs text-[#111827] placeholder:text-[#6B7280] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
              />

              <button
                type="submit"
                className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-[#6D28D9] px-4 text-xs font-semibold text-white transition hover:bg-[#5B21B6]"
              >
                <Send className="h-3.5 w-3.5" />
                Enviar
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
