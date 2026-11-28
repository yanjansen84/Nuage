-- =====================================================================
-- Na.Nu · Fase 2 · Aprovação externa de conteúdo por link + Web Push
-- 1. content_approval_links + content_approvals: link público com token
--    para o cliente aprovar ou pedir ajustes sem precisar de login.
--    `anon` nunca acessa `contents` diretamente: apenas duas RPCs
--    controladas (get_content_for_approval / submit_content_approval).
-- 2. push_subscriptions: inscrições Web Push do usuário logado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Aprovação externa de conteúdo
-- ---------------------------------------------------------------------
create table public.content_approval_links (
  id         uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.contents(id) on delete cascade,
  token      text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at timestamptz not null default (now() + interval '14 days'),
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index content_approval_links_content_idx on public.content_approval_links (content_id, created_at desc);

create table public.content_approvals (
  id            uuid primary key default gen_random_uuid(),
  link_id       uuid not null references public.content_approval_links(id) on delete cascade,
  content_id    uuid not null references public.contents(id) on delete cascade,
  decision      text not null check (decision in ('aprovado','ajustes')),
  reviewer_name text not null check (char_length(reviewer_name) between 1 and 120),
  comment       text check (char_length(comment) <= 2000),
  created_at    timestamptz not null default now()
);
create unique index content_approvals_link_uidx on public.content_approvals (link_id);
create index content_approvals_content_idx on public.content_approvals (content_id, created_at desc);

create trigger content_approval_links_audit after insert or update or delete on public.content_approval_links
for each row execute function public.audit();
create trigger content_approvals_audit after insert or update or delete on public.content_approvals
for each row execute function public.audit();

alter table public.content_approval_links enable row level security;
alter table public.content_approvals enable row level security;

create policy "ler links de aprovação" on public.content_approval_links for select to authenticated
  using (public.can_read('producao') and exists (select 1 from public.contents c where c.id = content_id));
create policy "criar links de aprovação" on public.content_approval_links for insert to authenticated
  with check (public.can_write('producao') and exists (select 1 from public.contents c where c.id = content_id));
create policy "revogar links de aprovação" on public.content_approval_links for update to authenticated
  using (public.can_write('producao') and exists (select 1 from public.contents c where c.id = content_id))
  with check (public.can_write('producao'));
create policy "excluir links de aprovação" on public.content_approval_links for delete to authenticated
  using (public.can_delete('producao') and exists (select 1 from public.contents c where c.id = content_id));

create policy "ler respostas de aprovação" on public.content_approvals for select to authenticated
  using (public.can_read('producao') and exists (select 1 from public.contents c where c.id = content_id));

revoke all on public.content_approval_links, public.content_approvals from anon;
grant select, insert, update, delete on public.content_approval_links to authenticated;
grant select on public.content_approvals to authenticated;
grant all on public.content_approval_links, public.content_approvals to service_role;

-- Leitura pública controlada pelo token (não expõe dados internos nem permite listar)
create or replace function public.get_content_for_approval(p_token text)
returns table(
  content_id    uuid,
  title         text,
  client_name   text,
  format_label  text,
  status_label  text,
  status_color  text,
  channel       text,
  objective     text,
  caption       text,
  links         text,
  publish_date  date,
  publish_time  time,
  expires_at    timestamptz,
  decision      text,
  reviewer_name text,
  feedback      text,
  decided_at    timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.title, cl.name, fmt.label, st.label, st.color,
         c.channel, c.objective, c.caption, c.links, c.publish_date, c.publish_time,
         l.expires_at, a.decision, a.reviewer_name, a.comment, a.created_at
  from public.content_approval_links l
  join public.contents c on c.id = l.content_id
  left join public.clients cl on cl.id = c.client_id
  left join public.options fmt on fmt.id = c.format_id
  left join public.options st on st.id = c.status_id
  left join public.content_approvals a on a.link_id = l.id
  where l.token = trim(p_token)
    and l.revoked_at is null
    and l.expires_at > now()
$$;

-- Resposta pública de aprovação/ajustes pelo token
create or replace function public.submit_content_approval(
  p_token         text,
  p_decision      text,
  p_reviewer_name text,
  p_comment       text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_link    public.content_approval_links%rowtype;
  v_content public.contents%rowtype;
  v_name    text := trim(coalesce(p_reviewer_name, ''));
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_status  uuid;
  v_kind    text;
  v_title   text;
begin
  if p_decision not in ('aprovado', 'ajustes') then
    raise exception 'Decisão inválida';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Informe seu nome';
  end if;
  if p_decision = 'ajustes' and v_comment is null then
    raise exception 'Descreva os ajustes desejados';
  end if;

  select * into v_link
    from public.content_approval_links
   where token = trim(coalesce(p_token, ''))
   for update;

  if not found or v_link.revoked_at is not null or v_link.expires_at <= now() then
    raise exception 'Link de aprovação inválido ou expirado';
  end if;
  if exists (select 1 from public.content_approvals where link_id = v_link.id) then
    raise exception 'Este link de aprovação já foi respondido';
  end if;

  select * into v_content from public.contents where id = v_link.content_id;
  if not found then
    raise exception 'Conteúdo não encontrado';
  end if;

  insert into public.content_approvals (link_id, content_id, decision, reviewer_name, comment)
  values (v_link.id, v_content.id, p_decision, v_name, v_comment);

  select id into v_status
    from public.options
   where set_key = 'content_status'
     and label = case when p_decision = 'aprovado' then 'Aprovado' else 'Ajustes' end
   limit 1;

  if v_status is not null and v_status is distinct from v_content.status_id then
    update public.contents set status_id = v_status where id = v_content.id;
  end if;

  v_kind  := case when p_decision = 'aprovado' then 'content_approved' else 'content_changes' end;
  v_title := case when p_decision = 'aprovado'
    then v_name || ' aprovou: ' || v_content.title
    else v_name || ' pediu ajustes em ' || v_content.title
  end;

  perform notify(
    v_content.owner_id,
    v_kind,
    v_title,
    coalesce(v_comment, 'Aprovado pelo link externo'),
    '/conteudo?conteudo=' || v_content.id,
    v_kind || ':' || v_link.id || ':' || coalesce(v_content.owner_id::text, ''),
    'producao',
    true
  );
  if v_content.reviewer_id is distinct from v_content.owner_id then
    perform notify(
      v_content.reviewer_id,
      v_kind,
      v_title,
      coalesce(v_comment, 'Aprovado pelo link externo'),
      '/conteudo?conteudo=' || v_content.id,
      v_kind || ':' || v_link.id || ':' || coalesce(v_content.reviewer_id::text, ''),
      'producao',
      true
    );
  end if;
end $$;

revoke execute on function public.get_content_for_approval(text), public.submit_content_approval(text, text, text, text) from public;
grant execute on function public.get_content_for_approval(text), public.submit_content_approval(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Inscrições Web Push (PWA em segundo plano)
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;
create policy "gerenciar próprias inscrições push" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
