-- =====================================================================
-- Na.Nu · Fase 2 · Tarefas recorrentes automáticas
-- Ao concluir uma tarefa raiz com `recurrence` definido
-- ({"freq":"daily"|"weekly"|"monthly"}), o banco cria automaticamente a
-- próxima ocorrência com datas deslocadas, mantendo equipe e checklist.
-- =====================================================================

alter table public.tasks
  add column if not exists recurrence_source_id uuid references public.tasks(id) on delete set null;

create index if not exists tasks_recurrence_source_idx
  on public.tasks (recurrence_source_id)
  where recurrence_source_id is not null;

create or replace function public.generate_next_recurring_task() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_freq   text;
  v_step   interval;
  v_status uuid;
  v_next   uuid;
  v_start  date;
  v_due    date;
begin
  -- dispara apenas na transição de aberta -> concluída em tarefa raiz recorrente
  if new.done_at is null or old.done_at is not null then return null; end if;
  if new.parent_id is not null or new.recurrence is null then return null; end if;

  v_freq := new.recurrence->>'freq';
  if v_freq not in ('daily', 'weekly', 'monthly') then return null; end if;

  -- idempotente: se a próxima ocorrência já foi criada (ex.: reaberta e concluída), não duplica
  if exists (select 1 from public.tasks where recurrence_source_id = new.id) then
    return null;
  end if;

  v_step := case v_freq
    when 'daily'   then interval '1 day'
    when 'weekly'  then interval '7 days'
    else                interval '1 month'
  end;

  v_start := case when new.start_date is not null then (new.start_date + v_step)::date else current_date end;
  v_due   := case when new.due_date   is not null then (new.due_date   + v_step)::date else null end;

  select id into v_status
    from public.options
   where set_key = 'task_status' and not is_final and active
   order by sort
   limit 1;

  insert into public.tasks (
    project_id, client_id, title, description, owner_id, status_id, priority,
    start_date, due_date, effort_hours, recurrence, recurrence_source_id, created_by
  )
  values (
    new.project_id, new.client_id, new.title, new.description, new.owner_id, v_status, new.priority,
    v_start, v_due, new.effort_hours, new.recurrence, new.id, coalesce(auth.uid(), new.created_by)
  )
  returning id into v_next;

  insert into public.task_collaborators (task_id, profile_id)
  select v_next, profile_id
    from public.task_collaborators
   where task_id = new.id
  on conflict do nothing;

  insert into public.task_checklist (task_id, title, done, sort)
  select v_next, title, false, sort
    from public.task_checklist
   where task_id = new.id;

  return null;
end $$;

drop trigger if exists tasks_recurrence_next on public.tasks;
create trigger tasks_recurrence_next after update on public.tasks
for each row execute function public.generate_next_recurring_task();

revoke execute on function public.generate_next_recurring_task() from public, anon, authenticated;
