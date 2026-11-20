-- ============================================================================
-- JARVI STOCK - ESQUEMA RELACIONAL MULTI-TENANT (POSTGRESQL 15+)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TENANTS
CREATE TABLE IF NOT EXISTS tenants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               VARCHAR(140) NOT NULL,
  business_industry  VARCHAR(160) DEFAULT 'Comercio sin inventario',
  activation_name    VARCHAR(60)  NOT NULL DEFAULT 'Jarvis',
  default_margin     NUMERIC(5,2) NOT NULL DEFAULT 40.00
                     CHECK (default_margin >= 0 AND default_margin < 100),
  handoff_rule       TEXT         NOT NULL DEFAULT 'Escalar al dueño por WhatsApp y pausar respuestas automáticas',
  wa_phone_number_id VARCHAR(64)  UNIQUE,
  status             VARCHAR(20)  NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'onboarding', 'suspended')),
  monthly_msg_limit  INTEGER      NOT NULL DEFAULT 1500 CHECK (monthly_msg_limit > 0),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. USERS
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone      VARCHAR(24)  NOT NULL,
  name       VARCHAR(120) NOT NULL,
  role       VARCHAR(20)  NOT NULL CHECK (role IN ('owner', 'contact')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_users_tenant_phone UNIQUE (tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users (tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);

-- 3. SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           VARCHAR(140) NOT NULL,
  whatsapp_phone VARCHAR(24)  NOT NULL,
  location       VARCHAR(255) NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_suppliers_tenant_id_id UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_name ON suppliers (tenant_id, LOWER(name));

-- 4. PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id UUID          NOT NULL,
  sku         VARCHAR(48),
  category    VARCHAR(80)   NOT NULL DEFAULT 'General',
  name        VARCHAR(160)  NOT NULL,
  description TEXT,
  image_url   TEXT,
  cost_price  NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
  sale_price  NUMERIC(12,2) NOT NULL CHECK (sale_price >= 0),
  active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_products_tenant_id_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_products_supplier_same_tenant
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_active ON products (tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_products_tenant_supplier ON products (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_name ON products (tenant_id, LOWER(name));

-- 5. ORDERS
CREATE TABLE IF NOT EXISTS orders (
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
                   'solicitud',
                   'cotizando',
                   'por_confirmar',
                   'pedido_proveedor',
                   'recogida_entrega',
                   'entregado',
                   'cancelado'
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

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_supplier_status ON orders (tenant_id, supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created ON orders (tenant_id, created_at DESC);

-- 6. AGENTS
CREATE TABLE IF NOT EXISTS agents (
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

CREATE INDEX IF NOT EXISTS idx_agents_tenant_type ON agents (tenant_id, type, active);

-- 7. CONVERSATIONS & MESSAGES
CREATE TABLE IF NOT EXISTS conversations (
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

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last ON conversations (tenant_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  wa_message_id   VARCHAR(128) UNIQUE,
  direction       VARCHAR(10)  NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_phone    VARCHAR(24)  NOT NULL,
  message_type    VARCHAR(20)  NOT NULL DEFAULT 'text'
                  CHECK (message_type IN ('text', 'image', 'document', 'audio', 'interactive')),
  body_text       TEXT,
  media_url       TEXT,
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_created ON messages (tenant_id, created_at DESC);

-- 8. PENDING_ACTIONS (HITL)
CREATE TABLE IF NOT EXISTS pending_actions (
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

CREATE INDEX IF NOT EXISTS idx_pending_actions_tenant_status ON pending_actions (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_actions_expires ON pending_actions (status, expires_at) WHERE status = 'pending';

-- 9. AUDIT_LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor      VARCHAR(120) NOT NULL,
  action     VARCHAR(120) NOT NULL,
  result     TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created ON audit_log (tenant_id, created_at DESC);
