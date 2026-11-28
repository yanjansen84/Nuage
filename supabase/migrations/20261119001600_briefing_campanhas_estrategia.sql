-- =====================================================================
-- Na.Nu · Fase 2 · Briefing do cliente, Campanhas e Estratégia
-- 1. client_briefings: briefing estruturado por cliente (módulo clientes).
-- 2. campaigns + campaign_budgets: campanhas por cliente com orçamento
--    financeiro isolado em tabela própria (módulo financeiro).
-- 3. strategies: módulo Estratégia (escopo own/all, comentários e aviso).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Briefing do cliente
-- ---------------------------------------------------------------------
create table public.client_briefings (
  client_id        uuid primary key references public.clients(id) on delete cascade,
  audience         text,
  tone_of_voice    text,
  differentials    text,
  competitors      text,
  references_links text,
  restrictions     text,
  notes            text,
  updated_by       uuid references public.profiles(id) default auth.uid(),
  updated_at       timestamptz not null default now()
);

create trigger client_briefings_touch before update on public.client_briefings
for each row execute function public.touch_updated_at();
create trigger client_briefings_audit after insert or update or delete on public.client_briefings
for each row execute function public.audit();

alter table public.client_briefings enable row level security;
create policy "ler briefings" on public.client_briefings for select to authenticated
  using (public.can_read('clientes'));
create policy "alterar briefings" on public.client_briefings for insert to authenticated
  with check (public.can_write('clientes'));
create policy "editar briefings" on public.client_briefings for update to authenticated
  using (public.can_write('clientes')) with check (public.can_write('clientes'));
create policy "excluir briefings" on public.client_briefings for delete to authenticated
  using (public.can_delete('clientes'));

revoke all on public.client_briefings from anon;
grant select, insert, update, delete on public.client_briefings to authenticated;
grant all on public.client_briefings to service_role;

-- ---------------------------------------------------------------------
-- 2. Campanhas (orçamento isolado para o módulo Financeiro)
-- ---------------------------------------------------------------------
insert into public.options (set_key, label, color, sort, is_final) values
  ('campaign_status', 'Planejada',  '#2f80ed', 1, false),
  ('campaign_status', 'Ativa',      '#2e9e6a', 2, false),
  ('campaign_status', 'Pausada',    '#b97d00', 3, false),
  ('campaign_status', 'Encerrada',  '#55555f', 4, true)
on conflict (set_key, label) do nothing;

create table public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  channel    text,
  objective  text,
  status_id  uuid references public.options(id),
  start_date date,
  end_date   date,
  owner_id   uuid references public.profiles(id),
  links      text,
  notes      text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_client_idx on public.campaigns (client_id);

create table public.campaign_budgets (
  campaign_id    uuid primary key references public.campaigns(id) on delete cascade,
  monthly_budget numeric(12,2) check (monthly_budget >= 0),
  spent_amount   numeric(12,2) check (spent_amount >= 0),
  updated_at     timestamptz not null default now()
);

create trigger campaigns_touch before update on public.campaigns
for each row execute function public.touch_updated_at();
create trigger campaigns_audit after insert or update or delete on public.campaigns
for each row execute function public.audit();

create trigger campaign_budgets_touch before update on public.campaign_budgets
for each row execute function public.touch_updated_at();
create trigger campaign_budgets_audit after insert or update or delete on public.campaign_budgets
for each row execute function public.audit();

alter table public.campaigns enable row level security;
alter table public.campaign_budgets enable row level security;

create policy "ler campanhas" on public.campaigns for select to authenticated
  using (public.can_read('clientes'));
create policy "criar campanhas" on public.campaigns for insert to authenticated
  with check (public.can_write('clientes'));
create policy "editar campanhas" on public.campaigns for update to authenticated
  using (public.can_write('clientes')) with check (public.can_write('clientes'));
create policy "excluir campanhas" on public.campaigns for delete to authenticated
  using (public.can_delete('clientes'));

create policy "financeiro lê verba de campanha" on public.campaign_budgets for select to authenticated
  using (public.can_read('financeiro') and public.can_read('clientes'));
create policy "financeiro altera verba de campanha" on public.campaign_budgets for all to authenticated
  using (public.can_write('financeiro') and public.can_write('clientes'))
  with check (public.can_write('financeiro') and public.can_write('clientes'));

revoke all on public.campaigns, public.campaign_budgets from anon;
grant select, insert, update, delete on public.campaigns, public.campaign_budgets to authenticated;
grant all on public.campaigns, public.campaign_budgets to service_role;

-- ---------------------------------------------------------------------
-- 3. Módulo Estratégia
-- ---------------------------------------------------------------------
create table public.strategies (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients(id) on delete set null,
  title       text not null check (char_length(title) between 1 and 200),
  status      text not null default 'rascunho' check (status in ('rascunho','ativo','arquivado')),
  start_date  date,
  end_date    date,
  positioning text,
  personas    text,
  pillars     text[] not null default '{}',
  channels    text,
  goals       text,
  kpis        text,
  notes       text,
  owner_id    uuid references public.profiles(id),
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index strategies_client_idx on public.strategies (client_id);

create or replace function public.is_strategy_mine(s public.strategies) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select s.owner_id = auth.uid() or s.created_by = auth.uid()
$$;
revoke execute on function public.is_strategy_mine(public.strategies) from public, anon;

create trigger strategies_touch before update on public.strategies
for each row execute function public.touch_updated_at();
create trigger strategies_audit after insert or update or delete on public.strategies
for each row execute function public.audit();

create or replace function public.notify_strategy() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    perform notify(
      new.owner_id,
      'strategy_assigned',
      public.actor_name() || ' deixou uma estratégia com você',
      new.title,
      '/estrategia?estrategia=' || new.id,
      'strategy_assigned:' || new.id || ':' || new.owner_id,
      'estrategia'
    );
  end if;
  return null;
end $$;
create trigger strategies_notify after insert or update of owner_id on public.strategies
for each row execute function public.notify_strategy();
revoke execute on function public.notify_strategy() from public, anon, authenticated;

alter table public.strategies enable row level security;
create policy "ler estratégias" on public.strategies for select to authenticated
  using (public.can_read_all('estrategia') or (public.can_read('estrategia') and public.is_strategy_mine(strategies)));
create policy "criar estratégias" on public.strategies for insert to authenticated
  with check (public.can_write_all('estrategia') or (public.can_write('estrategia') and coalesce(owner_id, auth.uid()) = auth.uid()));
create policy "editar estratégias" on public.strategies for update to authenticated
  using (public.can_write_all('estrategia') or (public.can_write('estrategia') and public.is_strategy_mine(strategies)))
  with check (public.can_write('estrategia'));
create policy "excluir estratégias" on public.strategies for delete to authenticated
  using (public.can_delete('estrategia') and (public.can_read_all('estrategia') or created_by = auth.uid()));

revoke all on public.strategies from anon;
grant select, insert, update, delete on public.strategies to authenticated;
grant all on public.strategies to service_role;

-- Comentários e notificações também em estratégias
alter table public.comments drop constraint if exists comments_entity_check;
alter table public.comments add constraint comments_entity_check
  check (entity in ('task','project','lead','client','content','strategy'));

drop policy if exists "ler comentários" on public.comments;
create policy "ler comentários" on public.comments for select to authenticated using (
  case entity
    when 'task'     then exists (select 1 from public.tasks      x where x.id = entity_id)
    when 'project'  then exists (select 1 from public.projects   x where x.id = entity_id)
    when 'lead'     then exists (select 1 from public.leads      x where x.id = entity_id)
    when 'client'   then exists (select 1 from public.clients    x where x.id = entity_id)
    when 'content'  then exists (select 1 from public.contents   x where x.id = entity_id)
    when 'strategy' then exists (select 1 from public.strategies x where x.id = entity_id)
  end
);

drop policy if exists "comentar" on public.comments;
create policy "comentar" on public.comments for insert to authenticated with check (
  author_id = auth.uid()
  and public.is_active_user()
  and (
    case entity
      when 'task'     then exists (select 1 from public.tasks      x where x.id = entity_id)
      when 'project'  then exists (select 1 from public.projects   x where x.id = entity_id)
      when 'lead'     then exists (select 1 from public.leads      x where x.id = entity_id)
      when 'client'   then exists (select 1 from public.clients    x where x.id = entity_id)
      when 'content'  then exists (select 1 from public.contents   x where x.id = entity_id)
      when 'strategy' then exists (select 1 from public.strategies x where x.id = entity_id)
    end
  )
);

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_title text; v_link text; v_module text;
  v_people uuid[] := '{}';
  v_body text := public.actor_name() || ': ' || left(regexp_replace(new.body, '\s+', ' ', 'g'), 160);
  p uuid;
begin
  case new.entity
    when 'task' then
      select t.title, array_remove(array[t.owner_id, t.created_by], null) || coalesce(array_agg(c.profile_id) filter (where c.profile_id is not null), '{}')
        into v_title, v_people
        from tasks t left join task_collaborators c on c.task_id = t.id where t.id = new.entity_id group by t.id;
      v_link := '/projetos?tarefa=' || new.entity_id; v_module := 'projetos';
    when 'project' then
      select pr.name, array_remove(array[pr.owner_id, pr.created_by], null) || coalesce(array_agg(m.profile_id) filter (where m.profile_id is not null), '{}')
        into v_title, v_people
        from projects pr left join project_members m on m.project_id = pr.id where pr.id = new.entity_id group by pr.id;
      v_link := '/projetos?aba=projetos&projeto=' || new.entity_id; v_module := 'projetos';
    when 'lead' then
      select name, array_remove(array[owner_id, created_by], null) into v_title, v_people from leads where id = new.entity_id;
      v_link := '/comercial?lead=' || new.entity_id; v_module := 'crm';
    when 'client' then
      select name, array_remove(array[created_by], null) into v_title, v_people from clients where id = new.entity_id;
      v_link := '/clientes/' || new.entity_id; v_module := 'clientes';
    when 'content' then
      select title, array_remove(array[owner_id, reviewer_id, created_by], null) into v_title, v_people from contents where id = new.entity_id;
      v_link := '/conteudo?conteudo=' || new.entity_id; v_module := 'producao';
    when 'strategy' then
      select title, array_remove(array[owner_id, created_by], null) into v_title, v_people from strategies where id = new.entity_id;
      v_link := '/estrategia?estrategia=' || new.entity_id; v_module := 'estrategia';
    else return null;
  end case;

  foreach p in array coalesce((select array_agg(distinct x) from unnest(v_people) x), '{}'::uuid[]) loop
    perform notify(p, 'comment', 'Novo comentário em ' || coalesce(v_title, 'um registro'), v_body, v_link,
      'comment:' || new.id || ':' || p, v_module);
  end loop;
  return null;
end $$;
