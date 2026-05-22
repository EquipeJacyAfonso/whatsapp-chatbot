-- ─────────────────────────────────────────────────────────────────
-- Schema baseado na planilha real: FORMULÁRIO DE CONTATOS THIAGO
-- Execute no seu banco PostgreSQL antes de rodar o sync
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contatos (
    id                  SERIAL PRIMARY KEY,

    -- Colunas originais da planilha
    carimbo_data_hora   TEXT,
    nome_completo       TEXT,
    orgao_empresa       TEXT,
    profissao           TEXT,
    area_atuacao        TEXT,
    whatsapp            TEXT,
    email               TEXT,
    redes_sociais       TEXT,
    endereco_completo   TEXT,
    bairro              TEXT,
    cidade              TEXT,
    uf                  TEXT,
    cep                 TEXT,
    cidade_votacao      TEXT,
    apoia_deputado      TEXT,
    pais                TEXT,
    presente_lancamento TEXT,
    apoiador            TEXT,
    agenda              TEXT,
    origem              TEXT,
    repeticao           TEXT,
    validacao           TEXT,
    data_coluna         TEXT,
    maiusculo           TEXT,
    primeiro_nome       TEXT,
    email_endereco      TEXT,

    -- Controle de sincronização
    linha_planilha      INTEGER UNIQUE,   -- número da linha na planilha (2, 3, 4...)
    sincronizado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em       TIMESTAMP DEFAULT NOW()
);

-- Índices para as consultas mais comuns do chatbot
CREATE INDEX IF NOT EXISTS idx_contatos_nome      ON contatos (LOWER(nome_completo));
CREATE INDEX IF NOT EXISTS idx_contatos_cidade    ON contatos (LOWER(cidade));
CREATE INDEX IF NOT EXISTS idx_contatos_uf        ON contatos (LOWER(uf));
CREATE INDEX IF NOT EXISTS idx_contatos_bairro    ON contatos (LOWER(bairro));
CREATE INDEX IF NOT EXISTS idx_contatos_whatsapp  ON contatos (whatsapp);
CREATE INDEX IF NOT EXISTS idx_contatos_linha     ON contatos (linha_planilha);
