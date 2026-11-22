-- =====================================================================
-- Na.Nu · Correções de RLS e Integridade (rodada 3)
-- 1. Contratos: campos imutáveis após a ativação e termos financeiros
--    completos protegidos (client_id, lead_id, activated_*, parcelas,
--    condições de pagamento, renovação).
-- 2. Garantia de administrador: em vez de contar "CEOs", verifica a
--    permissão EFETIVA (cargo + ajuste por pessoa) depois de cada mudança.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ciclo de vida e integridade de contratos
-- ---------------------------------------------------------------------
create or replace function public.guard_contract_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_activating boolean := coalesce(nullif(current_setting('app.activating_contract', true), ''), 'off') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'rascunho' then
      raise exception 'Novos contratos devem ser criados obrigatoriamente em rascunho';
    end if;
    -- Dados de ativação só são preenchidos por activate_contract()
    if new.activated_at is not null or new.activated_by is not null then
      raise exception 'Dados de ativação são definidos apenas pela função oficial de ativação';
    end if;
    return new;
  end if;

  -- Dados de ativação: só activate_contract() altera
  if (new.activated_at is distinct from old.activated_at or new.activated_by is distinct from old.activated_by)
     and not v_activating then
    raise exception 'Dados de ativação são definidos apenas pela função oficial de ativação';
  end if;

  -- Transições de status
  if old.status <> 'rascunho' and new.status = 'rascunho' then
    raise exception 'Contratos ativos ou finalizados não podem voltar para rascunho';
  end if;

  if old.status in ('cancelado', 'encerrado') and new.status = 'ativo' then
    raise exception 'Contratos cancelados ou encerrados não podem ser reativados diretamente';
  end if;

  if old.status is distinct from 'ativo' and new.status = 'ativo' then
    if not v_activating or not (public.can_write('contratos') and public.can_write('financeiro')) then
      raise exception 'Contratos só podem ser ativados através da função oficial de ativação com permissão financeira';
    end if;
  end if;

  if old.status = 'ativo' and new.status in ('cancelado', 'encerrado') then
    if not public.can_write('financeiro') then
      raise exception 'Apenas usuários com permissão no módulo Financeiro podem cancelar ou encerrar contratos ativos';
    end if;
  end if;

  -- Fora do rascunho, o contrato pertence ao cliente/lead em que foi firmado
  if old.status <> 'rascunho'
     and (new.client_id is distinct from old.client_id or new.lead_id is distinct from old.lead_id) then
    raise exception 'Cliente e lead de um contrato firmado não podem ser alterados';
  end if;

  -- Fora do rascunho, condições comerciais exigem permissão de Financeiro
  if old.status <> 'rascunho'
     and (new.due_day        is distinct from old.due_day
       or new.payment_method is distinct from old.payment_method
       or new.installments   is distinct from old.installments
       or new.payment_terms  is distinct from old.payment_terms
       or new.renewal        is distinct from old.renewal
       or new.notice_days    is distinct from old.notice_days
       or new.min_months     is distinct from old.min_months
       or new.start_date     is distinct from old.start_date
       or new.end_date       is distinct from old.end_date)
     and not public.can_write('financeiro') then
    raise exception 'Apenas usuários com permissão no módulo Financeiro podem alterar condições de contratos firmados';
  end if;

  return new;
end $$;

drop trigger if exists contracts_guard_status on public.contracts;
create trigger contracts_guard_status before insert or update on public.contracts
for each row execute function public.guard_contract_status();

-- ---------------------------------------------------------------------
-- 2. Sempre manter ao menos um administrador efetivo
-- Administrador = usuário ativo com escopo 'all' + escrita em Configurações,
-- considerando o cargo e o ajuste por pessoa (mesma regra de eff_perm/is_admin).
-- Roda DEPOIS de cada comando, olhando o estado final, então cobre qualquer
-- combinação de mudanças (perfil, cargo, permissão do cargo, ajuste pessoal).
-- ---------------------------------------------------------------------
create or replace function public.ensure_admin_exists() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Serializa as verificações: duas transações simultâneas não conseguem
  -- remover, cada uma, um administrador diferente e deixar o sistema sem nenhum.
  perform pg_advisory_xact_lock(hashtext('nanu.ensure_admin_exists'));

  if exists (select 1 from profiles) and not exists (
    select 1
    from profiles p
    left join role_permissions rp on rp.role = p.role and rp.module = 'configuracoes'
    left join user_permissions up on up.user_id = p.id and up.module = 'configuracoes'
    where p.active
      and coalesce(up.scope, rp.scope, 'none') = 'all'
      and coalesce(up.can_write, rp.can_write, false)
  ) then
    raise exception 'O sistema precisa manter ao menos um administrador ativo (acesso total a Configurações)';
  end if;
  return null;
end $$;

drop trigger if exists profiles_ensure_admin on public.profiles;
create trigger profiles_ensure_admin after update on public.profiles
for each statement execute function public.ensure_admin_exists();

drop trigger if exists role_permissions_ensure_admin on public.role_permissions;
create trigger role_permissions_ensure_admin after update or delete on public.role_permissions
for each statement execute function public.ensure_admin_exists();

drop trigger if exists user_permissions_ensure_admin on public.user_permissions;
create trigger user_permissions_ensure_admin after insert or update or delete on public.user_permissions
for each statement execute function public.ensure_admin_exists();

-- As checagens antigas contavam só "outros CEOs" pelo cargo e deixavam
-- passar o caso de 2 CEOs restringidos por user_permissions. A verificação
-- acima as substitui; guard_profile volta a cuidar só de quem pode alterar.
drop trigger if exists user_permissions_guard on public.user_permissions;
drop function if exists public.guard_user_permissions();

create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.active is distinct from old.active
          or new.weekly_capacity_hours is distinct from old.weekly_capacity_hours) then
    raise exception 'Apenas administradores alteram cargo, status ou capacidade';
  end if;
  return new;
end $$;

-- Funções novas: sem EXECUTE para public/anon (trigger functions não são chamadas via API)
revoke execute on function public.ensure_admin_exists() from public, anon;
