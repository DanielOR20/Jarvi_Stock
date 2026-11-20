# Jarvi Stock — Contrato Técnico Backend & WhatsApp Business Cloud API (Meta)

> **Versión:** 1.0.0  
> **Propósito:** Especificación técnica definitiva para conectar la API oficial de **WhatsApp Business Cloud (Meta)** con el backend multi-tenant y el CRM Frontend de **Jarvi Stock** sin ambigüedades.  
> **Moneda base operativa:** Colones costarricenses (`₡` / `CRC`, valores enteros o `NUMERIC(12,2)`).  
> **Formato estándar de teléfonos:** E.164 solo dígitos sin `+` ni espacios en BD y payloads de Meta (ejemplo: `50688888888`).

---

## Arquitectura de Alto Nivel

```mermaid
flowchart LR
    WA["WhatsApp Business Cloud (Meta)"] -->|"GET/POST /api/webhook/whatsapp"| WH["Webhook Controller<br/>HMAC + Deduplicación + 200 OK"]
    WH -->|"Async call"| ENG["Engine: process-message<br/>Router: Dueño / Cliente / Onboarding"]
    ENG -->|"Lectura / Escritura aislada por tenant_id"| DB[("PostgreSQL Multi-Tenant")]
    ENG -->|"Encola acción HITL"| PA["pending_actions (status=pending)"]
    ENG -->|"Respuesta texto / media"| GRAPH["Meta Graph API<br/>POST /{phone_number_id}/messages"]
    CRM["Frontend CRM (React)"] -->|"REST API + JWT + tenant_id"| API["CRM REST Controllers"]
    API --> DB
    API -->|"POST /api/pending-actions/:id/approve"| GRAPH
```

### Principios Invariantes de Seguridad y Negocio
1. **Aislamiento Multi-Tenant Estricto:** Toda consulta SQL debe filtrar obligatoriamente por `tenant_id`. Nunca se cruzan productos, proveedores, pedidos ni mensajes entre negocios.
2. **Confirmación Humana Obligatoria (HITL):** Ningún agente IA puede insertar un producto/proveedor definitivo ni enviar una orden de compra vinculante a un proveedor sin crear primero un registro en `pending_actions` (`status = 'pending'`) y recibir aprobación explícita vía `POST /api/pending-actions/:id/approve`.
3. **Privacidad B2C Absoluta:** El agente de atención al cliente (`type = 'attention'`, `access_policy = 'public'`) **nunca** expone `cost_price`, márgenes, `supplier_id`, nombre ni teléfono de proveedores.
4. **Idempotencia ante Reintentos de Meta:** Meta reintenta webhooks si no recibe `200 OK` rápido o ante errores transitorios. Todo mensaje entrante se deduplica mediante restricción `UNIQUE` en `messages.wa_message_id`.

---

## 1. Esquema Relacional PostgreSQL Multi-Tenant (SQL DDL)

Script SQL listo para ejecutar en PostgreSQL 15+ (requiere extensión `pgcrypto` para `gen_random_uuid()`).

```sql
-- ============================================================================
-- JARVI STOCK - ESQUEMA RELACIONAL MULTI-TENANT (POSTGRESQL 15+)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TENANTS (Negocios SaaS)
-- ----------------------------------------------------------------------------
CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(140) NOT NULL,
  business_industry VARCHAR(160) DEFAULT 'Comercio sin inventario',
  activation_name   VARCHAR(60)  NOT NULL DEFAULT 'Jarvis',
  default_margin    NUMERIC(5,2) NOT NULL DEFAULT 40.00
                    CHECK (default_margin >= 0 AND default_margin < 100),
  handoff_rule      TEXT         NOT NULL DEFAULT 'Escalar al dueño por WhatsApp y pausar respuestas automáticas',
  wa_phone_number_id VARCHAR(64) UNIQUE, -- Mapeo opcional Meta phone_number_id -> tenant_id
  status            VARCHAR(20)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'onboarding', 'suspended')),
  monthly_msg_limit INTEGER      NOT NULL DEFAULT 1500 CHECK (monthly_msg_limit > 0),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. USERS (Dueños autorizados y contactos por tenant)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone      VARCHAR(24) NOT NULL, -- Formato E.164 dígitos: ej. 50688888888
  name       VARCHAR(120) NOT NULL,
  role       VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'contact')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_users_tenant_phone UNIQUE (tenant_id, phone)
);

CREATE INDEX idx_users_tenant_role ON users (tenant_id, role);
CREATE INDEX idx_users_phone ON users (phone);

-- ----------------------------------------------------------------------------
-- 3. SUPPLIERS (Proveedores locales con recogida física y WhatsApp)
-- ----------------------------------------------------------------------------
CREATE TABLE suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           VARCHAR(140) NOT NULL,
  whatsapp_phone VARCHAR(24)  NOT NULL, -- Formato E.164 dígitos
  location       VARCHAR(255) NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_suppliers_tenant_id_id UNIQUE (tenant_id, id)
);

CREATE INDEX idx_suppliers_tenant_name ON suppliers (tenant_id, LOWER(name));

-- ----------------------------------------------------------------------------
-- 4. PRODUCTS (Catálogo virtual sin inventario propio)
-- ----------------------------------------------------------------------------
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID           NOT NULL,
  sku         VARCHAR(48),
  category    VARCHAR(80)    NOT NULL DEFAULT 'General',
  name        VARCHAR(160)   NOT NULL,
  description TEXT,
  image_url   TEXT,
  cost_price  NUMERIC(12,2)  NOT NULL CHECK (cost_price >= 0),
  sale_price  NUMERIC(12,2)  NOT NULL CHECK (sale_price >= 0),
  active      BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_products_tenant_id_id UNIQUE (tenant_id, id),
  -- Garantiza que el proveedor pertenezca al mismo tenant
  CONSTRAINT fk_products_supplier_same_tenant
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_products_tenant_active ON products (tenant_id, active);
CREATE INDEX idx_products_tenant_supplier ON products (tenant_id, supplier_id);
CREATE INDEX idx_products_tenant_name ON products (tenant_id, LOWER(name));

-- ----------------------------------------------------------------------------
-- 5. ORDERS (Pipeline comercial de 5 etapas)
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id     UUID          NOT NULL,
  supplier_id    UUID          NOT NULL,
  customer_phone VARCHAR(24)   NOT NULL,
  customer_name  VARCHAR(120)  NOT NULL,
  quantity       INTEGER       NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_sale     NUMERIC(12,2) NOT NULL CHECK (total_sale >= 0),
  total_cost     NUMERIC(12,2) NOT NULL CHECK (total_cost >= 0),
  status         VARCHAR(32)   NOT NULL DEFAULT 'solicitud'
                 CHECK (status IN (
                   'solicitud',         -- 1. Solicitud Cliente
                   'cotizando',         -- 2. Cotizando Proveedor
                   'por_confirmar',     -- 3. Por Confirmar (HITL)
                   'pedido_proveedor',  -- 4. Pedido a Proveedor
                   'recogida_entrega',  -- 5. Recogida y Entrega
                   'entregado',         -- Cierre exitoso opcional
                   'cancelado'          -- Cancelado
                 )),
  pickup_notes   TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_orders_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_orders_product_same_tenant
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_supplier_same_tenant
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_orders_tenant_status ON orders (tenant_id, status);
CREATE INDEX idx_orders_tenant_supplier_status ON orders (tenant_id, supplier_id, status);
CREATE INDEX idx_orders_tenant_created ON orders (tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 6. AGENTS (Asistente del Dueño privado + Agente Atención al Cliente público)
-- ----------------------------------------------------------------------------
CREATE TABLE agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            VARCHAR(20)  NOT NULL CHECK (type IN ('personal', 'attention')),
  access_policy   VARCHAR(20)  NOT NULL CHECK (access_policy IN ('owner_only', 'public')),
  activation_code VARCHAR(40)  NOT NULL UNIQUE,
  system_prompt   TEXT         NOT NULL,
  allowed_tools   JSONB        NOT NULL DEFAULT '[]'::jsonb,
  active          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agents_policy_consistency CHECK (
    (type = 'personal'  AND access_policy = 'owner_only') OR
    (type = 'attention' AND access_policy = 'public')
  )
);

CREATE INDEX idx_agents_tenant_type ON agents (tenant_id, type, active);

-- ----------------------------------------------------------------------------
-- 7. CONVERSATIONS & MESSAGES (Deduplicación garantizada por wa_message_id)
-- ----------------------------------------------------------------------------
CREATE TABLE conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id          UUID        REFERENCES agents(id) ON DELETE SET NULL,
  participant_phone VARCHAR(24) NOT NULL,
  channel_mode      VARCHAR(20) NOT NULL DEFAULT 'client'
                    CHECK (channel_mode IN ('owner', 'client', 'onboarding')),
  onboarding_step   SMALLINT    CHECK (onboarding_step BETWEEN 1 AND 5),
  context_json      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_message_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_conversations_tenant_participant_mode
    UNIQUE (tenant_id, participant_phone, channel_mode)
);

CREATE INDEX idx_conversations_tenant_last ON conversations (tenant_id, last_message_at DESC);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  wa_message_id   VARCHAR(128) UNIQUE, -- Clave única de Meta (wamid.*) para descartar duplicados
  direction       VARCHAR(10)  NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_phone    VARCHAR(24)  NOT NULL,
  message_type    VARCHAR(20)  NOT NULL DEFAULT 'text'
                  CHECK (message_type IN ('text', 'image', 'document', 'audio', 'interactive')),
  body_text       TEXT,
  media_url       TEXT,
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_created ON messages (conversation_id, created_at ASC);
CREATE INDEX idx_messages_tenant_created ON messages (tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. PENDING_ACTIONS (Bandeja HITL - Confirmación Humana Obligatoria)
-- ----------------------------------------------------------------------------
CREATE TABLE pending_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id     UUID,
  action_type  VARCHAR(40)  NOT NULL
               CHECK (action_type IN (
                 'create_product',
                 'purchase_order',
                 'quote_approval',
                 'supplier_stock_check',
                 'human_handoff'
               )),
  target_phone VARCHAR(24)  NOT NULL,
  payload_json JSONB        NOT NULL,
  preview_text TEXT         NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at   TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_pending_actions_order_same_tenant
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_pending_actions_tenant_status ON pending_actions (tenant_id, status, created_at DESC);
CREATE INDEX idx_pending_actions_expires ON pending_actions (status, expires_at) WHERE status = 'pending';

-- ----------------------------------------------------------------------------
-- 9. AUDIT_LOG (Trazabilidad completa de agentes y decisiones humanas)
-- ----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor      VARCHAR(120) NOT NULL, -- ej: 'owner:50688888888', 'agent:personal', 'agent:attention', 'system'
  action     VARCHAR(120) NOT NULL, -- ej: 'pending_action.approved', 'order.stage_updated', 'whatsapp.sent'
  result     TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_tenant_created ON audit_log (tenant_id, created_at DESC);
```

### Notas de Aislamiento Multi-Tenant
- Todas las claves foráneas entre tablas del negocio (`products -> suppliers`, `orders -> products`, `orders -> suppliers`, `pending_actions -> orders`) son **compuestas con `tenant_id`**, impidiendo a nivel de base de datos que un registro apunte a recursos de otro tenant.
- Opcionalmente, en producción se recomienda habilitar Row-Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) seteando `SET LOCAL app.current_tenant_id = '<uuid>'` por cada request autenticado.

---

## 2. Contratos de Endpoints REST y Webhook

### Convenciones Generales
- **Content-Type:** `application/json; charset=utf-8` (excepto `GET /api/webhook/whatsapp`, que devuelve `text/plain`).
- **Autenticación CRM Frontend:** Header `Authorization: Bearer <JWT>` (el JWT embebe `tenantId`, `userId` y `role = 'owner'`). Para entornos de hackathon/desarrollo, si se habilita bypass local, se puede leer `X-Tenant-Id: <uuid>`.
- **Formato estándar de error:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El campo sale_price debe ser mayor a 0",
    "details": { "field": "sale_price" }
  }
}
```

---

### 2.1 Webhook Oficial de WhatsApp Business Cloud (Meta)

#### `GET /api/webhook/whatsapp` — Verificación de suscripción de Meta
Meta ejecuta esta petición una vez al configurar el Webhook en Meta for Developers.

- **Query params enviados por Meta:**
  - `hub.mode` (debe ser `"subscribe"`)
  - `hub.verify_token` (debe coincidir exactamente con `process.env.WHATSAPP_VERIFY_TOKEN`)
  - `hub.challenge` (token numérico/texto a devolver intacto)
- **Respuesta exitosa (`200 OK`, `Content-Type: text/plain`):**
  Devuelve el valor literal de `hub.challenge` sin comillas JSON.
- **Respuesta de error (`403 Forbidden`):**
  Si `hub.mode !== 'subscribe'` o el `verify_token` no coincide.

---

#### `POST /api/webhook/whatsapp` — Recepción de mensajes y estados de Meta

**Flujo obligatorio paso a paso:**
1. **Validación de firma `X-Hub-Signature-256` (OBLIGATORIO):**
   - Leer el **raw body** (`Buffer` sin parsear).
   - Calcular `expected = "sha256=" + HMAC_SHA256(rawBody, WHATSAPP_APP_SECRET).hex()`.
   - Comparar con el header `X-Hub-Signature-256` usando comparación en tiempo constante (`crypto.timingSafeEqual`).
   - Si falta o no coincide -> responder inmediatamente `401 Unauthorized` y no procesar nada.
2. **Respuesta `200 OK` inmediata:**
   - Una vez validada la firma y parseado el JSON mínimo, **responder `200 OK` inmediatamente** (`{ "received": true }`) y delegar el procesamiento a un job en memoria/cola asíncrona (`setImmediate` / BullMQ / worker). Meta marca fallo y reintenta agresivamente si la respuesta tarda más de 5 segundos.
3. **Resolución de Tenant:**
   - Extraer `metadata.phone_number_id` desde `entry[0].changes[0].value.metadata.phone_number_id` y resolver `tenant_id` en `tenants.wa_phone_number_id` (o tenant por defecto si es instancia single-WABA).
   - Ignorar silenciosamente eventos sin `messages` (por ejemplo `statuses`: `sent`, `delivered`, `read`), registrándolos solo en logs técnicos si se desea.
4. **Deduplicación por `wa_message_id`:**
   - Extraer `msg.id` (ejemplo `wamid.HBgLNTA2...`).
   - Ejecutar:
     ```sql
     INSERT INTO messages (tenant_id, conversation_id, wa_message_id, direction, sender_phone, message_type, body_text, media_url, raw_payload)
     VALUES ($1, $2, $3, 'inbound', $4, $5, $6, $7, $8)
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING id;
     ```
   - Si no devuelve filas (`rowCount === 0`), es un duplicado de Meta -> **terminar ejecución inmediatamente sin llamar al motor ni responder al usuario**.
5. **Descarga de Media (si `msg.type === 'image'` o `'document'`):**
   - Consultar `GET https://graph.facebook.com/v21.0/{media_id}` con `Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}` para obtener `url` temporal.
   - Descargar el binario con el mismo Bearer token, guardarlo en almacenamiento propio (S3/R2/local `/uploads`) y obtener una `mediaUrl` pública persistente (las URLs de Meta expiran en ~5 minutos).
6. **Invocación del Motor y Envío de Respuesta:**
   - Llamar internamente a `processMessage({ tenantId, phoneNumberId, fromPhone, messageId, text, mediaUrl, timestamp })`.
   - Si `replyText` o `replyMediaUrl` viene poblado, enviar respuesta saliente vía Meta Graph API:
     - **Endpoint:** `POST https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`
     - **Header:** `Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}`
     - **Payload texto:**
       ```json
       {
         "messaging_product": "whatsapp",
         "recipient_type": "individual",
         "to": "50688888888",
         "type": "text",
         "text": { "preview_url": false, "body": "Respuesta generada por Jarvi Stock" }
       }
       ```
     - **Payload imagen con caption (ej. tarjeta de producto en Modo Cliente):**
       ```json
       {
         "messaging_product": "whatsapp",
         "recipient_type": "individual",
         "to": "50682914412",
         "type": "image",
         "image": {
           "link": "https://cdn.jarvistock.app/products/audifonos-anc.jpg",
           "caption": "Audífonos Studio ANC Pro\nPrecio: ₡36,900\nEntrega disponible hoy."
         }
       }
       ```

**Ejemplo de payload entrante de Meta (`POST /api/webhook/whatsapp`):**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "50689014400",
              "phone_number_id": "109283746501928"
            },
            "contacts": [
              { "profile": { "name": "Valeria Mendoza" }, "wa_id": "50682914412" }
            ],
            "messages": [
              {
                "from": "50682914412",
                "id": "wamid.HBgLNTA2ODI5MTQ0MTIVAgARGBI5RDZBRjA=",
                "timestamp": "1763664720",
                "type": "text",
                "text": { "body": "Hola, ¿tienen Audífonos Studio ANC Pro?" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

---

### 2.2 Motor de Procesamiento Conversacional

#### `POST /api/engine/process-message` (y función interna `processMessage(input)`)
Punto único de inteligencia conversacional. Puede invocarse como función TypeScript/JS directa desde el webhook worker o por HTTP desde el **Simulador WhatsApp** del frontend (con `Authorization: Bearer <JWT>` o `X-Internal-Engine-Key`).

**Request JSON:**
```json
{
  "tenantId": "7d1a5e10-8a42-4c72-9b1f-9a2231a9f101",
  "fromPhone": "50688888888",
  "messageId": "wamid.HBgLNTA2ODg4ODg4ODgVAgARGBI5",
  "text": "Guarda filtro de aire CRF250, costo 12000, venta 18500, proveedor MotoASAP 88888888",
  "mediaUrl": "https://cdn.jarvistock.app/uploads/crf250.jpg",
  "timestamp": "2026-11-20T18:52:00Z"
}
```

**Lógica de Enrutamiento de Identidad (orden estricto):**
1. **Entrevistador de 5 preguntas (`channel_mode = 'onboarding'`):**
   - Se activa si existe una conversación abierta con `onboarding_step IN (1..5)` o si el texto contiene el comando de inicio de onboarding (`#ONBOARDING` / código de activación inicial).
   - Recolecta secuencialmente: (1) Negocio y giro, (2) Nombre de activación, (3) WhatsApp del dueño, (4) Margen `%`, (5) Regla de traspaso a humano.
   - Al completar la pregunta 5, crea/actualiza `tenants` y ambos perfiles en `agents` (`personal` + `attention`).
2. **Modo Dueño (`channel_mode = 'owner'`, agente `type = 'personal'` / `access_policy = 'owner_only'`):**
   - Se activa cuando `fromPhone` existe en `users` para ese `tenant_id` con `role = 'owner'`.
   - **Herramientas permitidas (`allowed_tools`):**
     - `search_catalog_owner`: consulta productos con `cost_price`, `sale_price`, margen y datos completos del proveedor (`suppliers.name`, `whatsapp_phone`, `location`).
     - `propose_create_product`: interpreta texto/foto y **crea una fila en `pending_actions`** (`action_type = 'create_product'`) sin insertar aún en `products`.
     - `propose_purchase_order`: prepara mensaje de orden de compra para un proveedor y **crea una fila en `pending_actions`** (`action_type = 'purchase_order'`) sin enviarlo aún.
     - `list_daily_pickups`: devuelve pedidos en `status = 'pedido_proveedor'` agrupados por proveedor y ubicación.
3. **Modo Cliente (`channel_mode = 'client'`, agente `type = 'attention'` / `access_policy = 'public'`):**
   - Se activa para cualquier número que **no** sea `role = 'owner'`.
   - **Herramientas permitidas (`allowed_tools`):**
     - `search_public_catalog`: retorna exclusivamente `{ id, name, description, image_url, sale_price }`. **Prohibido seleccionar o inyectar `cost_price` o datos de `suppliers`.**
     - `create_customer_order`: inserta orden en `orders` con `status = 'solicitud'` y crea `pending_action` (`action_type = 'purchase_order'`) para el dueño.
     - `escalate_out_of_catalog`: aplica `tenants.handoff_rule` y crea `pending_action` (`action_type = 'human_handoff'`).

**Response JSON (`200 OK`):**
```json
{
  "replyText": "Preparé \"Filtro de aire CRF250\" (Costo ₡12,000 → Venta ₡18,500, Margen 35.1%) con MotoASAP. Aprueba la tarjeta en tu panel HITL para guardarlo en el catálogo.",
  "replyMediaUrl": null,
  "createdPendingAction": {
    "id": "b19c42e8-5f12-402b-810e-0e42f01d7a22",
    "tenant_id": "7d1a5e10-8a42-4c72-9b1f-9a2231a9f101",
    "action_type": "create_product",
    "target_phone": "50688888888",
    "preview_text": "Registrar Filtro de aire CRF250 con proveedor MotoASAP (50688888888).",
    "payload_json": {
      "product": {
        "name": "Filtro de aire CRF250",
        "cost_price": 12000,
        "sale_price": 18500,
        "image_url": "https://cdn.jarvistock.app/uploads/crf250.jpg"
      },
      "supplier": {
        "name": "MotoASAP",
        "whatsapp_phone": "50688888888",
        "location": "Por confirmar"
      }
    },
    "status": "pending",
    "expires_at": "2026-11-21T18:52:00Z"
  }
}
```

> **Ejemplo de respuesta en Modo Cliente (consulta de producto):**
```json
{
  "replyText": "¡Sí! Tenemos disponible Audífonos Studio ANC Pro por ₡36,900 con entrega hoy. Cancelación activa híbrida 42dB y carga rápida USB-C. ¿Deseas solicitar tu pedido?",
  "replyMediaUrl": "https://cdn.jarvistock.app/products/audifonos-anc.jpg",
  "createdPendingAction": null
}
```

---

### 2.3 Endpoints REST para el CRM Frontend

Todos los endpoints siguientes requieren `Authorization: Bearer <JWT>` y operan automáticamente sobre el `tenant_id` del token.

#### Dashboard — `/api/dashboard`
- **`GET /api/dashboard`**
  - **Respuesta `200 OK`:**
    ```json
    {
      "kpis": {
        "projectedNetMargin": 122400,
        "totalSales": 249400,
        "totalCost": 127000,
        "avgMarginPct": 49.1,
        "activeOrdersCount": 4,
        "pendingHitlCount": 3,
        "catalogCount": 6,
        "suppliersCount": 4
      },
      "pipelineCounts": {
        "solicitud": 0,
        "cotizando": 1,
        "por_confirmar": 1,
        "pedido_proveedor": 1,
        "recogida_entrega": 1
      },
      "pendingPickups": [
        {
          "orderId": "uuid",
          "supplierName": "Mayorista Kinetix Audio",
          "supplierWhatsapp": "50683904458",
          "location": "Curridabat, Plaza del Sol · Nivel 1",
          "pickupNotes": "Apartado listo · Recoger hoy 16:30"
        }
      ],
      "recentActivity": [
        {
          "id": "uuid",
          "actor": "agent:personal",
          "action": "pending_action.created",
          "result": "Preparó OC #ORD-2041 para revisión HITL",
          "created_at": "2026-11-20T18:48:00Z"
        }
      ]
    }
    ```

#### Productos — `/api/products`
- **`GET /api/products?q=&category=&supplierId=&active=true`**
  - Busca por nombre, descripción, SKU, categoría o nombre de proveedor (soporta "¿Quién distribuye X?").
  - Retorna array de productos con proveedor embebido (`supplier: { id, name, whatsapp_phone, location }`) y campos calculados `margin_amount` y `margin_percent`.
- **`POST /api/products`**
  - Crea un producto en el catálogo. Permite enviar `supplier_id` existente **o** un objeto `new_supplier` para crear ambos en una sola transacción SQL.
  - **Request JSON:**
    ```json
    {
      "name": "Filtro de aire CRF250",
      "description": "Repuesto OEM de alto flujo para Honda CRF250.",
      "category": "Repuestos Moto",
      "image_url": "https://cdn.jarvistock.app/uploads/crf250.jpg",
      "cost_price": 12000,
      "sale_price": 18500,
      "supplier_id": null,
      "new_supplier": {
        "name": "MotoASAP",
        "whatsapp_phone": "50688888888",
        "location": "La Uruca, San José",
        "notes": "Retiro en mostrador"
      }
    }
    ```
  - **Respuesta `201 Created`:** Producto creado + proveedor asociado.
- **`PATCH /api/products/:id`**
  - Actualiza precio de costo, precio de venta, imagen, descripción, proveedor o estado `active`.

#### Proveedores — `/api/suppliers`
- **`GET /api/suppliers?q=`**
  - Lista los proveedores del tenant con `products_count` y lista resumida de SKUs asociados.
- **`POST /api/suppliers`**
  - **Request JSON:** `{ "name": "MotoASAP", "whatsapp_phone": "50688888888", "location": "La Uruca, San José", "notes": "Apartado por WhatsApp" }`
  - **Respuesta `201 Created`:** Proveedor creado.
- **`PATCH /api/suppliers/:id`**
  - Actualiza datos de contacto, ubicación o notas.

#### Pedidos y Logística — `/api/orders`
- **`GET /api/orders?status=&supplierId=&q=`**
  - Lista pedidos con cliente, producto, proveedor responsable, `total_sale`, `total_cost`, margen calculado y `status` sincronizado con las 5 etapas del `PipelineBar`.
- **`GET /api/orders/daily-pickup-route`**
  - Agrupa automáticamente todos los pedidos con `status = 'pedido_proveedor'` por `(supplier_id, location)` para alimentar la tarjeta **"Ruta de Recogida del Día"**.
  - **Respuesta `200 OK`:**
    ```json
    {
      "stops": [
        {
          "supplierId": "uuid",
          "supplierName": "Mayorista Kinetix Audio",
          "whatsappPhone": "50683904458",
          "location": "Curridabat, Plaza del Sol · Nivel 1",
          "totalCostToPay": 29700,
          "orders": [
            { "id": "uuid", "customerName": "Diego Villalobos", "itemsSummary": "1x Audífonos Studio ANC Pro", "pickupNotes": "Recoger hoy 16:30" }
          ]
        }
      ]
    }
    ```
- **`POST /api/orders`**
  - Crea manualmente una orden en `status` inicial (`'solicitud'` por defecto).
- **`PATCH /api/orders/:id`**
  - Permite avanzar `status` (`solicitud` -> `cotizando` -> `por_confirmar` -> `pedido_proveedor` -> `recogida_entrega` -> `entregado`) y actualizar `pickup_notes`. Registra el cambio en `audit_log`.

#### Acciones Pendientes (HITL) — `/api/pending-actions`
- **`GET /api/pending-actions?status=pending`**
  - Lista las acciones en cola ordenadas por `created_at DESC` (excluye o marca automáticamente como `'expired'` aquellas con `expires_at < NOW()`).
- **`POST /api/pending-actions`**
  - Encola una nueva acción HITL desde el frontend (ej. botón **"Pedir al Proveedor"** en el Catálogo).
  - **Request JSON:**
    ```json
    {
      "action_type": "purchase_order",
      "target_phone": "50683904458",
      "order_id": null,
      "preview_text": "Hola Mayorista Kinetix Audio, solicitamos apartar 1x Audífonos Studio ANC Pro (₡18,500) para recoger hoy.",
      "payload_json": { "productId": "uuid", "quantity": 1, "costPrice": 18500 }
    }
    ```
- **`POST /api/pending-actions/:id/approve`**
  - Ejecuta la acción dentro de una transacción PostgreSQL atómica:
    - Verifica que `status = 'pending'` y `expires_at > NOW()` (si no, `409 Conflict`).
    - Marca `status = 'approved'`, `decided_at = NOW()`.
    - Según `action_type`:
      - `create_product`: crea proveedor (si aplica) + producto en `products`.
      - `purchase_order`: actualiza `orders.status = 'pedido_proveedor'` (si tiene `order_id`) y envía el mensaje por Meta Graph API a `target_phone` (si `WHATSAPP_DRY_RUN=false`).
      - `quote_approval`: actualiza `orders.status = 'por_confirmar'` y envía la cotización al cliente por Meta Graph API.
      - `human_handoff`: marca el traspaso como atendido.
    - Inserta entrada en `audit_log`.
  - **Respuesta `200 OK`:**
    ```json
    {
      "action": { "id": "uuid", "status": "approved", "decided_at": "2026-11-20T19:00:00Z" },
      "whatsappDelivery": {
        "sentViaApi": true,
        "waMessageId": "wamid.HBgLNTA2...",
        "fallbackWaMeUrl": "https://wa.me/50683904458?text=Hola..."
      }
    }
    ```
- **`POST /api/pending-actions/:id/reject`**
  - Marca `status = 'rejected'`, `decided_at = NOW()` y registra la decisión en `audit_log` sin ejecutar efectos secundarios.

#### Fábrica de Agentes (Onboarding 5 Preguntas) — `/api/agents/onboarding`
- **`POST /api/agents/onboarding`**
  - Recibe las respuestas del asistente paso a paso sin código del CRM Frontend.
  - **Request JSON:**
    ```json
    {
      "businessName": "Repuestos MotoASAP",
      "businessIndustry": "Repuestos y accesorios de motocicleta",
      "activationName": "Jarvis",
      "ownerWhatsapp": "50688888888",
      "defaultMargin": 35,
      "handoffRule": "Escalar al dueño por WhatsApp y pausar respuestas automáticas"
    }
    ```
  - **Efecto transaccional:**
    1. Actualiza `tenants` (`name`, `business_industry`, `activation_name`, `default_margin`, `handoff_rule`, `status = 'active'`).
    2. Hace upsert del dueño en `users` (`phone = ownerWhatsapp`, `role = 'owner'`).
    3. Genera o actualiza ambos registros en `agents`:
       - `type = 'personal'`, `access_policy = 'owner_only'`, con `allowed_tools = ["search_catalog_owner","propose_create_product","propose_purchase_order","list_daily_pickups"]`.
       - `type = 'attention'`, `access_policy = 'public'`, con `allowed_tools = ["search_public_catalog","create_customer_order","escalate_out_of_catalog"]`.
    4. Registra el despliegue en `audit_log`.
  - **Respuesta `201 Created`:**
    ```json
    {
      "tenantId": "uuid",
      "activationCode": "JRV-JARV-4829",
      "usageCaps": {
        "monthlyMsgLimit": 1500,
        "ownerCommandsPerDay": 250
      },
      "agents": {
        "personal": { "id": "uuid", "type": "personal", "access_policy": "owner_only", "active": true },
        "attention": { "id": "uuid", "type": "attention", "access_policy": "public", "active": true }
      }
    }
    ```

---

## 3. Estructura de Variables de Entorno (`backend/.env.example`)

El archivo `backend/.env.example` debe separar claramente las variables gestionadas por el **equipo Backend/CRM** de las credenciales de **Meta WhatsApp Business Cloud API** que completará el segundo desarrollador.

```dotenv
# =============================================================================
# 1. CRM, SERVIDOR, BASE DE DATOS Y MOTOR IA (Equipo Backend Core)
# =============================================================================
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173

# PostgreSQL Multi-Tenant
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/jarvi_stock

# Autenticación CRM y comunicación interna del motor
JWT_SECRET=reemplazar_con_secreto_seguro_min_32_chars
INTERNAL_ENGINE_KEY=reemplazar_con_clave_interna_engine

# Motor IA (interpretación de comandos, visión de fotos y respuestas)
LLM_PROVIDER=gemini
LLM_API_KEY=reemplazar_con_api_key_llm
LLM_MODEL=gemini-2.5-flash

# Almacenamiento público de imágenes (catálogo y media descargada de WhatsApp)
MEDIA_PUBLIC_BASE_URL=http://localhost:4000/uploads
PENDING_ACTION_TTL_HOURS=24

# =============================================================================
# 2. META WHATSAPP BUSINESS CLOUD API (Completar por Desarrollador Meta)
# =============================================================================
# Token arbitrario configurado en Meta for Developers > Webhooks (para GET hub.verify_token)
WHATSAPP_VERIFY_TOKEN=jarvi_stock_verify_token_definir

# Token permanente de System User con permisos: whatsapp_business_messaging y whatsapp_business_management
WHATSAPP_ACCESS_TOKEN=EAAG...reemplazar_con_token_permanente_meta

# Identificador numérico del número de teléfono en Meta WhatsApp API Setup
WHATSAPP_PHONE_NUMBER_ID=109283746501928

# App Secret del dashboard de Meta App (Settings > Basic) para validar X-Hub-Signature-256
WHATSAPP_APP_SECRET=reemplazar_con_app_secret_meta

# Opcionales recomendados para operación y pruebas locales
WHATSAPP_GRAPH_API_VERSION=v21.0
WHATSAPP_WABA_ID=102938475610293
# En true: procesa todo el flujo en BD/HITL sin disparar POST reales a Graph API
WHATSAPP_DRY_RUN=false
```

---

## 4. Checklist de Integración para el Desarrollador de Meta

1. **Configurar Raw Body Middleware solo para el Webhook:** En Express/Fastify, preservar `req.rawBody` en `/api/webhook/whatsapp` antes de parsear JSON; de lo contrario, el hash `HMAC-SHA256` contra `X-Hub-Signature-256` fallará siempre.
2. **Validar Verificación (`GET`):** Exponer el servidor vía túnel HTTPS (ngrok / Cloudflare Tunnel) y confirmar que Meta recibe `200 OK` con `hub.challenge` en `text/plain`.
3. **Suscribir campo `messages`:** En Meta App Dashboard -> WhatsApp -> Configuration -> Webhook Fields, suscribir `messages`.
4. **Probar Deduplicación:** Reenviar manualmente el mismo payload JSON con idéntico `wamid.*` y verificar que `messages` mantiene una sola fila y no se duplican respuestas ni tarjetas `pending_actions`.
5. **Verificar Aislamiento de Roles:**
   - Enviar un mensaje desde el número registrado en `users` con `role = 'owner'` -> debe activar el agente `personal` y crear una `pending_action`.
   - Enviar un mensaje desde un número externo -> debe activar el agente `attention`, mostrar foto + precio de venta y **nunca** filtrar costos ni datos de proveedores.
