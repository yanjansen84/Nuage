-- =====================================================================
-- Na.Nu · Conteúdo (calendário editorial)
-- Produções com cliente, formato, status editável, responsáveis,
-- prazo de produção, data de publicação e marcação de "postado".
-- Permissão: módulo "producao" (exibido como Conteúdo).
-- =====================================================================

update public.modules set name = 'Conteúdo' where key = 'producao';

-- Status do fluxo (editáveis em Configurações → Etapas e status)
insert into public.options (set_key, label, color, sort, is_final) values
  ('content_status','Ideia','#8e6bd8',1,false),
  ('content_status','Planejado','#2f80ed',2,false),
  ('content_status','Em produção','#ea5c2a',3,false),
  ('content_status','Revisão interna','#b97d00',4,false),
  ('content_status','Aguardando aprovação','#d6336c',5,false),
  ('content_status','Ajustes','#c0392b',6,false),
  ('content_status','Aprovado','#2e9e6a',7,false),
  ('content_status','Agendado','#0e9aa7',8,false),
  ('content_status','Publicado','#55555f',9,true);

create table public.contents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  client_id    uuid references public.clients(id) on delete set null,
  project_id   uuid references public.projects(id) on delete set null,
  format_id    uuid references public.options(id),
  status_id    uuid references public.options(id),
  channel      text,
  objective    text,
  briefing     text,
  caption      text,            -- legenda e roteiro
  links        text,            -- referências e links de visualização (um por linha)
  owner_id     uuid references public.profiles(id),   -- responsável pela criação
  reviewer_id  uuid references public.profiles(id),   -- responsável pela revisão
  due_date     date,            -- prazo de produção
  publish_date date,            -- data prevista de publicação
  publish_time time,
  posted_at    timestamptz,     -- quando foi marcado como postado
  posted_url   text,            -- link da publicação
  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index contents_publish_idx on public.contents (publish_date);
create index contents_client_idx on public.contents (client_id);

-- Histórico de etapas (quem moveu, de onde, para onde, quando)
create table public.content_history (
  id         bigint generated always as identity primary key,
  content_id uuid not null references public.contents(id) on delete cascade,
  at         timestamptz not null default now(),
  actor      uuid references public.profiles(id),
  from_label text,
  to_label   text
);
create index content_history_idx on public.content_history (content_id, at);

-- Status final (Publicado) ⇄ posted_at, e registro no histórico
create or replace function public.content_status_sync() returns trigger
language plpgsql as $$
declare fin boolean;
begin
  select is_final into fin from options where id = new.status_id;
  if coalesce(fin, false) and new.posted_at is null then new.posted_at := now();
  elsif not coalesce(fin, false) then new.posted_at := null; end if;
  return new;
end $$;
create trigger contents_status before insert or update of status_id on public.contents
for each row execute function public.content_status_sync();

create or replace function public.content_history_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    insert into content_history (content_id, actor, from_label, to_label)
    values (new.id, auth.uid(),
            case when tg_op = 'UPDATE' then (select label from options where id = old.status_id) end,
            (select label from options where id = new.status_id));
  end if;
  return new;
end $$;
create trigger contents_history after insert or update of status_id on public.contents
for each row execute function public.content_history_log();

create trigger contents_touch before update on public.contents
for each row execute function public.touch_updated_at();
create trigger contents_audit after insert or update or delete on public.contents
for each row execute function public.audit();

-- "É meu?" para o escopo Próprios
create or replace function public.is_content_mine(c public.contents) returns boolean
language sql stable as $$
  select c.owner_id = auth.uid() or c.reviewer_id = auth.uid() or c.created_by = auth.uid()
$$;

alter table public.contents enable row level security;
alter table public.content_history enable row level security;

create policy "ler conteúdos" on public.contents for select to authenticated
  using (public.can_read_all('producao') or (public.can_read('producao') and public.is_content_mine(contents)));
create policy "criar conteúdos" on public.contents for insert to authenticated
  with check (public.can_write_all('producao')
              or (public.can_write('producao') and coalesce(owner_id, auth.uid()) = auth.uid()));
create policy "editar conteúdos" on public.contents for update to authenticated
  using (public.can_write_all('producao') or (public.can_write('producao') and public.is_content_mine(contents)))
  with check (public.can_write('producao'));
create policy "excluir conteúdos" on public.contents for delete to authenticated
  using (public.can_delete('producao') and (public.can_read_all('producao') or created_by = auth.uid()));

create policy "ler histórico de conteúdo" on public.content_history for select to authenticated
  using (exists (select 1 from public.contents c where c.id = content_id));

-- Comentários também em conteúdos
alter table public.comments drop constraint comments_entity_check;
alter table public.comments add constraint comments_entity_check check (entity in ('task','project','lead','client','content'));
drop policy "ler comentários" on public.comments;
create policy "ler comentários" on public.comments for select to authenticated using (
  case entity
    when 'task'    then exists (select 1 from public.tasks    x where x.id = entity_id)
    when 'project' then exists (select 1 from public.projects x where x.id = entity_id)
    when 'lead'    then exists (select 1 from public.leads    x where x.id = entity_id)
    when 'client'  then exists (select 1 from public.clients  x where x.id = entity_id)
    when 'content' then exists (select 1 from public.contents x where x.id = entity_id)
  end);
