import React, { useState } from 'react';
import {
  LayoutDashboard,
  PackageSearch,
  Truck,
  Bot,
  MessageSquareText,
  Search,
  Building2,
  ChevronDown,
  ShieldCheck,
  X,
  Check,
} from 'lucide-react';

const ICON_MAP = {
  dashboard: LayoutDashboard,
  catalog: PackageSearch,
  orders: Truck,
  agents: Bot,
  whatsapp: MessageSquareText,
};

export default function Sidebar({
  navItems,
  activeView,
  onSelectView,
  tenants,
  activeTenant,
  onSelectTenant,
  searchQuery,
  onSearchChange,
  activeOrdersCount,
  pendingHitlCount,
  backendOnline = false,
  isOpenMobile,
  onCloseMobile,
}) {
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);

  const handleNavClick = (viewId) => {
    onSelectView(viewId);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-[#0B0A10]/60 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`sidebar-gradient ios-scroll fixed inset-y-0 left-0 z-50 flex w-[272px] shrink-0 flex-col justify-between overflow-y-auto border-r border-white/10 text-white transition-transform duration-200 lg:static lg:h-screen lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col gap-5 p-5">
          {/* Logo y cierre móvil */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#6D28D9] shadow-[0_8px_20px_rgba(109,40,217,0.42)] ring-1 ring-white/20">
                <span className="text-lg font-bold tracking-tight text-white">JS</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-semibold tracking-tight text-white">
                    Jarvi Stock
                  </span>
                  <span className="rounded-full bg-[#EDE9FE]/15 px-2 py-0.5 text-[10px] font-medium text-[#EDE9FE] ring-1 ring-[#EDE9FE]/25">
                    CRM
                  </span>
                </div>
                <p className="text-[11px] text-white/55">Dropshipping Local · AI</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onCloseMobile}
              className="rounded-xl p-1.5 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Cerrar menú lateral"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Selector de Negocio / Tenant */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setTenantMenuOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-2xl border border-white/12 bg-white/[0.06] px-3.5 py-2.5 text-left transition hover:border-[#A78BFA]/40 hover:bg-white/[0.09]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#6D28D9]/30 text-[#EDE9FE]">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">
                    {activeTenant.name}
                  </p>
                  <p className="truncate text-[11px] text-white/55">
                    {activeTenant.city} · {activeTenant.plan}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-white/60 transition-transform ${
                  tenantMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {tenantMenuOpen && (
              <div className="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-white/15 bg-[#120D1F] p-1.5 shadow-2xl">
                <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                  Cambiar negocio / tenant
                </p>
                {tenants.map((tenant) => {
                  const isSelected = tenant.id === activeTenant.id;
                  return (
                    <button
                      key={tenant.id}
                      type="button"
                      onClick={() => {
                        onSelectTenant(tenant.id);
                        setTenantMenuOpen(false);
                      }}
                      className={`mt-0.5 flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition ${
                        isSelected
                          ? 'bg-[#6D28D9] text-white'
                          : 'text-white/80 hover:bg-white/10'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tenant.name}</p>
                        <p className="truncate text-[10px] text-white/60">
                          {tenant.whatsappConnected}
                        </p>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Buscador rápido */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar pedido, SKU o proveedor..."
              className="w-full rounded-2xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-8 text-xs text-white placeholder:text-white/45 focus:border-[#A78BFA]/60 focus:bg-white/[0.1] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Navegación principal */}
          <nav className="flex flex-col gap-1.5" aria-label="Navegación principal">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Operación CRM
            </p>
            {navItems.map((item) => {
              const Icon = ICON_MAP[item.id] || LayoutDashboard;
              const isActive = activeView === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`group flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-[#6D28D9] text-white shadow-[0_8px_20px_rgba(109,40,217,0.38)] ring-1 ring-white/20'
                      : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 transition-colors ${
                        isActive ? 'text-white' : 'text-white/55 group-hover:text-[#EDE9FE]'
                      }`}
                    />
                    <span>{item.label}</span>
                  </span>

                  {item.id === 'orders' && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-white/10 text-[#EDE9FE]'
                      }`}
                    >
                      {activeOrdersCount}
                    </span>
                  )}

                  {item.id === 'whatsapp' && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-[#EDE9FE]/15 text-[#EDE9FE]'
                      }`}
                    >
                      LIVE
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Estado HITL y conexión WhatsApp */}
        <div className="p-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#C4B5FD]" />
                <span className="text-xs font-semibold text-white">Guardia HITL</span>
              </div>
              <span className="rounded-full bg-[#EDE9FE]/15 px-2 py-0.5 text-[10px] font-semibold text-[#EDE9FE]">
                {pendingHitlCount} en cola
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
              Compras a proveedores y altas de catálogo requieren tu aprobación explícita.
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-white/55">
              <span>{backendOnline ? 'API Express + DB' : 'Modo Local Demo'}</span>
              <span className="flex items-center gap-1.5 font-medium text-[#EDE9FE]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#A78BFA]" />
                {backendOnline ? 'Sincronizado' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
