import pool from '../../config/db.js';
import cloudinary from '../../config/cloudinary.js';
import { v4 as uuidv4 } from 'uuid';
import streamifier from 'streamifier';

const uploadBufferToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'mohor_products',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

export const createProduct = async ({
  name,
  description,
  price,
  quantity,
  category,
  files,
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const productId = uuidv4();

    await client.query(
      `
      INSERT INTO products
      (id, name, description, price, quantity, category)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [productId, name, description, price, quantity, category]
    );

    if (files?.length) {
      for (const file of files) {
        const uploadResult = await uploadBufferToCloudinary(file.buffer);
        console.log("Cloudinary URL:", uploadResult.secure_url);
        await client.query(
          `
          INSERT INTO product_images
          (id, product_id, url)
          VALUES ($1, $2, $3)
          `,
          [
            uuidv4(),
            productId,
            uploadResult.secure_url,
          ]
        );
      }
    }

    await client.query('COMMIT');

    return {
      id: productId,
      name,
      description,
      price,
      quantity,
      category,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getAllProducts = async () => {
  const query = `
    SELECT p.*,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', pi.id,
                 'url', pi.url
               )
             ) FILTER (WHERE pi.id IS NOT NULL),
             '[]'
           ) AS images
    FROM products p
    LEFT JOIN product_images pi
      ON p.id = pi.product_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;

  const { rows } = await pool.query(query);

  return rows.map((row) => ({
    ...row,
    images: Array.isArray(row.images)
      ? row.images.filter(Boolean)
      : JSON.parse(row.images || '[]').filter(Boolean),
  }));
};

export const getProductById = async (id) => {
  const { rows: products } = await pool.query(
    `SELECT * FROM products WHERE id = $1`,
    [id]
  );

  if (!products.length) return null;

  const { rows: images } = await pool.query(
    `SELECT id, url FROM product_images WHERE product_id = $1`,
    [id]
  );

  return {
    ...products[0],
    images,
  };
};

export const searchProducts = async (searchTerm) => {
  const query = `
    SELECT p.*,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', pi.id,
                 'url', pi.url
               )
             ) FILTER (WHERE pi.id IS NOT NULL),
             '[]'
           ) AS images
    FROM products p
    LEFT JOIN product_images pi
      ON p.id = pi.product_id
    WHERE
      p.name ILIKE $1
      OR p.description ILIKE $2
      OR p.category ILIKE $3
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;

  const keyword = `%${searchTerm}%`;

  const { rows } = await pool.query(query, [
    keyword,
    keyword,
    keyword,
  ]);

  return rows.map((row) => ({
    ...row,
    images: Array.isArray(row.images)
      ? row.images.filter(Boolean)
      : JSON.parse(row.images || '[]').filter(Boolean),
  }));
};

export const getProductsByCategory = async (category) => {
  const query = `
    SELECT p.*,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', pi.id,
                 'url', pi.url
               )
             ) FILTER (WHERE pi.id IS NOT NULL),
             '[]'
           ) AS images
    FROM products p
    LEFT JOIN product_images pi
      ON p.id = pi.product_id
    WHERE p.category = $1
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;

  const { rows } = await pool.query(query, [category]);

  return rows.map((row) => ({
    ...row,
    images: Array.isArray(row.images)
      ? row.images.filter(Boolean)
      : JSON.parse(row.images || '[]').filter(Boolean),
  }));
};

export const getCategories = async () => {
  const { rows } = await pool.query(`
    SELECT DISTINCT category
    FROM products
    WHERE category IS NOT NULL
    ORDER BY category
  `);

  return rows.map((row) => row.category);
};

export const updateProduct = async (
  id,
  { name, description, price, quantity, category }
) => {
  const result = await pool.query(
    `
    UPDATE products
    SET
      name = $1,
      description = $2,
      price = $3,
      quantity = $4,
      category = $5
    WHERE id = $6
    `,
    [name, description, price, quantity, category, id]
  );

  return result.rowCount > 0;
};

export const deleteProduct = async (id) => {
  const { rows: images } = await pool.query(
    `SELECT url FROM product_images WHERE product_id = $1`,
    [id]
  );

  for (const image of images) {
    try {
      const url = image.url;

      const publicId = url
        .split('/upload/')[1]
        .split('.')[0];

      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.error(
        'Cloudinary delete failed:',
        err.message
      );
    }
  }

  const result = await pool.query(
    `DELETE FROM products WHERE id = $1`,
    [id]
  );

  return result.rowCount > 0;
};
