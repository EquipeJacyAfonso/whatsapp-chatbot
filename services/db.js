/**
 * Serviço PostgreSQL (Neon.tech / Local)
 */

const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // MUDANÇA: Desativado o SSL para evitar o erro "The server does not support SSL"
      ssl: false, 
      max: 3,
      idleTimeoutMillis: 30000,
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
    // MUDANÇA: Amortecedor de erros. Em vez de quebrar, avisa a IA amigavelmente.
    console.error("Erro no Banco de Dados:", error.message);
    return { 
      rows: [[`Aviso para a IA: Ocorreu um erro ao consultar a base de dados: ${error.message}. Informe o utilizador.`]], 
      fields: [] 
    };
  }
}

module.exports = { queryDB };