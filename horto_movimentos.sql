-- ================================================================
-- MOVIMENTAÇÕES DE MUDAS — entradas e saídas (realizadas e previstas)
--   Cada movimento é lançado por QUADRA (via id_item = espécie+porte
--   numa quadra). Movimentos REALIZADOS ajustam horto_itens.quantidade
--   (entrada soma, saída subtrai). PREVISTOS não mexem no estoque —
--   entram só na projeção de saldo.
--
-- COMO RODAR:
--   Supabase → SQL Editor → New query → cole tudo → RUN.
--   Rode DEPOIS de horto_inventario.sql (usa as funções de papel).
--   Seguro rodar de novo (usa "if not exists" / recria policies).
--
-- MOTIVOS (texto livre, mas o app sugere):
--   entrada: producao | compra | doacao_receb | transf_in
--   saida:   plantio  | doacao | descarte     | transf_out
-- ================================================================

create table if not exists public.horto_movimentos (
  id_mov        uuid primary key,
  id_item       uuid references public.horto_itens(id_item) on delete cascade,
  id_quadra     uuid,               -- denormalizado p/ filtro/relatório
  especie_texto text,               -- denormalizado
  porte         text,               -- denormalizado
  tipo          text,               -- 'entrada' | 'saida'
  status        text,               -- 'realizado' | 'previsto'
  motivo        text,               -- ver lista acima
  quantidade    integer,
  data          date,               -- data realizada OU prevista
  obs           text,
  criado_em     timestamptz default now(),
  criado_por    text
);

create index if not exists idx_mov_item   on public.horto_movimentos(id_item);
create index if not exists idx_mov_quadra on public.horto_movimentos(id_quadra);
create index if not exists idx_mov_data    on public.horto_movimentos(data);

-- RLS: mesmas regras dos outros módulos do horto
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='horto_movimentos' loop
    execute format('drop policy %I on public.horto_movimentos', p.policyname);
  end loop;
  alter table public.horto_movimentos enable row level security;
  create policy "autorizados leem" on public.horto_movimentos for select to authenticated using (public.is_autorizado());
  create policy "coletores inserem" on public.horto_movimentos for insert to authenticated with check (public.pode_coletar());
  create policy "edita tudo ou o proprio (upd)" on public.horto_movimentos for update to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email'))) with check (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email')));
  create policy "edita tudo ou o proprio (del)" on public.horto_movimentos for delete to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email')));
end $$;
