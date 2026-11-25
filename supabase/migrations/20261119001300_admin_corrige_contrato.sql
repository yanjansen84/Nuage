-- =====================================================================
-- Na.Nu · Administrador pode corrigir contrato firmado
-- Depois de ativado, o contrato fica protegido (cliente, lead, itens e
-- condições). Quando algo foi lançado errado, o administrador do sistema
-- (acesso total a Configurações, is_admin) pode corrigir:
--   · cliente e lead do contrato;
--   · condições comerciais (mesmo sem permissão no Financeiro);
--   · serviços/valores (contract_items), que antes só mudavam em rascunho.
-- Continua valendo para todos, inclusive o administrador:
--   · data e autor da ativação só são gravados por activate_contract();
--   · as regras de transição de status (não volta a rascunho etc.).
-- Toda correção fica registrada na auditoria (triggers audit existentes).
-- =====================================================================

create or replace function public.guard_contract_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_activating boolean := coalesce(nullif(current_setting('app.activating_contract', true), ''), 'off') = 'on';
  v_admin boolean := public.is_admin();
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'rascunho' then
      raise exception 'Novos contratos devem ser criados obrigatoriamente em rascunho';
    end if;
    if new.activated_at is not null or new.activated_by is not null then
      raise exception 'Dados de ativação são definidos apenas pela função oficial de ativação';
    end if;
    return new;
  end if;

  -- dados de ativação: só activate_contract() altera (nem o administrador)
  if (new.activated_at is distinct from old.activated_at or new.activated_by is distinct from old.activated_by)
     and not v_activating then
    raise exception 'Dados de ativação são definidos apenas pela função oficial de ativação';
  end if;

  -- transições de status
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

  -- cliente/lead de contrato firmado: só o administrador corrige
  if old.status <> 'rascunho' and not v_admin
     and (new.client_id is distinct from old.client_id or new.lead_id is distinct from old.lead_id) then
    raise exception 'Cliente e lead de um contrato firmado só podem ser corrigidos pelo administrador';
  end if;

  -- condições comerciais de contrato firmado: Financeiro ou administrador
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
     and not (public.can_write('financeiro') or v_admin) then
    raise exception 'Apenas usuários com permissão no módulo Financeiro (ou o administrador) podem alterar condições de contratos firmados';
  end if;

  return new;
end $$;

-- Itens: em rascunho, quem tem Contratos + Financeiro; fora do rascunho, só o administrador.
drop policy if exists "alterar itens de contrato" on public.contract_items;
create policy "alterar itens de contrato" on public.contract_items for all to authenticated
  using (
    public.is_admin()
    or (public.can_write('contratos') and public.can_write('financeiro')
        and exists (select 1 from public.contracts c where c.id = contract_id and c.status = 'rascunho'))
  )
  with check (
    public.is_admin()
    or (public.can_write('contratos') and public.can_write('financeiro')
        and exists (select 1 from public.contracts c where c.id = contract_id and c.status = 'rascunho'))
  );

revoke execute on function public.guard_contract_status() from public, anon, authenticated;
