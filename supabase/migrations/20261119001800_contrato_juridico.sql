-- =====================================================================
-- Na.Nu · Dados jurídicos de clientes e cláusulas completas de contrato
-- Adapta o cadastro de clientes e contratos para contemplar os modelos
-- oficiais da Nuage (Agência, Social Media e Studio), permitindo gerar
-- PDFs com todas as cláusulas jurídicas e campos dinâmicos.
-- =====================================================================

-- 1. Dados jurídicos do cliente (CONTRATANTE)
alter table public.clients
  add column if not exists legal_name     text,
  add column if not exists document       text,
  add column if not exists address        text,
  add column if not exists legal_rep_name text,
  add column if not exists legal_rep_cpf  text;

-- 2. Campos jurídicos e operacionais do contrato
alter table public.contracts
  add column if not exists templates            text[] not null default array['agencia']::text[],
  add column if not exists platforms            text,
  add column if not exists publisher            text,
  add column if not exists video_quantity       int,
  add column if not exists shooting_location    text,
  add column if not exists first_payment_date   date,
  add column if not exists billing_periodicity  text,
  add column if not exists portfolio_authorized boolean not null default true,
  add column if not exists forum_city           text not null default 'São Luís - MA';

alter table public.contracts drop constraint if exists contracts_notice_days_check;
alter table public.contracts
  add constraint contracts_notice_days_check check (notice_days in (5, 10, 15, 20, 30));

alter table public.contracts drop constraint if exists contracts_templates_check;
alter table public.contracts
  add constraint contracts_templates_check check (cardinality(templates) >= 1 and templates <@ array['agencia', 'social_media', 'studio']::text[]);

alter table public.contracts drop constraint if exists contracts_publisher_check;
alter table public.contracts
  add constraint contracts_publisher_check check (publisher is null or publisher in ('contratada', 'contratante'));

alter table public.contracts drop constraint if exists contracts_video_quantity_check;
alter table public.contracts
  add constraint contracts_video_quantity_check check (video_quantity is null or video_quantity >= 1);

-- 3. Proteger os novos campos em contratos já firmados (Financeiro ou admin)
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

  if (new.activated_at is distinct from old.activated_at or new.activated_by is distinct from old.activated_by)
     and not v_activating then
    raise exception 'Dados de ativação são definidos apenas pela função oficial de ativação';
  end if;

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

  if old.status <> 'rascunho' and not v_admin
     and (new.client_id is distinct from old.client_id or new.lead_id is distinct from old.lead_id) then
    raise exception 'Cliente e lead de um contrato firmado só podem ser corrigidos pelo administrador';
  end if;

  if old.status <> 'rascunho'
     and (new.due_day              is distinct from old.due_day
       or new.payment_method       is distinct from old.payment_method
       or new.installments         is distinct from old.installments
       or new.payment_terms        is distinct from old.payment_terms
       or new.renewal              is distinct from old.renewal
       or new.notice_days          is distinct from old.notice_days
       or new.min_months           is distinct from old.min_months
       or new.start_date           is distinct from old.start_date
       or new.end_date             is distinct from old.end_date
       or new.templates            is distinct from old.templates
       or new.platforms            is distinct from old.platforms
       or new.publisher            is distinct from old.publisher
       or new.video_quantity       is distinct from old.video_quantity
       or new.shooting_location    is distinct from old.shooting_location
       or new.first_payment_date   is distinct from old.first_payment_date
       or new.billing_periodicity  is distinct from old.billing_periodicity
       or new.portfolio_authorized is distinct from old.portfolio_authorized
       or new.forum_city           is distinct from old.forum_city)
     and not (public.can_write('financeiro') or v_admin) then
    raise exception 'Apenas usuários com permissão no módulo Financeiro (ou o administrador) podem alterar condições de contratos firmados';
  end if;

  return new;
end $$;

revoke execute on function public.guard_contract_status() from public, anon, authenticated;
