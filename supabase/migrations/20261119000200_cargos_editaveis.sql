-- =====================================================================
-- Na.Nu · Cargos editáveis pelo administrador
-- O administrador cria, renomeia e exclui cargos pela tela de Permissões.
-- Cargo novo nasce sem nenhuma permissão: o admin define depois.
-- =====================================================================

create policy "admin cria cargos" on public.roles for insert to authenticated
  with check (public.is_admin());
create policy "admin altera cargos" on public.roles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin exclui cargos" on public.roles for delete to authenticated
  using (public.is_admin() and key <> 'ceo');

-- Cargo novo: cria a linha "sem acesso" para cada módulo.
create or replace function public.seed_role_permissions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into role_permissions (role, module, scope, can_write, can_delete)
  select new.key, m.key, 'none', false, false from modules m
  on conflict do nothing;
  return new;
end $$;
create trigger roles_seed_permissions after insert on public.roles
for each row execute function public.seed_role_permissions();

-- Não deixa excluir um cargo que ainda está em uso por alguém.
create or replace function public.guard_role_delete() returns trigger
language plpgsql as $$
begin
  if old.key = 'ceo' then raise exception 'O cargo de administrador não pode ser excluído'; end if;
  if exists (select 1 from profiles where role = old.key) then
    raise exception 'Este cargo ainda está atribuído a pessoas da equipe. Troque o cargo delas antes de excluir';
  end if;
  return old;
end $$;
create trigger roles_guard_delete before delete on public.roles
for each row execute function public.guard_role_delete();

create trigger roles_audit after insert or update or delete on public.roles
for each row execute function public.audit();
