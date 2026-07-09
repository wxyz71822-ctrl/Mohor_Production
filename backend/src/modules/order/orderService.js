import pool from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';

export const createOrderInDb = async ({ userId, items, shippingAddress, phone, paymentMethod, clearCart }) => {
  const client = await pool.connect();
  await client.query('BEGIN');

  try {
    let totalAmount = 0;
    const verifiedItems = [];

    for (const item of items) {
      const { rows: prodRows } = await client.query(
        'SELECT id, name, price, quantity FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      const product = prodRows[0];
      if (!product) {
        throw new Error(`Product mapping failed for ID ${item.product_id}`);
      }

      if (product.quantity < item.selected_quantity) {
        throw new Error(`Insufficient stock for ${product.name}. Available: ${product.quantity}`);
      }

      const itemTotal = parseFloat(product.price) * item.selected_quantity;
      totalAmount += itemTotal;

      verifiedItems.push({
        product_id: product.id,
        quantity: item.selected_quantity,
        price_at_purchase: product.price
      });
    }

    const orderId = uuidv4();

    await client.query(
      `INSERT INTO orders (id, user_id, total_amount, shipping_name, shipping_phone, shipping_address, payment_reference, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [orderId, userId, totalAmount, 'Customer Delivery', phone, shippingAddress, paymentMethod || 'Cash on Delivery']
    );

    for (const item of verifiedItems) {
      const orderItemId = uuidv4();

      await client.query(
        `INSERT INTO order_items (id, order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4, $5)`,
        [orderItemId, orderId, item.product_id, item.quantity, item.price_at_purchase]
      );

      await client.query(
        `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    if (clearCart) {
      await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    }

    await client.query('COMMIT');
    return { orderId, totalAmount };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getUserOrdersFromDb = async (userId) => {
  const { rows } = await pool.query(
    `SELECT 
      o.id AS order_id,
      o.total_amount AS total_price,
      o.status,
      o.created_at AS ordertime,
      COALESCE(o.payment_reference, 'Cash on Delivery') AS payment_method,
      COALESCE(
        json_agg(
          json_build_object(
            'product_name', p.name,
            'quantity', oi.quantity,
            'price_at_purchase', oi.price_at_purchase
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     LEFT JOIN products p ON oi.product_id = p.id
     WHERE o.user_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [userId]
  );
  return rows;
};

export const getAllOrdersForAdminFromDb = async (searchProduct = '') => {
  const queryParams = [];

  let query = `
    SELECT 
      o.id AS order_id,
      COALESCE(u.name, o.shipping_name) AS user_name,
      o.shipping_phone AS user_number,
      o.shipping_address AS address,
      o.total_amount AS total_price,
      o.status,
      o.created_at AS ordertime,
      COALESCE(NULLIF(o.payment_reference, ''), 'Cash on Delivery') AS payment_method,
      COALESCE(
        json_agg(
          json_build_object(
            'product_name', COALESCE(p.name, 'Unknown Product'),
            'quantity', COALESCE(oi.quantity, 1),
            'price_at_purchase', COALESCE(oi.price_at_purchase, 0.00)
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) AS items
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.id
  `;

  if (searchProduct.trim() !== '') {
    queryParams.push(`%${searchProduct}%`);
    query += ` WHERE p.name ILIKE $${queryParams.length} `;
  }

  query += `
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `;

  const { rows } = await pool.query(query, queryParams);
  return rows;
};

export const updateOrderStatusInDb = async (orderId, status) => {
  const validStatuses = ['pending', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid system fulfillment status sequence requested.');
  }

  const result = await pool.query(
    `UPDATE orders SET status = $1 WHERE id = $2`,
    [status, orderId]
  );

  if (result.rowCount === 0) {
    throw new Error('Target order identifier lookup failed.');
  }
  return true;
};
