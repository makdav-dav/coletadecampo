-- ================================================================
-- AVALIAÇÃO DE RISCO DE ÁRVORES URBANAS — método de Seitz (2005)
--   Análise visual de risco de queda. Cada item recebe nota 0–3.
--   Sem cálculo de índice: guarda o preenchimento cru.
--   Reaproveita GPS e fotos do app (fotos: entidade 'arvore_risco').
--
-- COMO RODAR:
--   Supabase → SQL Editor → New query → cole tudo → RUN.
--   Rode DEPOIS do acesso_rls.sql (usa as funções de papel).
--   Seguro rodar de novo (usa "if not exists" / recria policies).
-- ================================================================

create table if not exists public.arvores_risco (
  id_risco      uuid primary key,
  n_processo    text,
  especie       text,
  avaliador     text,               -- e-mail de quem preencheu
  endereco      text,
  lat double precision, lng double precision,
  lat_gps double precision, lng_gps double precision,
  precisao_m numeric, ajustado boolean,
  altura_total  numeric,            -- metros
  dap           numeric,            -- cm (diâmetro à altura do peito)
  itens         jsonb,              -- { copa:[0..3|null], tronco:[...], base:[...] }
  alvos         jsonb,              -- ["Rua residencial...", ...]
  manejo        jsonb,              -- ["Poda de limpeza", ...]
  outras_opcoes text,
  obs           text,
  criado_em     timestamptz default now(),
  criado_por    text
);

create index if not exists idx_risco_criado on public.arvores_risco(criado_em desc);

-- RLS: mesmas regras dos outros módulos
--   select: autorizado · insert: coletor+ ·
--   update/delete: editor/admin OU coletor no próprio registro
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='arvores_risco' loop
    execute format('drop policy %I on public.arvores_risco', p.policyname);
  end loop;
  alter table public.arvores_risco enable row level security;
  create policy "autorizados leem" on public.arvores_risco for select to authenticated using (public.is_autorizado());
  create policy "coletores inserem" on public.arvores_risco for insert to authenticated with check (public.pode_coletar());
  create policy "edita tudo ou o proprio (upd)" on public.arvores_risco for update to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email'))) with check (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email')));
  create policy "edita tudo ou o proprio (del)" on public.arvores_risco for delete to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email')));
end $$;
