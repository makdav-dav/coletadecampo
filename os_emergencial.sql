-- ================================================================
-- OS EMERGENCIAL — acionamento de equipe terceira fora do horário
-- comercial / fins de semana (ex.: queda de árvore obstruindo via).
-- Reaproveita GPS e fotos do app (fotos: entidade 'os_emergencial').
--
-- COMO RODAR:
--   Supabase → SQL Editor → New query → cole tudo → RUN.
--   Rode DEPOIS do acesso_rls.sql (usa as funções de papel).
--   Seguro rodar de novo (usa "if not exists" / recria policies).
-- ================================================================

create table if not exists public.os_emergencial (
  id_os         uuid primary key,
  descricao     text,              -- o que aconteceu (queda de árvore, etc.)
  endereco      text,
  lat double precision, lng double precision,
  risco_rede    boolean default false,   -- fio energizado envolvido (não atuar, acionar concessionária)
  status        text default 'aberta',  -- aberta | atendida | concluida
  numero_whatsapp text,            -- número acionado no momento da abertura
  obs_conclusao text,
  aberto_por    text,
  aberto_em     timestamptz default now(),
  atendido_em   timestamptz,
  concluido_em  timestamptz,
  criado_em     timestamptz default now(),
  criado_por    text
);

create index if not exists idx_os_emerg_criado on public.os_emergencial(criado_em desc);
create index if not exists idx_os_emerg_status on public.os_emergencial(status);

-- RLS: mesmas regras dos outros módulos
--   select: autorizado · insert: coletor+ ·
--   update/delete: editor/admin OU coletor no próprio registro
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='os_emergencial' loop
    execute format('drop policy %I on public.os_emergencial', p.policyname);
  end loop;
  alter table public.os_emergencial enable row level security;
  create policy "autorizados leem" on public.os_emergencial for select to authenticated using (public.is_autorizado());
  create policy "coletores inserem" on public.os_emergencial for insert to authenticated with check (public.pode_coletar());
  create policy "edita tudo ou o proprio (upd)" on public.os_emergencial for update to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email'))) with check (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email')));
  create policy "edita tudo ou o proprio (del)" on public.os_emergencial for delete to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> 'email')));
end $$;
