-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- ENUM TYPES
-- =========================

CREATE TYPE user_role AS ENUM (
    'customer',
    'admin'
);

CREATE TYPE order_status AS ENUM (
    'pending',
    'shipped',
    'delivered',
    'cancelled'
);

-- =========================
-- USERS
-- =========================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    address TEXT,
    password VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- PRODUCTS
-- =========================

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    category VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- PRODUCT IMAGES
-- =========================

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    url TEXT NOT NULL,

    CONSTRAINT fk_product_images_product
        FOREIGN KEY (product_id)
        REFERENCES products(id)
        ON DELETE CASCADE
);

-- =========================
-- CART ITEMS
-- =========================

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

    CONSTRAINT fk_cart_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_cart_product
        FOREIGN KEY (product_id)
        REFERENCES products(id)
        ON DELETE CASCADE,

    CONSTRAINT unique_user_product
        UNIQUE (user_id, product_id)
);

-- =========================
-- ORDERS
-- =========================

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),

    shipping_name VARCHAR(255) NOT NULL,
    shipping_phone VARCHAR(20) NOT NULL,
    shipping_address TEXT NOT NULL,

    payment_reference TEXT,

    status order_status NOT NULL DEFAULT 'pending',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_order_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
);

-- =========================
-- ORDER ITEMS
-- =========================

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL,
    product_id UUID NOT NULL,

    quantity INTEGER NOT NULL CHECK (quantity > 0),

    price_at_purchase DECIMAL(10,2) NOT NULL CHECK (price_at_purchase >= 0),

    CONSTRAINT fk_order_item_order
        FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_order_item_product
        FOREIGN KEY (product_id)
        REFERENCES products(id)
);

-- =========================
-- AUDIT LOGS
-- =========================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    entity_type VARCHAR(20),
    entity_id UUID,

    action_type VARCHAR(50) NOT NULL,

    actor_user_id UUID,
    actor_name VARCHAR(255),

    description TEXT NOT NULL,

    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_actor
        FOREIGN KEY (actor_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

-- =========================
-- INDEXES
-- =========================

CREATE INDEX idx_products_category
ON products(category);

CREATE INDEX idx_product_images_product_id
ON product_images(product_id);

CREATE INDEX idx_cart_user
ON cart_items(user_id);

CREATE INDEX idx_orders_user
ON orders(user_id);

CREATE INDEX idx_orders_status
ON orders(status);

CREATE INDEX idx_order_items_order
ON order_items(order_id);

CREATE INDEX idx_order_items_product
ON order_items(product_id);

CREATE INDEX idx_audit_logs_actor
ON audit_logs(actor_user_id);

CREATE INDEX idx_audit_logs_entity
ON audit_logs(entity_type, entity_id);