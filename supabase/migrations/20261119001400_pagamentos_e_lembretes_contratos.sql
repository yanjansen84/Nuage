-- =====================================================================
-- Na.Nu · Integridade de recebimentos e lembretes de contratos
-- 1. payments: mesma regra de contas a pagar — pagamento marcado como
--    "pago" sempre exige data de pagamento (paid_at), e os demais não têm.
-- 2. generate_my_notifications: avisa quem lê Contratos quando um contrato
--    ativo está perto do fim do prazo mínimo (ou da data de aviso prévio).
-- =====================================================================

-- 1. Integridade de payments
update public.payments
   set paid_at = coalesce(paid_at, due_date, current_date)
 where status = 'pago' and paid_at is null;

update public.payments
   set paid_at = null
 where status <> 'pago' and paid_at is not null;

alter table public.payments
  drop constraint if exists payments_paid_at_check;

alter table public.payments
  add constraint payments_paid_at_check check ((status = 'pago') = (paid_at is not null));

-- 2. Lembretes: inclui fim do prazo mínimo / aviso prévio de contratos ativos
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

  if public.user_can_read(me, 'contratos') then
    for r in
      select k.id, cl.name as client_name,
             (k.start_date + make_interval(months => k.min_months))::date as min_end,
             k.notice_days, k.renewal
      from contracts k
      join clients cl on cl.id = k.client_id
      where k.status = 'ativo'
        and k.start_date is not null
        and k.min_months is not null
        and (k.start_date + make_interval(months => k.min_months))::date >= d - 30
        and (
          (k.start_date + make_interval(months => k.min_months))::date <= d + 30
          or ((k.start_date + make_interval(months => k.min_months))::date - coalesce(k.notice_days, 0)) <= d + 15
        )
    loop
      perform notify(
        me,
        'contract_ending',
        case when r.min_end < d then 'Prazo mínimo de contrato vencido' else 'Contrato perto do fim do prazo mínimo' end,
        r.client_name || ' · até ' || to_char(r.min_end, 'DD/MM/YYYY') ||
          case when r.notice_days is not null then ' (aviso ' || r.notice_days || 'd)' else '' end,
        '/contratos/' || r.id,
        'contract_ending:' || r.id || ':' || r.min_end,
        null,
        true
      );
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
