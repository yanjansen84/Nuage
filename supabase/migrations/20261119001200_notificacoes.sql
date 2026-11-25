-- =====================================================================
-- Na.Nu · Sistema de notificações
-- As notificações nascem no BANCO (triggers e uma rotina de lembretes),
-- nunca no navegador: ninguém consegue criar aviso falso para outra pessoa.
--
--  · Eventos (na hora): tarefa atribuída/concluída, inclusão em tarefa ou
--    projeto, conteúdo atribuído / para revisão / mudança de status, lead
--    atribuído, compromisso na agenda, comentário.
--  · Lembretes (generate_my_notifications, chamada pelo app ao abrir e a
--    cada poucos minutos): tarefa vence hoje/amanhã/atrasada, publicação do
--    dia, retorno de lead, recebimentos atrasados e contas a pagar vencendo.
--
-- Regras de entrega (função notify):
--  · não avisa a pessoa sobre o que ela mesma fez;
--  · só avisa usuário ativo que tem acesso ao módulo do assunto (o título
--    não pode vazar algo que a pessoa não poderia ver);
--  · `source` identifica o evento: o mesmo aviso nunca é criado duas vezes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela: integridade e acesso
-- ---------------------------------------------------------------------
-- links sempre internos ("/projetos?..."), nunca para fora do sistema
alter table public.notifications
  add constraint notifications_link_interno check (link is null or link ~ '^/([^/]|$)');
alter table public.notifications
  add constraint notifications_tamanhos check (char_length(title) <= 200 and char_length(coalesce(body, '')) <= 400);
create unique index notifications_dedupe on public.notifications (user_id, source) where source is not null;
create index notifications_user_recent on public.notifications (user_id, created_at desc);

create policy "dispensar minhas notificações" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- O usuário só lê, marca como lida (apenas a coluna read_at) e dispensa as próprias.
revoke all on public.notifications from anon;
revoke insert, update, truncate, references, trigger on public.notifications from authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- ---------------------------------------------------------------------
-- 2. Núcleo
-- ---------------------------------------------------------------------
-- A pessoa (ativa) consegue ver o módulo? Mesma regra de eff_perm, para outro usuário.
create or replace function public.user_can_read(p_user uuid, p_module text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select coalesce(up.scope, rp.scope, 'none') in ('own', 'all')
    from profiles p
    left join role_permissions rp on rp.role = p.role and rp.module = p_module
    left join user_permissions up on up.user_id = p.id and up.module = p_module
    where p.id = p_user and p.active
  ), false)
$$;

create or replace function public.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_source text,
  p_module text default null, p_allow_self boolean default false
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user is null then return; end if;
  if not p_allow_self and p_user = auth.uid() then return; end if;
  if not exists (select 1 from profiles where id = p_user and active) then return; end if;
  if p_module is not null and not public.user_can_read(p_user, p_module) then return; end if;
  insert into notifications (user_id, kind, title, body, link, source)
  values (p_user, p_kind, left(p_title, 200), left(p_body, 400), p_link, p_source)
  on conflict (user_id, source) where source is not null do nothing;
end $$;

-- nome de quem fez a ação (para "Ana comentou...")
create or replace function public.actor_name() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select split_part(name, ' ', 1) from profiles where id = auth.uid()), 'Alguém')
$$;

-- ---------------------------------------------------------------------
-- 3. Eventos
-- ---------------------------------------------------------------------
create or replace function public.notify_task() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_link text := '/projetos?tarefa=' || new.id;
begin
  -- a ativação de contrato cria várias tarefas de uma vez: avisa só pelo projeto
  if coalesce(current_setting('app.activating_contract', true), '') = 'on' then return null; end if;

  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    perform notify(new.owner_id, 'task_assigned', public.actor_name() || ' atribuiu uma tarefa a você',
      new.title || coalesce(' · vence ' || to_char(new.due_date, 'DD/MM'), ''), v_link,
      'task_assigned:' || new.id || ':' || new.owner_id, 'projetos');
  end if;

  if tg_op = 'UPDATE' and new.done_at is not null and old.done_at is null and new.created_by is not null then
    perform notify(new.created_by, 'task_done', public.actor_name() || ' concluiu uma tarefa', new.title, v_link,
      'task_done:' || new.id || ':' || to_char(new.done_at, 'YYYYMMDDHH24MISS'), 'projetos');
  end if;
  return null;
end $$;
create trigger tasks_notify after insert or update on public.tasks
for each row execute function public.notify_task();

create or replace function public.notify_task_collaborator() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_title text;
begin
  select title into v_title from tasks where id = new.task_id;
  perform notify(new.profile_id, 'task_shared', public.actor_name() || ' incluiu você em uma tarefa', v_title,
    '/projetos?tarefa=' || new.task_id, 'task_shared:' || new.task_id || ':' || new.profile_id, 'projetos');
  return null;
end $$;
create trigger task_collaborators_notify after insert on public.task_collaborators
for each row execute function public.notify_task_collaborator();

create or replace function public.notify_project() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    select count(*) into v_n from tasks where project_id = new.id;
    perform notify(new.owner_id, 'project_assigned',
      case when coalesce(current_setting('app.activating_contract', true), '') = 'on'
           then 'Novo onboarding sob sua responsabilidade' else public.actor_name() || ' deixou um projeto com você' end,
      new.name, '/projetos?aba=projetos&projeto=' || new.id, 'project_assigned:' || new.id || ':' || new.owner_id, 'projetos');
  end if;
  return null;
end $$;
create trigger projects_notify after insert or update of owner_id on public.projects
for each row execute function public.notify_project();

create or replace function public.notify_project_member() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  select name into v_name from projects where id = new.project_id;
  perform notify(new.profile_id, 'project_member', public.actor_name() || ' incluiu você em um projeto', v_name,
    '/projetos?aba=projetos&projeto=' || new.project_id, 'project_member:' || new.project_id || ':' || new.profile_id, 'projetos');
  return null;
end $$;
create trigger project_members_notify after insert on public.project_members
for each row execute function public.notify_project_member();

create or replace function public.notify_content() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_link text := '/conteudo?conteudo=' || new.id;
  v_status text;
  v_stamp text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS');
begin
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    perform notify(new.owner_id, 'content_assigned', public.actor_name() || ' deixou um conteúdo com você', new.title,
      v_link, 'content_assigned:' || new.id || ':' || new.owner_id, 'producao');
  end if;
  if new.reviewer_id is not null and (tg_op = 'INSERT' or new.reviewer_id is distinct from old.reviewer_id) then
    perform notify(new.reviewer_id, 'content_review', public.actor_name() || ' indicou você para revisar', new.title,
      v_link, 'content_review:' || new.id || ':' || new.reviewer_id, 'producao');
  end if;
  if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id then
    select label into v_status from options where id = new.status_id;
    perform notify(new.owner_id, 'content_status', new.title || ' → ' || coalesce(v_status, 'novo status'),
      'Alterado por ' || public.actor_name(), v_link, 'content_status:' || new.id || ':' || v_stamp, 'producao');
    if new.reviewer_id is distinct from new.owner_id then
      perform notify(new.reviewer_id, 'content_status', new.title || ' → ' || coalesce(v_status, 'novo status'),
        'Alterado por ' || public.actor_name(), v_link, 'content_status:' || new.id || ':' || v_stamp, 'producao');
    end if;
  end if;
  return null;
end $$;
create trigger contents_notify after insert or update of owner_id, reviewer_id, status_id on public.contents
for each row execute function public.notify_content();

create or replace function public.notify_lead() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    perform notify(new.owner_id, 'lead_assigned', public.actor_name() || ' passou um lead para você',
      new.name || coalesce(' · ' || new.company, ''), '/comercial?lead=' || new.id,
      'lead_assigned:' || new.id || ':' || new.owner_id, 'crm');
  end if;
  return null;
end $$;
create trigger leads_notify after insert or update of owner_id on public.leads
for each row execute function public.notify_lead();

create or replace function public.notify_event() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_body text := to_char(new.date, 'DD/MM') || coalesce(' às ' || to_char(new.time, 'HH24:MI'), '');
  r record;
begin
  if new.profile_id is not null then
    perform notify(new.profile_id, 'event', public.actor_name() || ' marcou um compromisso para você: ' || new.title,
      v_body, '/agenda', 'event:' || new.id || ':' || new.profile_id, 'dashboard');
  elsif tg_op = 'INSERT' then
    -- compromisso da agência inteira: todo mundo que vê a agenda
    for r in select id from profiles where active loop
      perform notify(r.id, 'event', 'Compromisso da agência: ' || new.title, v_body, '/agenda',
        'event:' || new.id || ':' || r.id, 'dashboard');
    end loop;
  end if;
  return null;
end $$;
create trigger events_notify after insert or update of profile_id on public.events
for each row execute function public.notify_event();

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
    else return null;
  end case;

  -- (array vazio/nulo no FOREACH é erro e derrubaria o comentário)
  foreach p in array coalesce((select array_agg(distinct x) from unnest(v_people) x), '{}'::uuid[]) loop
    perform notify(p, 'comment', 'Novo comentário em ' || coalesce(v_title, 'um registro'), v_body, v_link,
      'comment:' || new.id || ':' || p, v_module);
  end loop;
  return null;
end $$;
create trigger comments_notify after insert on public.comments
for each row execute function public.notify_comment();

-- ---------------------------------------------------------------------
-- 4. Lembretes (chamada pelo app; idempotente pela chave `source`)
-- ---------------------------------------------------------------------
create or replace function public.generate_my_notifications() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  d date := current_date;
  r record;
  v_count int; v_sum numeric;
  v_before int; v_after int;
begin
  if me is null or not exists (select 1 from profiles where id = me and active) then return 0; end if;
  select count(*) into v_before from notifications where user_id = me;

  -- limpeza: lidas há mais de 60 dias e qualquer uma com mais de 180
  delete from notifications where user_id = me
    and ((read_at is not null and read_at < now() - interval '60 days') or created_at < now() - interval '180 days');

  if public.user_can_read(me, 'projetos') then
    for r in
      select t.id, t.title, t.due_date from tasks t
      where t.done_at is null and t.due_date is not null and t.due_date <= d + 1
        and (t.owner_id = me or exists (select 1 from task_collaborators c where c.task_id = t.id and c.profile_id = me))
    loop
      if r.due_date < d then
        perform notify(me, 'task_late', 'Tarefa atrasada', r.title || ' · venceu ' || to_char(r.due_date, 'DD/MM'),
          '/projetos?tarefa=' || r.id, 'task_late:' || r.id || ':' || r.due_date, null, true);
      elsif r.due_date = d then
        perform notify(me, 'task_due', 'Tarefa vence hoje', r.title, '/projetos?tarefa=' || r.id,
          'task_due:' || r.id || ':' || r.due_date, null, true);
      else
        perform notify(me, 'task_due', 'Tarefa vence amanhã', r.title, '/projetos?tarefa=' || r.id,
          'task_due_soon:' || r.id || ':' || r.due_date, null, true);
      end if;
    end loop;
  end if;

  if public.user_can_read(me, 'producao') then
    for r in
      select c.id, c.title, c.publish_time from contents c
      where c.posted_at is null and c.publish_date = d and (c.owner_id = me or c.reviewer_id = me)
    loop
      perform notify(me, 'content_publish', 'Publicação prevista para hoje',
        r.title || coalesce(' · ' || to_char(r.publish_time, 'HH24:MI'), ''), '/conteudo?conteudo=' || r.id,
        'content_publish:' || r.id || ':' || d, null, true);
    end loop;
  end if;

  if public.user_can_read(me, 'crm') then
    for r in
      select l.id, l.name, l.follow_up, l.next_action from leads l
      join options o on o.id = l.stage_id
      where l.owner_id = me and l.follow_up is not null and l.follow_up <= d and not o.is_final
    loop
      perform notify(me, 'lead_followup', case when r.follow_up < d then 'Retorno de lead atrasado' else 'Retorno de lead hoje' end,
        r.name || coalesce(' · ' || r.next_action, ''), '/comercial?lead=' || r.id,
        'lead_followup:' || r.id || ':' || r.follow_up, null, true);
    end loop;
  end if;

  if public.user_can_read(me, 'financeiro') then
    select count(*), coalesce(sum(amount), 0) into v_count, v_sum from payments
      where status = 'previsto' and due_date < d;
    if v_count > 0 then
      perform notify(me, 'pay_late', v_count || ' recebimento(s) em atraso',
        'Total de R$ ' || to_char(v_sum, 'FM999G999G990D00'), '/financeiro', 'pay_late:' || d, null, true);
    end if;
    select count(*), coalesce(sum(amount), 0) into v_count, v_sum from bills
      where status = 'aberto' and due_date <= d + 3;
    if v_count > 0 then
      perform notify(me, 'bills_due', v_count || ' conta(s) a pagar vencendo ou vencida(s)',
        'Total de R$ ' || to_char(v_sum, 'FM999G999G990D00') || ' até ' || to_char(d + 3, 'DD/MM'),
        '/financeiro?aba=pagar', 'bills_due:' || d, null, true);
    end if;
  end if;

  select count(*) into v_after from notifications where user_id = me;
  return greatest(v_after - v_before, 0);
end $$;

create or replace function public.mark_all_notifications_read() returns void
language sql security invoker set search_path = public, pg_temp as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- ---------------------------------------------------------------------
-- 5. Permissões das funções
-- Funções internas: só triggers/definer chamam. As do app: só usuário logado.
-- ---------------------------------------------------------------------
revoke execute on function public.user_can_read(uuid, text) from public, anon, authenticated;
revoke execute on function public.notify(uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.actor_name() from public, anon, authenticated;
revoke execute on function public.notify_task(), public.notify_task_collaborator(), public.notify_project(),
  public.notify_project_member(), public.notify_content(), public.notify_lead(), public.notify_event(),
  public.notify_comment() from public, anon, authenticated;
revoke execute on function public.generate_my_notifications(), public.mark_all_notifications_read() from public, anon;
grant execute on function public.generate_my_notifications(), public.mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Tempo real: o app recebe a notificação na hora (a RLS também vale aqui)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
