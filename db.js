/**
 * Serviço PostgreSQL — conexão com pool e SSL (compatível com Neon.tech)
 */

const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString:    process.env.DATABASE_URL,
      ssl:                 { rejectUnauthorized: false },
      max:                 3,
      idleTimeoutMillis:   30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on("error", (err) => {
      console.error("⚠️  Erro no pool PostgreSQL:", err.message);
    });
  }
  return pool;
}

async function queryDB(sql, params = []) {
  const p = getPool();
  if (!p) {
    console.warn("⚠️  DATABASE_URL não configurada — banco desativado.");
    return { rows: [], fields: [] };
  }
  const client = await p.connect();
  try {
    const result = await client.query(sql, params);
    return { rows: result.rows, fields: result.fields };
  } finally {
    client.release();
  }
}

module.exports = { queryDB };
