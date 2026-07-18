-- ================================================================
-- SMMACL Campo — Controle de acesso por e-mail (RLS)
-- Rode este script no Supabase (SQL Editor) para FECHAR o app e o
-- painel a usuários selecionados do Google.
--
-- Papéis:
--   editor = vê e escreve (equipe de campo + gestores)
--   leitor = só vê (painel)
-- Quem não estiver na tabela não vê nem escreve nada.
-- ================================================================

-- 1) Tabela de autorizados -----------------------------------------
create table if not exists usuarios_autorizados (
  email text primary key,
  papel text not null default 'editor' check (papel in ('leitor','editor')),
  criado_em timestamptz default now()
);
alter table usuarios_autorizados enable row level security;

-- cada usuário pode ler a própria linha (o painel usa isso p/ saber o papel)
drop policy if exists "ver o proprio registro" on usuarios_autorizados;
create policy "ver o proprio registro" on usuarios_autorizados
  for select to authenticated
  using (email = (auth.jwt() ->> 'email'));

-- 2) Funções auxiliares (security definer p/ não recursar no RLS) --
create or replace function public.is_autorizado() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from usuarios_autorizados where email = (auth.jwt() ->> 'email')) $$;

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from usuarios_autorizados where email = (auth.jwt() ->> 'email') and papel = 'editor') $$;

-- 3) Aplica nas tabelas de dados -----------------------------------
-- Remove TODAS as policies antigas dessas tabelas e cria:
--   autorizados leem / editores escrevem
do $$
declare t text; p record;
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
    execute format('create policy "editores escrevem" on public.%I for all to authenticated using (public.is_editor()) with check (public.is_editor())', t);
  end loop;
end $$;

-- 4) Storage (fotos): só editores enviam ---------------------------
-- (a leitura das fotos continua pública via URL, pois o bucket é público)
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
create policy "editores enviam fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-campo' and public.is_editor());
create policy "leitura publica fotos" on storage.objects
  for select using (bucket_id = 'fotos-campo');

-- 5) SEUS USUÁRIOS — edite esta lista ------------------------------
insert into usuarios_autorizados (email, papel) values
  ('davimacarini93@gmail.com', 'editor')
  -- ,('colega1@gmail.com', 'editor')
  -- ,('chefe@gmail.com', 'leitor')
on conflict (email) do update set papel = excluded.papel;

-- Conferir:
select * from usuarios_autorizados;
