-- Permissões explícitas no esquema public para os papéis do Supabase (anon e authenticated)
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated, anon;
grant all on all sequences in schema public to authenticated, anon;
grant all on all routines in schema public to authenticated, anon;

alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on sequences to authenticated, anon;
alter default privileges in schema public grant all on routines to authenticated, anon;

-- Garante que qualquer usuário existente em auth.users (criado antes do trigger) tenha seu perfil criado
do $$
declare
  r record;
  v_role text;
begin
  for r in select * from auth.users loop
    if not exists (select 1 from public.profiles where id = r.id) then
      if not exists (select 1 from public.profiles) then
        v_role := 'ceo';
      else
        v_role := r.raw_app_meta_data->>'role';
        if v_role is not null and not exists (select 1 from public.roles where key = v_role) then
          v_role := null;
        end if;
      end if;

      insert into public.profiles (id, name, role, active)
      values (
        r.id,
        coalesce(nullif(r.raw_user_meta_data->>'name',''), split_part(r.email,'@',1)),
        v_role,
        v_role is not null
      ) on conflict (id) do nothing;

      insert into public.profile_details (id, email)
      values (r.id, r.email)
      on conflict (id) do nothing;
    end if;
  end loop;
end $$;
