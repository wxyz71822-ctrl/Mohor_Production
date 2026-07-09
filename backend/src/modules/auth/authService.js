import pool from '../../config/db.js';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

export const createUserService = async ({ name, phone, address, password }) => {
  const userId = uuidv4();
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const query = `
    INSERT INTO users (id, name, phone, address, password, role) 
    VALUES ($1, $2, $3, $4, $5, 'customer')
  `;
  const values = [userId, name, phone, address || null, passwordHash];
  await pool.query(query, values);

  return { id: userId, name, phone, address, role: 'customer' };
};

export const findUserByPhoneService = async (phone) => {
  const query = 'SELECT * FROM users WHERE phone = $1 LIMIT 1';
  const { rows } = await pool.query(query, [phone]);

  return rows.length > 0 ? rows[0] : null;
};

export const findUserByIdService = async (id) => {
  const query = `SELECT * FROM users WHERE id = $1 LIMIT 1`;

  const { rows } = await pool.query(query, [id]);

  return rows.length ? rows[0] : null;
};

export const updateUserService = async (id, { name, phone, address }) => {
  await pool.query(
    `UPDATE users SET name = $1, phone = $2, address = $3 WHERE id = $4`,
    [name, phone, address || null, id]
  );

  return { id, name, phone, address };
};

export const updateUserPasswordService = async (id, newPassword) => {
  const hash = await bcrypt.hash(newPassword, 10);

  await pool.query(
    `UPDATE users SET password = $1 WHERE id = $2`,
    [hash, id]
  );

  return true;
};
