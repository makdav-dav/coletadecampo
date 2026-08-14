-- ================================================================
-- Migração: guardar a posição corrigida (oficial) + a leitura bruta
-- do GPS em cada ponto/espaço.
--
-- COMO RODAR:
--   Supabase → seu projeto → SQL Editor → New query →
--   cole tudo isto → RUN.
--
-- Rode ANTES de publicar a nova versão do app. Enquanto essas colunas
-- não existirem, salvar um ponto vai dar erro (fica preso na fila).
-- É seguro rodar mais de uma vez (usa "if not exists").
-- ================================================================

-- Pontos de arborização
alter table public.arbo_pontos
  add column if not exists lat_gps  double precision,   -- leitura bruta do GPS
  add column if not exists lng_gps  double precision,
  add column if not exists ajustado boolean default false;  -- pino foi movido?

-- Espaços de jardinagem
alter table public.jard_espacos
  add column if not exists lat_gps    double precision,
  add column if not exists lng_gps    double precision,
  add column if not exists precisao_m numeric,
  add column if not exists ajustado   boolean default false;
