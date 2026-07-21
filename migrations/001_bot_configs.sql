-- Tabela de configuração por grupo (multi-tenant).
-- O services/config.js já cria esta tabela automaticamente na primeira
-- vez que é necessária, mas você pode rodar este script manualmente
-- se preferir controlar migrations explicitamente.

CREATE TABLE IF NOT EXISTS bot_configs (
  group_id   TEXT PRIMARY KEY,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exemplo de override para um grupo específico:
-- INSERT INTO bot_configs (group_id, config) VALUES (
--   '5511999999999-1234567890@g.us',
--   '{
--     "orgName": "Campanha do Cliente B",
--     "botName": "Bot da Campanha B",
--     "spreadsheetId": "1AbCdEfGhIjKlMnOpQrStUvWxYz",
--     "aiProvider": "groq",
--     "enableCalendar": false
--   }'::jsonb
-- )
-- ON CONFLICT (group_id) DO UPDATE SET config = EXCLUDED.config;
