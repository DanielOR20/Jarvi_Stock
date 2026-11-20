import React, { useMemo, useState } from 'react';
import {
  MapPin,
  Phone,
  Clock,
  Plus,
  CheckCircle2,
  Package,
  Store,
  Search,
  Send,
  ExternalLink,
  Upload,
  X,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import {
  buildWhatsAppLink,
  calculateMargin,
  formatCurrency,
} from '../data/mockStore';

const INITIAL_PRODUCT_FORM = {
  name: '',
  description: '',
  category: 'Audio',
  costPrice: '',
  salePrice: '',
  imagePreview: '',
  imageUrlInput: '',
  supplierMode: 'existing',
  supplierId: '',
  newSupplierName: '',
  newSupplierWhatsapp: '',
  newSupplierLocation: '',
};

export default function CatalogSuppliersPage({
  products,
  allProducts,
  suppliers,
  allSuppliers,
  onCreateProductAndSupplier,
  onRequestFromSupplier,
  onCheckSupplierStock,
}) {
  const supplierDirectorySource = allSuppliers || suppliers;
  const [activeTab, setActiveTab] = useState('products');
  const [localSearch, setLocalSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState({
    ...INITIAL_PRODUCT_FORM,
    supplierId: supplierDirectorySource[0]?.id || '',
  });
  const [requestedProducts, setRequestedProducts] = useState({});

  const categories = useMemo(() => {
    const unique = Array.from(new Set(allProducts.map((p) => p.category)));
    return ['Todas', ...unique];
  }, [allProducts]);

  const supplierMap = useMemo(() => {
    const map = {};
    supplierDirectorySource.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [supplierDirectorySource]);

  const visibleProducts = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    return products.filter((p) => {
      const catOk = selectedCategory === 'Todas' || p.category === selectedCategory;
      const queryOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      return catOk && queryOk;
    });
  }, [products, localSearch, selectedCategory]);

  const visibleSuppliers = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const supplierProducts = allProducts.filter((p) => p.supplierId === s.id);
      const matchesProduct = supplierProducts.some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        matchesProduct
      );
    });
  }, [suppliers, allProducts, localSearch]);

  const matchingDistributorNames = useMemo(() => {
    if (!localSearch.trim()) return [];
    return Array.from(new Set(visibleProducts.map((p) => p.supplierName)));
  }, [visibleProducts, localSearch]);

  const modalMargin = calculateMargin(formState.costPrice, formState.salePrice);

  const openModal = () => {
    setFormState({
      ...INITIAL_PRODUCT_FORM,
      supplierId: supplierDirectorySource[0]?.id || '',
    });
    setModalOpen(true);
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFormState((prev) => ({
          ...prev,
          imagePreview: reader.result,
          imageUrlInput: '',
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageUrlChange = (url) => {
    setFormState((prev) => ({
      ...prev,
      imageUrlInput: url,
      imagePreview: url,
    }));
  };

  const handleSubmitModal = (e) => {
    e.preventDefault();
    if (!formState.name.trim() || !formState.costPrice || !formState.salePrice) {
      return;
    }
    if (
      formState.supplierMode === 'new' &&
      (!formState.newSupplierName.trim() ||
        !formState.newSupplierWhatsapp.trim() ||
        !formState.newSupplierLocation.trim())
    ) {
      return;
    }

    onCreateProductAndSupplier({
      name: formState.name.trim(),
      description:
        formState.description.trim() ||
        'Producto agregado al catálogo sin inventario propio.',
      category: formState.category.trim() || 'Accesorios Tech',
      costPrice: Number(formState.costPrice),
      salePrice: Number(formState.salePrice),
      image: formState.imagePreview || '/products/cargador-gan.svg',
      supplierMode: formState.supplierMode,
      supplierId: formState.supplierId,
      newSupplier:
        formState.supplierMode === 'new'
          ? {
              name: formState.newSupplierName.trim(),
              whatsapp: formState.newSupplierWhatsapp.trim(),
              location: formState.newSupplierLocation.trim(),
              category: formState.category.trim() || 'Varios',
            }
          : null,
    });

    setModalOpen(false);
  };

  const handleOrderSupplierClick = (product, supplier) => {
    onRequestFromSupplier(product, supplier);
    setRequestedProducts((prev) => ({ ...prev, [product.id]: true }));
  };

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6D28D9]">
            Catálogo Virtual · Sin Inventario Propio
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[#111827]">
            Catálogo y Proveedores
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Pestañas estilo iOS */}
          <div className="inline-flex rounded-2xl border border-[#E5E7EB] bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab('products')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'products'
                  ? 'bg-[#111827] text-white'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              Catálogo ({allProducts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('suppliers')}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeTab === 'suppliers'
                  ? 'bg-[#111827] text-white'
                  : 'text-[#6B7280] hover:text-[#111827]'
              }`}
            >
              <Store className="h-3.5 w-3.5" />
              Directorio de Proveedores ({suppliers.length})
            </button>
          </div>

          <button
            type="button"
            onClick={openModal}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-[#6D28D9] px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(109,40,217,0.24)] transition hover:bg-[#5B21B6]"
          >
            <Plus className="h-4 w-4" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Buscador instantáneo "¿Quién distribuye X?" */}
      <section className="ios-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6D28D9]" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder='Busca al instante "¿Quién distribuye X?" por producto, categoría o proveedor...'
              className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F5F5F7] py-2.5 pl-10 pr-9 text-xs text-[#111827] placeholder:text-[#6B7280] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#6B7280] hover:bg-[#E5E7EB] hover:text-[#111827]"
                aria-label="Limpiar búsqueda de catálogo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {activeTab === 'products' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                    selectedCategory === cat
                      ? 'bg-[#6D28D9] text-white'
                      : 'border border-[#E5E7EB] bg-[#FAFAFB] text-[#6B7280] hover:border-[#6D28D9]/40 hover:text-[#111827]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Respuesta instantánea de distribución */}
        {localSearch.trim() && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DDD6FE] bg-[#F3E8FF] px-3.5 py-2 text-xs text-[#5B21B6]">
            <span>
              {visibleProducts.length > 0 ? (
                <>
                  <strong>{visibleProducts.length} producto(s)</strong> encontrado(s) ·{' '}
                  Distribuye:{' '}
                  <strong>{matchingDistributorNames.join(', ')}</strong>
                </>
              ) : (
                'No se encontraron coincidencias en el catálogo actual.'
              )}
            </span>
          </div>
        )}
      </section>

      {/* Vista Catálogo vs Directorio de Proveedores */}
      {activeTab === 'products' ? (
        visibleProducts.length === 0 ? (
          <div className="ios-card px-6 py-12 text-center">
            <p className="text-sm font-semibold text-[#111827]">
              Sin productos que coincidan con tu búsqueda
            </p>
            <p className="mt-1 text-xs text-[#6B7280]">
              Prueba otra categoría o crea un producto nuevo con su proveedor local.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleProducts.map((product) => {
              const supplier = supplierMap[product.supplierId] || {
                name: product.supplierName,
                whatsapp: '+506 8841 2310',
                location: 'San José, Costa Rica',
              };
              const prefilledMsg = `Hola ${supplier.name}, necesito cotizar/apartar "${product.name}" (SKU ${product.sku}) para entrega hoy desde Jarvi Stock. ¿Disponibilidad inmediata?`;
              const waLink = buildWhatsAppLink(supplier.whatsapp, prefilledMsg);
              const isQueued = Boolean(requestedProducts[product.id]);

              return (
                <article
                  key={product.id}
                  className="ios-card-interactive flex flex-col justify-between overflow-hidden"
                >
                  <div>
                    {/* Foto limpia arriba */}
                    <div className="relative flex h-44 items-center justify-center border-b border-[#E5E7EB] bg-[#F5F5F7] p-4">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-full max-h-36 w-auto rounded-2xl object-contain"
                      />
                      <span className="absolute left-3.5 top-3.5 rounded-full border border-[#E5E7EB] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#111827]">
                        {product.category}
                      </span>
                      <span className="absolute right-3.5 top-3.5 rounded-full bg-[#EDE9FE] px-2.5 py-1 text-[11px] font-bold text-[#5B21B6] ring-1 ring-[#DDD6FE]">
                        +{formatCurrency(product.marginAmount)} ({product.marginPercent}%)
                      </span>
                    </div>

                    {/* Información del producto */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                            {product.sku}
                          </p>
                          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-[#111827]">
                            {product.name}
                          </h3>
                        </div>
                      </div>

                      {product.description && (
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#6B7280]">
                          {product.description}
                        </p>
                      )}

                      {/* Precio venta destacado negro + costo discreto */}
                      <div className="mt-3.5 flex items-baseline justify-between border-t border-[#E5E7EB] pt-3">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-[#6B7280]">
                            Precio Venta
                          </p>
                          <p className="text-xl font-bold tracking-tight text-[#111827]">
                            {formatCurrency(product.salePrice)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-[#6B7280]">Costo proveedor</p>
                          <p className="text-xs font-semibold text-[#6B7280]">
                            {formatCurrency(product.costPrice)}
                          </p>
                        </div>
                      </div>

                      {/* Tarjeta interna del proveedor asignado */}
                      <div className="mt-3 rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-[#111827]">
                            {supplier.name}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium text-[#6D28D9]">
                            {product.deliveryEta}
                          </span>
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-[#6B7280]">
                          <MapPin className="h-3 w-3 shrink-0 text-[#6D28D9]" />
                          {supplier.location}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#6B7280]">
                          <Phone className="h-3 w-3 shrink-0 text-[#111827]" />
                          {supplier.whatsapp}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Acciones de pedido */}
                  <div className="flex items-center gap-2 border-t border-[#E5E7EB] bg-white px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleOrderSupplierClick(product, supplier)}
                      className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        isQueued
                          ? 'bg-[#EDE9FE] text-[#5B21B6]'
                          : 'bg-[#6D28D9] text-white shadow-[0_6px_14px_rgba(109,40,217,0.2)] hover:bg-[#5B21B6]'
                      }`}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {isQueued ? 'En cola HITL · Pedir otro' : 'Pedir al Proveedor'}
                    </button>

                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir WhatsApp con mensaje prellenado"
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3 py-2 text-xs font-semibold text-[#111827] transition hover:border-[#6D28D9] hover:bg-[#F3E8FF] hover:text-[#5B21B6]"
                    >
                      <span>wa.me</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : (
        /* Pestaña secundaria: Directorio de Proveedores */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleSuppliers.map((supplier) => {
            const supplierProducts = allProducts.filter(
              (p) => p.supplierId === supplier.id
            );
            const waDirectLink = buildWhatsAppLink(
              supplier.whatsapp,
              `Hola ${supplier.contactPerson || supplier.name}, te escribimos de Jarvi Stock para confirmar disponibilidad del catálogo hoy.`
            );

            return (
              <article key={supplier.id} className="ios-card-interactive p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-[#111827] px-2 py-0.5 text-[10px] font-bold text-white">
                        {supplier.id}
                      </span>
                      <span className="rounded-full bg-[#F3E8FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#6D28D9]">
                        {supplier.reliability} cumplimiento
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-[#111827]">
                      {supplier.name}
                    </h3>
                    <p className="text-xs text-[#6B7280]">
                      {supplier.category} · Contacto: {supplier.contactPerson || 'Mostrador'}
                    </p>
                  </div>

                  <span className="rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3 py-1.5 text-xs font-bold text-[#111827]">
                    {supplierProducts.length} productos
                  </span>
                </div>

                <div className="mt-4 space-y-2 rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] p-3.5 text-xs text-[#374151]">
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-[#6D28D9]" />
                    <span className="font-semibold text-[#111827]">
                      {supplier.whatsapp}
                    </span>
                    <span className="text-[#6B7280]">
                      · Respuesta ~{supplier.avgResponseMin} min
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-[#111827]" />
                    <span>{supplier.location}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-[#6D28D9]" />
                    <span>Ventana de recogida: {supplier.pickupWindow}</span>
                  </p>
                </div>

                {supplierProducts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {supplierProducts.map((sp) => (
                      <span
                        key={sp.id}
                        className="rounded-full border border-[#E5E7EB] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#374151]"
                      >
                        {sp.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E7EB] pt-3.5">
                  <button
                    type="button"
                    onClick={() => onCheckSupplierStock(supplier)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-xs font-semibold text-[#111827] transition hover:border-[#6D28D9] hover:bg-[#F3E8FF] hover:text-[#5B21B6]"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Encolar consulta HITL
                  </button>

                  <a
                    href={waDirectLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#111827] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#6D28D9]"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Contactar WhatsApp
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal estilo iOS "+ Nuevo Producto" */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0A10]/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-nuevo-producto"
        >
          <div className="ios-scroll max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[#E5E7EB] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E5E7EB] bg-white/95 px-6 py-4 backdrop-blur-md">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6D28D9]">
                  Alta Rápida Sin Inventario
                </p>
                <h2
                  id="modal-nuevo-producto"
                  className="text-lg font-bold text-[#111827]"
                >
                  Agregar Nuevo Producto al Catálogo
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="cursor-pointer rounded-full border border-[#E5E7EB] bg-[#F5F5F7] p-2 text-[#6B7280] hover:text-[#111827]"
                aria-label="Cerrar modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="space-y-5 p-6">
              {/* Foto del producto (FileReader base64 o URL) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D1D5DB] bg-[#F5F5F7] p-4 text-center sm:col-span-5">
                  {formState.imagePreview ? (
                    <div className="relative w-full">
                      <img
                        src={formState.imagePreview}
                        alt="Vista previa"
                        className="mx-auto h-32 w-full rounded-xl object-contain"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFormState((prev) => ({
                            ...prev,
                            imagePreview: '',
                            imageUrlInput: '',
                          }))
                        }
                        className="mt-2 text-[11px] font-semibold text-[#6D28D9] hover:underline"
                      >
                        Quitar imagen
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EDE9FE] text-[#6D28D9]">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-[#111827]">
                        Foto del producto
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#6B7280]">
                        Sube archivo o pega URL
                      </p>
                    </>
                  )}
                </div>

                <div className="flex flex-col justify-center gap-3 sm:col-span-7">
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#FAFAFB] px-4 py-2.5 text-xs font-semibold text-[#111827] transition hover:border-[#6D28D9] hover:bg-[#F3E8FF] hover:text-[#5B21B6]">
                    <Upload className="h-4 w-4" />
                    Subir imagen desde dispositivo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#6B7280]">
                      O pegar URL de imagen
                    </label>
                    <input
                      type="url"
                      value={formState.imageUrlInput}
                      onChange={(e) => handleImageUrlChange(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3.5 py-2 text-xs text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Datos del producto */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#111827]">
                    Nombre del producto *
                  </label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) =>
                      setFormState({ ...formState, name: e.target.value })
                    }
                    placeholder="Ej. Micrófono Lavalier USB-C Dual"
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3.5 py-2.5 text-xs text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#111827]">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={formState.category}
                    onChange={(e) =>
                      setFormState({ ...formState, category: e.target.value })
                    }
                    placeholder="Audio, Wearables, Hogar..."
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3.5 py-2.5 text-xs text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#111827]">
                    Descripción corta
                  </label>
                  <textarea
                    rows={2}
                    value={formState.description}
                    onChange={(e) =>
                      setFormState({ ...formState, description: e.target.value })
                    }
                    placeholder="Especificaciones clave para que tus agentes IA coticen por WhatsApp..."
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3.5 py-2 text-xs text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Precios en ₡ y cálculo automático en tiempo real */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAFB] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#111827]">
                      Precio de costo (₡) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formState.costPrice}
                      onChange={(e) =>
                        setFormState({ ...formState, costPrice: e.target.value })
                      }
                      placeholder="15000"
                      className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#111827] focus:border-[#6D28D9] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#111827]">
                      Precio de venta (₡) *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formState.salePrice}
                      onChange={(e) =>
                        setFormState({ ...formState, salePrice: e.target.value })
                      }
                      placeholder="29900"
                      className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#111827] focus:border-[#6D28D9] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DDD6FE] bg-[#F3E8FF] px-3.5 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5B21B6]">
                    <Sparkles className="h-3.5 w-3.5" />
                    Cálculo automático de rentabilidad
                  </span>
                  <div className="flex items-center gap-3 text-xs font-bold text-[#5B21B6]">
                    <span>Ganancia: {formatCurrency(modalMargin.amount)}</span>
                    <span className="rounded-full bg-[#6D28D9] px-2.5 py-0.5 text-white">
                      {modalMargin.percent}% margen
                    </span>
                  </div>
                </div>
              </div>

              {/* Proveedor existente o registro nuevo ahí mismo */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#111827]">
                    Proveedor Asignado
                  </p>
                  <div className="inline-flex rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] p-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setFormState({ ...formState, supplierMode: 'existing' })
                      }
                      className={`cursor-pointer rounded-lg px-3 py-1 text-[11px] font-semibold transition ${
                        formState.supplierMode === 'existing'
                          ? 'bg-[#111827] text-white'
                          : 'text-[#6B7280]'
                      }`}
                    >
                      Existente
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormState({ ...formState, supplierMode: 'new' })
                      }
                      className={`cursor-pointer rounded-lg px-3 py-1 text-[11px] font-semibold transition ${
                        formState.supplierMode === 'new'
                          ? 'bg-[#6D28D9] text-white'
                          : 'text-[#6B7280]'
                      }`}
                    >
                      + Registrar proveedor nuevo
                    </button>
                  </div>
                </div>

                {formState.supplierMode === 'existing' ? (
                  <div className="mt-3">
                    <select
                      value={formState.supplierId}
                      onChange={(e) =>
                        setFormState({ ...formState, supplierId: e.target.value })
                      }
                      className="w-full rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3.5 py-2.5 text-xs font-medium text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                    >
                      {supplierDirectorySource.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.location} ({s.whatsapp})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      required
                      value={formState.newSupplierName}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          newSupplierName: e.target.value,
                        })
                      }
                      placeholder="Nombre del proveedor *"
                      className="rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3.5 py-2.5 text-xs text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                    />
                    <input
                      type="tel"
                      required
                      value={formState.newSupplierWhatsapp}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          newSupplierWhatsapp: e.target.value,
                        })
                      }
                      placeholder="Teléfono WhatsApp (ej. +506 8888 1234) *"
                      className="rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3.5 py-2.5 text-xs text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      required
                      value={formState.newSupplierLocation}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          newSupplierLocation: e.target.value,
                        })
                      }
                      placeholder="Zona / dirección física de recogida *"
                      className="rounded-xl border border-[#E5E7EB] bg-[#F5F5F7] px-3.5 py-2.5 text-xs text-[#111827] focus:border-[#6D28D9] focus:bg-white focus:outline-none sm:col-span-2"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-[#E5E7EB] pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="cursor-pointer rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-xs font-semibold text-[#6B7280] hover:text-[#111827]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#6D28D9] px-5 py-2.5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(109,40,217,0.25)] transition hover:bg-[#5B21B6]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Guardar en Catálogo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
