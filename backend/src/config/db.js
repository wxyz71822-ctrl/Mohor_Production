import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
});

try {
  const client = await pool.connect();
  console.log("✅ Successfully connected to PostgreSQL (Neon)");
  client.release();
} catch (error) {
  console.error("❌ Database connection failed:", error.message);
  process.exit(1);
}

export default pool;