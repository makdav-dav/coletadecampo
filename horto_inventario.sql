-- ================================================================
-- MÓDULO HORTO MUNICIPAL — inventário de mudas
--   Canteiro → Quadra → Item (espécie + porte + quantidade)
--   + fotos em cada nível  + catálogo de espécies estendido
--
-- COMO RODAR:
--   Supabase → SQL Editor → New query → cole tudo → RUN.
--   Rode DEPOIS do acesso_rls.sql (usa as funções de papel dele).
--   É seguro rodar de novo (usa "if not exists" / recria policies).
-- ================================================================

-- 1) Catálogo de espécies: novos campos botânicos -----------------
alter table public.especies_catalogo
  add column if not exists nome_cientifico text,
  add column if not exists classificacao   text,   -- frutifera | ornamental
  add column if not exists origem           text,   -- nativa | exotica
  add column if not exists fruto            text;   -- comestivel | fauna | comestivel,fauna

-- 2) Canteiros ----------------------------------------------------
create table if not exists public.horto_canteiros (
  id_canteiro uuid primary key,
  codigo      text,
  nome        text,
  obs         text,
  lat double precision, lng double precision,
  lat_gps double precision, lng_gps double precision,
  precisao_m numeric, ajustado boolean default false,
  criado_em   timestamptz default now(),
  criado_por  text
);

-- 3) Quadras (dentro de um canteiro) ------------------------------
create table if not exists public.horto_quadras (
  id_quadra   uuid primary key,
  id_canteiro uuid references public.horto_canteiros(id_canteiro) on delete cascade,
  codigo      text,
  nome        text,
  obs         text,
  criado_em   timestamptz default now(),
  criado_por  text
);

-- 4) Itens de inventário (uma linha por espécie + porte) ----------
create table if not exists public.horto_itens (
  id_item       uuid primary key,
  id_quadra     uuid references public.horto_quadras(id_quadra) on delete cascade,
  id_especie    text,               -- referência solta ao catálogo (opcional)
  especie_texto text,               -- nome da espécie (denormalizado p/ relatório)
  porte         text,               -- pequeno | medio | grande
  quantidade    integer,
  obs           text,
  criado_em     timestamptz default now(),
  criado_por    text
);

-- 5) RLS: mesmas regras dos outros módulos ------------------------
--    select: autorizado · insert: coletor+ ·
--    update/delete: editor/admin OU coletor no próprio registro
do $$
declare t text; p record;
begin
  foreach t in array array['horto_canteiros','horto_quadras','horto_itens'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "autorizados leem" on public.%I for select to authenticated using (public.is_autorizado())', t);
    execute format('create policy "coletores inserem" on public.%I for insert to authenticated with check (public.pode_coletar())', t);
    execute format('create policy "edita tudo ou o proprio (upd)" on public.%I for update to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> ''email''))) with check (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> ''email'')))', t);
    execute format('create policy "edita tudo ou o proprio (del)" on public.%I for delete to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> ''email'')))', t);
  end loop;
end $$;

-- 6) Catálogo: liberar o COLETOR a cadastrar espécie nova ---------
--    (antes só editor/admin escreviam). Editar/excluir segue editor/admin.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='especies_catalogo' loop
    execute format('drop policy %I on public.especies_catalogo', p.policyname);
  end loop;
  alter table public.especies_catalogo enable row level security;
  create policy "autorizados leem" on public.especies_catalogo for select to authenticated using (public.is_autorizado());
  create policy "coletores inserem" on public.especies_catalogo for insert to authenticated with check (public.pode_coletar());
  create policy "editores alteram"  on public.especies_catalogo for update to authenticated using (public.pode_editar_tudo()) with check (public.pode_editar_tudo());
  create policy "editores excluem"  on public.especies_catalogo for delete to authenticated using (public.pode_editar_tudo());
end $$;
