-- =====================================================================
-- Na.Nu · Correções Adicionais de RLS e Integridade (Fase 2)
-- 1. Proteção de ciclo de vida de contratos (INSERT, transições de status e campos financeiros)
-- 2. Prevenção de auto-lockout do administrador (role=null, perda de permissões em configurações)
-- 3. Fechamento de privilégios de execução de rotinas públicas para public e anon
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ciclo de Vida e Integridade de Contratos
-- ---------------------------------------------------------------------
create or replace function public.guard_contract_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- 1. No INSERT: todo contrato DEVE obrigatoriamente iniciar como 'rascunho'
  if tg_op = 'INSERT' then
    if new.status is distinct from 'rascunho' then
      raise exception 'Novos contratos devem ser criados obrigatoriamente em rascunho';
    end if;
    return new;
  end if;

  -- No UPDATE:
  -- 2. Bloqueia voltar de ativo/cancelado/encerrado para rascunho
  if old.status <> 'rascunho' and new.status = 'rascunho' then
    raise exception 'Contratos ativos ou finalizados não podem voltar para rascunho';
  end if;

  -- 3. Bloqueia reativação direta de contratos cancelados ou encerrados
  if old.status in ('cancelado', 'encerrado') and new.status = 'ativo' then
    raise exception 'Contratos cancelados ou encerrados não podem ser reativados diretamente';
  end if;

  -- 4. Transição para 'ativo' (só permitida via activate_contract() e com permissão financeira)
  if old.status is distinct from 'ativo' and new.status = 'ativo' then
    if coalesce(nullif(current_setting('app.activating_contract', true), ''), 'off') <> 'on'
       or not (public.can_write('contratos') and public.can_write('financeiro')) then
      raise exception 'Contratos só podem ser ativados através da função oficial de ativação com permissão financeira';
    end if;
  end if;

  -- 5. Cancelar ou encerrar contrato ativo exige permissão de Financeiro
  if old.status = 'ativo' and new.status in ('cancelado', 'encerrado') then
    if not public.can_write('financeiro') then
      raise exception 'Apenas usuários com permissão no módulo Financeiro podem cancelar ou encerrar contratos ativos';
    end if;
  end if;

  -- 6. Alterar termos financeiros de contrato ativo exige permissão de Financeiro
  if old.status = 'ativo' then
    if (new.due_day is distinct from old.due_day
        or new.payment_method is distinct from old.payment_method
        or new.notice_days is distinct from old.notice_days
        or new.min_months is distinct from old.min_months
        or new.start_date is distinct from old.start_date
        or new.end_date is distinct from old.end_date) then
      if not public.can_write('financeiro') then
        raise exception 'Apenas usuários com permissão no módulo Financeiro podem alterar condições financeiras de contratos ativos';
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists contracts_guard_status on public.contracts;
create trigger contracts_guard_status before insert or update on public.contracts
for each row execute function public.guard_contract_status();

-- ---------------------------------------------------------------------
-- 2. Proteção contra lockout do administrador (Profiles & Permissões)
-- ---------------------------------------------------------------------
-- Trata explicitamente o caso de new.role ser NULL (new.role is distinct from 'ceo')
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.active is distinct from old.active
          or new.weekly_capacity_hours is distinct from old.weekly_capacity_hours) then
    raise exception 'Apenas administradores alteram cargo, status ou capacidade';
  end if;

  if (old.role = 'ceo' and (new.role is distinct from 'ceo' or not coalesce(new.active, false))) then
    if (select count(*) from public.profiles where role = 'ceo' and active and id <> old.id) = 0 then
      raise exception 'Não é permitido desativar ou remover o cargo do único administrador ativo';
    end if;
  end if;

  return new;
end $$;

-- Impede que as permissões totais do cargo 'ceo' sobre 'configuracoes' sejam revogadas ou excluídas
create or replace function public.guard_role_permissions() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (tg_op = 'DELETE' and old.role = 'ceo' and old.module = 'configuracoes') then
    raise exception 'As permissões totais de configurações do cargo ceo não podem ser excluídas';
  end if;

  if (tg_op = 'UPDATE' and old.role = 'ceo' and old.module = 'configuracoes') then
    if new.scope <> 'all' or not new.can_write or not new.can_delete then
      raise exception 'As permissões totais de configurações do cargo ceo não podem ser revogadas';
    end if;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists role_permissions_guard on public.role_permissions;
create trigger role_permissions_guard before update or delete on public.role_permissions
for each row execute function public.guard_role_permissions();

-- Impede override de permissões de usuário que retire configurações do único CEO ativo
create or replace function public.guard_user_permissions() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (tg_op in ('INSERT', 'UPDATE') and new.module = 'configuracoes' and (new.scope <> 'all' or not new.can_write)) then
    if exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'ceo') then
      if (select count(*) from public.profiles where role = 'ceo' and active and id <> new.user_id) = 0 then
        raise exception 'Não é permitido restringir o acesso a configurações do único administrador ativo';
      end if;
    end if;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists user_permissions_guard on public.user_permissions;
create trigger user_permissions_guard before insert or update on public.user_permissions
for each row execute function public.guard_user_permissions();

-- ---------------------------------------------------------------------
-- 3. Revogação de EXECUTE em rotinas para public e anon
-- ---------------------------------------------------------------------
-- No Postgres, o papel PUBLIC recebe EXECUTE por padrão em todas as funções criadas.
-- Revogamos explicitamente de public e anon e liberamos para authenticated.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated;
