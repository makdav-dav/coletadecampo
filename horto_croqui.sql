-- ================================================================
-- CROQUI DO CANTEIRO — planta/mapa do inventário
--   Guarda a geometria (em metros) do canteiro retangular e das
--   quadras posicionadas dentro dele. Mudas e espécie dominante
--   NÃO são guardadas aqui: vêm ao vivo de horto_itens.
--
-- COMO RODAR:
--   Supabase → SQL Editor → New query → cole tudo → RUN.
--   Seguro rodar de novo (usa "if not exists").
--
-- FORMATO do campo croqui (jsonb):
--   {
--     "largura_m": 12,
--     "comprimento_m": 8,
--     "quadras": {
--       "<id_quadra>": { "x": 0.5, "y": 0.5, "w": 5, "h": 3 }
--     }
--   }
--   Coordenadas em metros, origem no canto superior-esquerdo.
-- ================================================================

alter table public.horto_canteiros
  add column if not exists croqui jsonb;

-- Observação: não é preciso mexer em RLS. A coluna pertence a
-- horto_canteiros, que já tem as políticas de leitura/escrita
-- definidas em horto_inventario.sql.
