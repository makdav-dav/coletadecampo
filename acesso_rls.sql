-- ================================================================
-- SMMACL Campo — Controle de acesso por e-mail (RLS) — 4 papéis
-- Rode este script no Supabase (SQL Editor). Pode rodar de novo
-- sem medo: ele recria as policies do zero.
--
-- Papéis:
--   admin   = tudo + gerencia usuários (tela Usuários do painel)
--   editor  = vê tudo, edita/exclui qualquer registro
--   coletor = vê tudo, ADICIONA pontos/fotos; edita/exclui só o que
--             ele mesmo criou (campo criado_por)
--   leitor  = só visualiza
-- Quem não estiver na tabela não vê nem escreve nada.
-- ================================================================

-- 1) Tabela de autorizados -----------------------------------------
create table if not exists usuarios_autorizados (
  email text primary key,
  papel text not null default 'coletor',
  criado_em timestamptz default now()
);
-- aceita os 4 papéis (recria a constraint se vier da versão antiga)
alter table usuarios_autorizados drop constraint if exists usuarios_autorizados_papel_check;
alter table usuarios_autorizados
  add constraint usuarios_autorizados_papel_check
  check (papel in ('admin','editor','coletor','leitor'));
alter table usuarios_autorizados enable row level security;

-- 2) Funções auxiliares (security definer p/ não recursar no RLS) --
create or replace function public.papel_atual() returns text
language sql stable security definer set search_path = public as
$$ select papel from usuarios_autorizados where email = (auth.jwt() ->> 'email') $$;

create or replace function public.is_autorizado() returns boolean
language sql stable security definer set search_path = public as
$$ select public.papel_atual() is not null $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select public.papel_atual() = 'admin' $$;

create or replace function public.pode_editar_tudo() returns boolean
language sql stable security definer set search_path = public as
$$ select public.papel_atual() in ('admin','editor') $$;

create or replace function public.pode_coletar() returns boolean
language sql stable security definer set search_path = public as
$$ select public.papel_atual() in ('admin','editor','coletor') $$;

-- 3) Policies da própria tabela de usuários ------------------------
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'usuarios_autorizados' loop
    execute format('drop policy %I on usuarios_autorizados', p.policyname);
  end loop;
end $$;
create policy "ver o proprio registro" on usuarios_autorizados
  for select to authenticated using (email = (auth.jwt() ->> 'email'));
create policy "admin ve todos" on usuarios_autorizados
  for select to authenticated using (public.is_admin());
create policy "admin gerencia" on usuarios_autorizados
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4) Policies das tabelas de dados ---------------------------------
-- select: qualquer autorizado · insert: coletor+ ·
-- update/delete: editor/admin OU coletor no próprio registro
do $$
declare t text; p record; tem_criado_por boolean;
begin
  foreach t in array array['arbo_ruas','arbo_trechos','arbo_pontos',
                           'jard_espacos','jard_canteiros','jard_especies',
                           'fotos','especies_catalogo'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "autorizados leem" on public.%I for select to authenticated using (public.is_autorizado())', t);

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'criado_por'
    ) into tem_criado_por;

    if t = 'especies_catalogo' then
      -- catálogo: só editor/admin mexem
      execute format('create policy "editores escrevem" on public.%I for all to authenticated using (public.pode_editar_tudo()) with check (public.pode_editar_tudo())', t);
    elsif tem_criado_por then
      execute format('create policy "coletores inserem" on public.%I for insert to authenticated with check (public.pode_coletar())', t);
      execute format('create policy "edita tudo ou o proprio (upd)" on public.%I for update to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> ''email''))) with check (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> ''email'')))', t);
      execute format('create policy "edita tudo ou o proprio (del)" on public.%I for delete to authenticated using (public.pode_editar_tudo() or (public.pode_coletar() and criado_por = (auth.jwt() ->> ''email'')))', t);
    else
      -- tabela sem criado_por (ex.: jard_especies): coletor+ insere,
      -- editor/admin altera/exclui
      execute format('create policy "coletores inserem" on public.%I for insert to authenticated with check (public.pode_coletar())', t);
      execute format('create policy "editores alteram" on public.%I for update to authenticated using (public.pode_editar_tudo()) with check (public.pode_editar_tudo())', t);
      execute format('create policy "editores excluem" on public.%I for delete to authenticated using (public.pode_editar_tudo())', t);
    end if;
  end loop;
end $$;

-- 5) Storage (fotos): coletor+ envia; leitura pública ---------------
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
create policy "coletores enviam fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-campo' and public.pode_coletar());
create policy "leitura publica fotos" on storage.objects
  for select using (bucket_id = 'fotos-campo');

-- 6) SEU ACESSO DE ADMIN (edite se quiser adicionar mais gente já) --
insert into usuarios_autorizados (email, papel) values
  ('davimacarini93@gmail.com', 'admin')
on conflict (email) do update set papel = excluded.papel;

-- Conferir:
select * from usuarios_autorizados order by papel, email;
