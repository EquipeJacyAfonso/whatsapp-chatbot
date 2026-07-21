/**
 * Serviço PostgreSQL (Neon.tech / Local)
 */

const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    const sslDisabled = String(process.env.PG_SSL || "").toLowerCase() === "false";

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslDisabled ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
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
  if (!p) return { rows: [], fields: [], error: "Banco de dados não configurado." };

  try {
    const client = await p.connect();
    try {
      const result = await client.query(sql, params);
      return { rows: result.rows, fields: result.fields };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Erro no Banco de Dados:", error.message);
    return {
      rows: [[`Aviso para a IA: Ocorreu um erro ao consultar a base de dados: ${error.message}. Informe o utilizador.`]],
      fields: [],
      error: error.message,
    };
  }
}

/**
 * Lista as tabelas do schema 'public'. Genérico — não presume nenhum
 * schema fixo de negócio, funciona com qualquer banco configurado.
 */
async function listTables() {
  const { rows, error } = await queryDB(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  if (error) return { tables: [], error };
  return { tables: rows.map((r) => r.table_name), error: null };
}

/**
 * Descreve as colunas de uma tabela específica (nome + tipo).
 */
async function describeTable(tableName) {
  const { rows, error } = await queryDB(
    `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
    `,
    [tableName]
  );
  if (error) return { columns: [], error };
  return { columns: rows, error: null };
}

module.exports = { queryDB, listTables, describeTable };
