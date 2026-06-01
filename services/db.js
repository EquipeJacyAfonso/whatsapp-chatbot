/**
 * Serviço PostgreSQL (Neon.tech)
 */

const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

async function queryDB(sql, params = []) {
  const p = getPool();
  if (!p) return { rows: [], fields: [] };

  const client = await p.connect();
  try {
    const result = await client.query(sql, params);
    return { rows: result.rows, fields: result.fields };
  } finally {
    client.release();
  }
}

module.exports = { queryDB };
