/**
 * Serviço PostgreSQL (Neon.tech / Local)
 */

const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    // CORREÇÃO: Neon.tech (e a maioria dos provedores gerenciados de Postgres)
    // exige conexão SSL. Desativar SSL quebra a conexão com esses provedores.
    // Para bancos locais sem SSL, defina PG_SSL=false no .env.
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
    // Amortecedor de erros. Em vez de quebrar, avisa a IA amigavelmente.
    console.error("Erro no Banco de Dados:", error.message);
    return {
      rows: [[`Aviso para a IA: Ocorreu um erro ao consultar a base de dados: ${error.message}. Informe o utilizador.`]],
      fields: [],
    };
  }
}

module.exports = { queryDB };
