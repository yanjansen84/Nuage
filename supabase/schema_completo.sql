-- =========================================
-- 20261119000000_fundacao.sql
-- =========================================
-- =====================================================================
-- Na.Nu · Fase 1 · Fundação
-- Usuários, cargos, permissões, auditoria, cadastros editáveis,
-- catálogo de serviços, CRM, clientes, contratos, financeiro básico,
-- projetos e tarefas.
--
-- Regra de ouro: a permissão é aplicada no BANCO (RLS). A interface só
-- esconde o que o banco já nega. Valores financeiros ficam em tabelas
-- separadas, legíveis apenas por quem tem acesso ao módulo financeiro.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Cargos, módulos e permissões
-- ---------------------------------------------------------------------
create table public.roles (
  key   text primary key,
  name  text not null,
  sort  int  not null default 0
);

create table public.modules (
  key   text primary key,
  name  text not null,
  sort  int  not null default 0
);

-- scope: none = sem acesso · own = só registros atribuídos · all = todos
create table public.role_permissions (
  role       text not null references public.roles(key) on delete cascade,
  module     text not null references public.modules(key) on delete cascade,
  scope      text not null default 'none' check (scope in ('none','own','all')),
  can_write  boolean not null default false,
  can_delete boolean not null default false,
  primary key (role, module)
);

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       text references public.roles(key),
  link       text not null default 'Efetivo' check (link in ('Efetivo','Estagiário')),
  active     boolean not null default true,
  weekly_capacity_hours numeric(5,1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contatos da equipe ficam fora de profiles: o nome é visível a todos
-- (para atribuir tarefas), os contatos só a quem acessa o módulo Equipe.
create table public.profile_details (
  id     uuid primary key references public.profiles(id) on delete cascade,
  phone  text,
  email  text,
  insta  text,
  x      text,
  updated_at timestamptz not null default now()
);

-- Ajuste fino por pessoa: qualquer coluna nula herda do cargo.
create table public.user_permissions (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  module     text not null references public.modules(key) on delete cascade,
  scope      text check (scope in ('none','own','all')),
  can_write  boolean,
  can_delete boolean,
  primary key (user_id, module)
);

-- Permissão efetiva do usuário logado em um módulo.
create or replace function public.eff_perm(p_module text)
returns table(scope text, can_write boolean, can_delete boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(up.scope, rp.scope, 'none'),
         coalesce(up.can_write, rp.can_write, false),
         coalesce(up.can_delete, rp.can_delete, false)
  from profiles p
  left join role_permissions rp on rp.role = p.role and rp.module = p_module
  left join user_permissions up on up.user_id = p.id and up.module = p_module
  where p.id = auth.uid() and p.active
$$;

create or replace function public.can_read(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select scope in ('own','all') from eff_perm(p_module)), false) $$;

create or replace function public.can_read_all(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select scope = 'all' from eff_perm(p_module)), false) $$;

create or replace function public.can_write(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select scope in ('own','all') and can_write from eff_perm(p_module)), false) $$;

create or replace function public.can_write_all(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select scope = 'all' and can_write from eff_perm(p_module)), false) $$;

create or replace function public.can_delete(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select scope in ('own','all') and can_delete from eff_perm(p_module)), false) $$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_write_all('configuracoes') $$;

-- Permissões do usuário logado em todos os módulos (usado pelo menu).
create or replace function public.my_permissions()
returns table(module text, scope text, can_write boolean, can_delete boolean)
language sql stable security definer set search_path = public as $$
  select m.key, e.scope, e.can_write, e.can_delete
  from modules m cross join lateral eff_perm(m.key) e
  order by m.sort
$$;

-- ---------------------------------------------------------------------
-- 2. Utilidades: updated_at e auditoria
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  action     text not null,
  table_name text not null,
  record_id  text,
  old_data   jsonb,
  new_data   jsonb
);
create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_at_idx on public.audit_log (at desc);

create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into audit_log (actor, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name,
          coalesce(r->>'id', r->>'user_id', r->>'role', r->>'key'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 3. Cadastros editáveis (etapas, status, formatos...)
-- ---------------------------------------------------------------------
create table public.options (
  id      uuid primary key default gen_random_uuid(),
  set_key text not null,     -- lead_stage, client_status, project_status, task_status, content_format...
  label   text not null,
  color   text,
  sort    int not null default 0,
  is_final boolean not null default false,  -- etapa que encerra (ex.: Fechado, Concluída)
  active  boolean not null default true,
  unique (set_key, label)
);

-- ---------------------------------------------------------------------
-- 4. Catálogo de serviços (sem preço) + preços (financeiro)
-- ---------------------------------------------------------------------
create table public.services (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,
  name          text not null,
  description   text,
  category      text,
  billing_type  text not null check (billing_type in ('recorrente','pacote','avulso')),
  delivery_days int,
  delivery_note text,
  min_months    int,
  deliverables  text[] not null default '{}',
  notes         text,
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Opções contratáveis de cada serviço (ex.: "Mensal", "Pacote 5 vídeos").
create table public.service_offers (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  label      text not null,
  quantity   int,
  active     boolean not null default true,
  sort       int not null default 0
);

-- Preço padrão: dado financeiro, tabela própria.
create table public.offer_prices (
  offer_id   uuid primary key references public.service_offers(id) on delete cascade,
  price      numeric(12,2) not null check (price >= 0),
  updated_at timestamptz not null default now()
);

create table public.checklist_templates (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete cascade,  -- nulo = vale para todo contrato
  name       text not null,
  active     boolean not null default true
);

create table public.checklist_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  title       text not null,
  due_offset_days int,
  sort        int not null default 0
);

-- ---------------------------------------------------------------------
-- 5. CRM
-- ---------------------------------------------------------------------
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  segment    text,
  contact_name text,
  phone      text,
  email      text,
  status_id  uuid references public.options(id),
  notes      text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text,
  phone       text,
  email       text,
  segment     text,
  origin      text,
  service_id  uuid references public.services(id),
  owner_id    uuid references public.profiles(id),
  stage_id    uuid references public.options(id),
  next_action text,
  follow_up   date,
  notes       text,
  client_id   uuid references public.clients(id),
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index leads_stage_idx on public.leads (stage_id);

create table public.lead_values (
  lead_id         uuid primary key references public.leads(id) on delete cascade,
  estimated_value numeric(12,2),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Contratos e financeiro
-- ---------------------------------------------------------------------
create table public.contracts (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete restrict,
  lead_id        uuid references public.leads(id),
  status         text not null default 'rascunho' check (status in ('rascunho','ativo','encerrado','cancelado')),
  start_date     date,
  end_date       date,
  min_months     int,
  renewal        text not null default 'automatica' check (renewal in ('automatica','manual')),
  notice_days    int check (notice_days in (5,10,15,20)),
  due_day        int check (due_day between 1 and 31),
  payment_method text check (payment_method in ('pix','boleto','cartao')),
  installments   int check (installments >= 1),
  payment_terms  text,
  notes          text,
  activated_at   timestamptz,
  activated_by   uuid references public.profiles(id),
  created_by     uuid references public.profiles(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Itens do contrato guardam uma CÓPIA do preço: mudar o catálogo
-- não altera contratos já firmados.
create table public.contract_items (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references public.contracts(id) on delete cascade,
  service_id       uuid not null references public.services(id),
  offer_id         uuid references public.service_offers(id),
  description      text,
  quantity         int not null default 1,
  list_price       numeric(12,2),
  negotiated_price numeric(12,2) not null check (negotiated_price >= 0),
  billing_type     text not null check (billing_type in ('recorrente','pacote','avulso'))
);

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  due_date    date not null,
  amount      numeric(12,2) not null check (amount >= 0),
  status      text not null default 'previsto' check (status in ('previsto','pago','atrasado','cancelado')),
  paid_at     date,
  method      text check (method in ('pix','boleto','cartao')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index payments_due_idx on public.payments (due_date);

-- ---------------------------------------------------------------------
-- 7. Projetos e tarefas
-- ---------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients(id) on delete set null,
  service_id  uuid references public.services(id),
  contract_id uuid references public.contracts(id) on delete set null,
  name        text not null,
  description text,
  objective   text,
  owner_id    uuid references public.profiles(id),
  status_id   uuid references public.options(id),
  priority    text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
  start_date  date,
  due_date    date,
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (project_id, profile_id)
);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects(id) on delete cascade,
  client_id    uuid references public.clients(id) on delete set null,
  parent_id    uuid references public.tasks(id) on delete cascade,
  title        text not null,
  description  text check (char_length(description) <= 5000),
  owner_id     uuid references public.profiles(id),
  status_id    uuid references public.options(id),
  priority     text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
  start_date   date,
  due_date     date,
  effort_hours numeric(5,1),
  recurrence   jsonb,          -- {"freq":"weekly","interval":1} (automação na Fase 2)
  done_at      timestamptz,
  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_owner_idx on public.tasks (owner_id);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_due_idx on public.tasks (due_date) where done_at is null;

create table public.task_collaborators (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (task_id, profile_id)
);

create table public.task_dependencies (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  depends_on uuid not null references public.tasks(id) on delete cascade,
  primary key (task_id, depends_on),
  check (task_id <> depends_on)
);

create table public.task_checklist (
  id      uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title   text not null,
  done    boolean not null default false,
  sort    int not null default 0
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  entity     text not null check (entity in ('task','project','lead','client')),
  entity_id  uuid not null,
  author_id  uuid not null references public.profiles(id) default auth.uid(),
  body       text not null,
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_entity_idx on public.comments (entity, entity_id);

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  date       date not null,
  time       time,
  profile_id uuid references public.profiles(id),   -- nulo = toda a agência
  client_id  uuid references public.clients(id) on delete set null,
  notes      text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  source     text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at);

-- ---------------------------------------------------------------------
-- 8. Funções de "é meu?" (escopo Próprios)
-- ---------------------------------------------------------------------
create or replace function public.is_task_mine(t public.tasks) returns boolean
language sql stable security definer set search_path = public as $$
  select t.owner_id = auth.uid() or t.created_by = auth.uid()
      or exists (select 1 from task_collaborators c where c.task_id = t.id and c.profile_id = auth.uid())
$$;

create or replace function public.is_project_mine(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects p where p.id = p_id and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
      or exists (select 1 from project_members m where m.project_id = p_id and m.profile_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 9. Triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','profile_details','services','clients','leads','lead_values',
                           'contracts','payments','projects','tasks','offer_prices'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
  foreach t in array array['profiles','profile_details','role_permissions','user_permissions','options',
                           'services','service_offers','offer_prices','checklist_templates','checklist_template_items',
                           'clients','leads','lead_values','contracts','contract_items','payments',
                           'projects','project_members','tasks','task_dependencies','events'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit()', t, t);
  end loop;
end $$;

-- Novo usuário no Auth → perfil.
-- O primeiro usuário vira CEO. Os demais recebem o cargo definido em
-- app_metadata (só o servidor consegue escrever ali: função invite-user).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if not exists (select 1 from profiles) then
    v_role := 'ceo';
  else
    v_role := new.raw_app_meta_data->>'role';
    if v_role is not null and not exists (select 1 from roles where key = v_role) then v_role := null; end if;
  end if;
  insert into profiles (id, name, role, active)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
          v_role,
          v_role is not null);
  insert into profile_details (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Ninguém altera o próprio cargo/ativação, a não ser um administrador.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.active is distinct from old.active
          or new.weekly_capacity_hours is distinct from old.weekly_capacity_hours) then
    raise exception 'Apenas administradores alteram cargo, status ou capacidade';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
for each row execute function public.guard_profile();

-- Tarefa concluída quando o status é final.
create or replace function public.task_done_sync() returns trigger
language plpgsql as $$
declare fin boolean;
begin
  select is_final into fin from options where id = new.status_id;
  if coalesce(fin,false) and new.done_at is null then new.done_at := now();
  elsif not coalesce(fin,false) then new.done_at := null; end if;
  return new;
end $$;
create trigger tasks_done before insert or update of status_id on public.tasks
for each row execute function public.task_done_sync();

-- ---------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------
alter table public.roles                    enable row level security;
alter table public.modules                  enable row level security;
alter table public.role_permissions         enable row level security;
alter table public.user_permissions         enable row level security;
alter table public.profiles                 enable row level security;
alter table public.profile_details          enable row level security;
alter table public.audit_log                enable row level security;
alter table public.options                  enable row level security;
alter table public.services                 enable row level security;
alter table public.service_offers           enable row level security;
alter table public.offer_prices             enable row level security;
alter table public.checklist_templates      enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.clients                  enable row level security;
alter table public.leads                    enable row level security;
alter table public.lead_values              enable row level security;
alter table public.contracts                enable row level security;
alter table public.contract_items           enable row level security;
alter table public.payments                 enable row level security;
alter table public.projects                 enable row level security;
alter table public.project_members          enable row level security;
alter table public.tasks                    enable row level security;
alter table public.task_collaborators       enable row level security;
alter table public.task_dependencies        enable row level security;
alter table public.task_checklist           enable row level security;
alter table public.comments                 enable row level security;
alter table public.events                   enable row level security;
alter table public.notifications            enable row level security;

-- Estrutura de acesso: todos os usuários ativos leem; só admin altera.
create policy "ler cargos"   on public.roles   for select to authenticated using (true);
create policy "ler módulos"  on public.modules for select to authenticated using (true);
create policy "ler permissões de cargo" on public.role_permissions for select to authenticated using (true);
create policy "admin altera permissões de cargo" on public.role_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "ler permissões próprias ou admin" on public.user_permissions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "admin altera permissões de usuário" on public.user_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Perfis: nome e cargo visíveis a todos os ativos; edição pelo próprio ou admin.
create policy "ler perfis" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());
create policy "editar próprio perfil ou admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "ler contatos da equipe" on public.profile_details for select to authenticated
  using (id = auth.uid() or public.can_read('equipe'));
create policy "editar contatos" on public.profile_details for update to authenticated
  using (id = auth.uid() or public.can_write_all('equipe')) with check (id = auth.uid() or public.can_write_all('equipe'));

create policy "admin lê auditoria" on public.audit_log for select to authenticated using (public.is_admin());

-- Cadastros editáveis e catálogo: leitura geral, edição em Configurações.
create policy "ler opções" on public.options for select to authenticated using (true);
create policy "admin altera opções" on public.options for all to authenticated
  using (public.can_write_all('configuracoes')) with check (public.can_write_all('configuracoes'));

create policy "ler serviços" on public.services for select to authenticated using (true);
create policy "config altera serviços" on public.services for all to authenticated
  using (public.can_write_all('configuracoes')) with check (public.can_write_all('configuracoes'));
create policy "ler ofertas" on public.service_offers for select to authenticated using (true);
create policy "config altera ofertas" on public.service_offers for all to authenticated
  using (public.can_write_all('configuracoes')) with check (public.can_write_all('configuracoes'));

create policy "financeiro lê preços" on public.offer_prices for select to authenticated
  using (public.can_read('financeiro'));
create policy "financeiro+config altera preços" on public.offer_prices for all to authenticated
  using (public.can_write('financeiro') and public.can_read('configuracoes'))
  with check (public.can_write('financeiro') and public.can_read('configuracoes'));

create policy "ler modelos de checklist" on public.checklist_templates for select to authenticated using (true);
create policy "config altera modelos" on public.checklist_templates for all to authenticated
  using (public.can_write_all('configuracoes')) with check (public.can_write_all('configuracoes'));
create policy "ler itens de checklist" on public.checklist_template_items for select to authenticated using (true);
create policy "config altera itens" on public.checklist_template_items for all to authenticated
  using (public.can_write_all('configuracoes')) with check (public.can_write_all('configuracoes'));

-- Clientes
create policy "ler clientes" on public.clients for select to authenticated using (public.can_read('clientes'));
create policy "criar clientes" on public.clients for insert to authenticated with check (public.can_write('clientes'));
create policy "editar clientes" on public.clients for update to authenticated
  using (public.can_write('clientes')) with check (public.can_write('clientes'));
create policy "excluir clientes" on public.clients for delete to authenticated using (public.can_delete('clientes'));

-- Leads (Próprios = sou o responsável ou criei)
create policy "ler leads" on public.leads for select to authenticated
  using (public.can_read_all('crm') or (public.can_read('crm') and (owner_id = auth.uid() or created_by = auth.uid())));
create policy "criar leads" on public.leads for insert to authenticated
  with check (public.can_write('crm'));
create policy "editar leads" on public.leads for update to authenticated
  using (public.can_write_all('crm') or (public.can_write('crm') and (owner_id = auth.uid() or created_by = auth.uid())))
  with check (public.can_write('crm'));
create policy "excluir leads" on public.leads for delete to authenticated using (public.can_delete('crm'));

create policy "financeiro lê valor de lead" on public.lead_values for select to authenticated
  using (public.can_read('financeiro') and public.can_read('crm'));
create policy "financeiro altera valor de lead" on public.lead_values for all to authenticated
  using (public.can_write('financeiro') and public.can_write('crm'))
  with check (public.can_write('financeiro') and public.can_write('crm'));

-- Contratos (o módulo inteiro é sensível: matriz restringe aos cargos financeiros)
create policy "ler contratos" on public.contracts for select to authenticated using (public.can_read('contratos'));
create policy "criar contratos" on public.contracts for insert to authenticated with check (public.can_write('contratos'));
create policy "editar contratos" on public.contracts for update to authenticated
  using (public.can_write('contratos')) with check (public.can_write('contratos'));
create policy "excluir contratos" on public.contracts for delete to authenticated
  using (public.can_delete('contratos') and status = 'rascunho');

create policy "ler itens de contrato" on public.contract_items for select to authenticated
  using (public.can_read('contratos') and public.can_read('financeiro'));
create policy "alterar itens de contrato" on public.contract_items for all to authenticated
  using (public.can_write('contratos') and public.can_write('financeiro')
         and exists (select 1 from public.contracts c where c.id = contract_id and c.status = 'rascunho'))
  with check (public.can_write('contratos') and public.can_write('financeiro')
         and exists (select 1 from public.contracts c where c.id = contract_id and c.status = 'rascunho'));

create policy "ler pagamentos" on public.payments for select to authenticated using (public.can_read('financeiro'));
create policy "alterar pagamentos" on public.payments for all to authenticated
  using (public.can_write('financeiro')) with check (public.can_write('financeiro'));

-- Projetos
create policy "ler projetos" on public.projects for select to authenticated
  using (public.can_read_all('projetos') or (public.can_read('projetos') and public.is_project_mine(id)));
create policy "criar projetos" on public.projects for insert to authenticated
  with check (public.can_write_all('projetos'));
create policy "editar projetos" on public.projects for update to authenticated
  using (public.can_write_all('projetos') or (public.can_write('projetos') and public.is_project_mine(id)))
  with check (public.can_write('projetos'));
create policy "excluir projetos" on public.projects for delete to authenticated
  using (public.can_delete('projetos') and public.can_read_all('projetos'));

create policy "ler membros" on public.project_members for select to authenticated using (public.can_read('projetos'));
create policy "alterar membros" on public.project_members for all to authenticated
  using (public.can_write_all('projetos')) with check (public.can_write_all('projetos'));

-- Tarefas (Próprios = responsável, criador ou colaborador)
create policy "ler tarefas" on public.tasks for select to authenticated
  using (public.can_read_all('projetos') or (public.can_read('projetos') and public.is_task_mine(tasks)));
create policy "criar tarefas" on public.tasks for insert to authenticated
  with check (public.can_write_all('projetos')
              or (public.can_write('projetos') and coalesce(owner_id, auth.uid()) = auth.uid()));
create policy "editar tarefas" on public.tasks for update to authenticated
  using (public.can_write_all('projetos') or (public.can_write('projetos') and public.is_task_mine(tasks)))
  with check (public.can_write('projetos'));
create policy "excluir tarefas" on public.tasks for delete to authenticated
  using (public.can_delete('projetos') and (public.can_read_all('projetos') or created_by = auth.uid()));

create policy "ler colaboradores" on public.task_collaborators for select to authenticated using (public.can_read('projetos'));
create policy "alterar colaboradores" on public.task_collaborators for all to authenticated
  using (public.can_write('projetos')) with check (public.can_write('projetos'));
create policy "ler dependências" on public.task_dependencies for select to authenticated using (public.can_read('projetos'));
create policy "alterar dependências" on public.task_dependencies for all to authenticated
  using (public.can_write('projetos')) with check (public.can_write('projetos'));
create policy "ler checklist" on public.task_checklist for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));   -- herda a RLS de tasks
create policy "alterar checklist" on public.task_checklist for all to authenticated
  using (public.can_write('projetos') and exists (select 1 from public.tasks t where t.id = task_id))
  with check (public.can_write('projetos') and exists (select 1 from public.tasks t where t.id = task_id));

-- Comentários: visíveis se o registro comentado for visível.
create policy "ler comentários" on public.comments for select to authenticated using (
  case entity
    when 'task'    then exists (select 1 from public.tasks    x where x.id = entity_id)
    when 'project' then exists (select 1 from public.projects x where x.id = entity_id)
    when 'lead'    then exists (select 1 from public.leads    x where x.id = entity_id)
    when 'client'  then exists (select 1 from public.clients  x where x.id = entity_id)
  end);
create policy "comentar" on public.comments for insert to authenticated with check (author_id = auth.uid());
create policy "editar próprio comentário" on public.comments for update to authenticated
  using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy "excluir próprio comentário" on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- Agenda: todos os ativos leem; cada um edita o que criou; admin tudo.
create policy "ler agenda" on public.events for select to authenticated
  using (public.is_active_user());
create policy "criar evento" on public.events for insert to authenticated
  with check (public.is_active_user());
create policy "editar evento" on public.events for update to authenticated
  using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy "excluir evento" on public.events for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

create policy "ler minhas notificações" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "marcar como lida" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 11. Visão sem valores: serviços contratados por cliente
-- (todo mundo que lê Clientes vê QUAIS serviços o cliente tem, sem preço)
-- ---------------------------------------------------------------------
create or replace function public.client_services(p_client uuid default null)
returns table(client_id uuid, service_id uuid, service_name text, offer_label text, contract_status text)
language sql stable security definer set search_path = public as $$
  select c.client_id, i.service_id, s.name, o.label, c.status
  from contracts c
  join contract_items i on i.contract_id = c.id
  join services s on s.id = i.service_id
  left join service_offers o on o.id = i.offer_id
  where public.can_read('clientes')
    and c.status = 'ativo'
    and (p_client is null or c.client_id = p_client)
$$;

-- ---------------------------------------------------------------------
-- 12. Automação: ativar contrato
-- Cliente passa a "Ativo", cria projeto de onboarding e tarefas a partir
-- dos modelos de checklist (gerais + de cada serviço do contrato).
-- ---------------------------------------------------------------------
create or replace function public.activate_contract(p_contract uuid, p_owner uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c contracts%rowtype;
  v_project uuid;
  v_status_open uuid;
  v_task_status uuid;
  v_client_active uuid;
  v_client_name text;
  it record;
begin
  if not (public.can_write('contratos') and public.can_write('financeiro')) then
    raise exception 'Sem permissão para ativar contratos';
  end if;
  select * into c from contracts where id = p_contract for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if c.status <> 'rascunho' then raise exception 'Só contratos em rascunho podem ser ativados'; end if;
  if not exists (select 1 from contract_items where contract_id = c.id) then
    raise exception 'Adicione ao menos um serviço ao contrato';
  end if;

  update contracts set status = 'ativo', activated_at = now(), activated_by = auth.uid(),
         start_date = coalesce(start_date, current_date)
   where id = c.id;

  select id into v_client_active from options where set_key = 'client_status' and label = 'Ativo';
  update clients set status_id = coalesce(v_client_active, status_id) where id = c.client_id
  returning name into v_client_name;

  if c.lead_id is not null then
    update leads set client_id = c.client_id,
           stage_id = coalesce((select id from options where set_key='lead_stage' and label='Fechado'), stage_id)
     where id = c.lead_id;
  end if;

  select id into v_status_open from options where set_key = 'project_status' order by sort limit 1;
  select id into v_task_status from options where set_key = 'task_status' order by sort limit 1;

  insert into projects (client_id, contract_id, name, objective, owner_id, status_id, priority, start_date)
  values (c.client_id, c.id, 'Onboarding · ' || v_client_name, 'Colocar o cliente em operação',
          coalesce(p_owner, auth.uid()), v_status_open, 'alta', current_date)
  returning id into v_project;

  for it in
    select ti.title, ti.due_offset_days, ti.sort, t.service_id
    from checklist_template_items ti
    join checklist_templates t on t.id = ti.template_id and t.active
    where t.service_id is null
       or t.service_id in (select service_id from contract_items where contract_id = c.id)
    order by (t.service_id is not null), ti.sort
  loop
    insert into tasks (project_id, client_id, title, owner_id, status_id, start_date, due_date)
    values (v_project, c.client_id, it.title, coalesce(p_owner, auth.uid()), v_task_status, current_date,
            case when it.due_offset_days is not null then current_date + it.due_offset_days end);
  end loop;

  return v_project;
end $$;

revoke execute on function public.activate_contract(uuid, uuid) from anon, public;
grant  execute on function public.activate_contract(uuid, uuid) to authenticated;


-- =========================================
-- 20261119000100_dados_iniciais.sql
-- =========================================
-- =====================================================================
-- Na.Nu · Dados iniciais (configuração, não dados fictícios)
-- Tudo aqui é editável depois pela área de Configurações.
-- =====================================================================

-- O sistema começa só com o administrador, com acesso total.
-- Os demais cargos são criados pelo administrador em Configurações → Permissões
-- e nascem sem nenhum acesso (ver 20261119000200_cargos_editaveis.sql).
insert into public.roles (key, name, sort) values
  ('ceo', 'Administrador / CEO / Gestor', 1);

insert into public.modules (key, name, sort) values
  ('dashboard',     'Início', 1),
  ('crm',           'Comercial', 2),
  ('clientes',      'Clientes', 3),
  ('contratos',     'Contratos', 4),
  ('financeiro',    'Financeiro', 5),
  ('projetos',      'Projetos e tarefas', 6),
  ('producao',      'Produção', 7),
  ('estrategia',    'Estratégia', 8),
  ('equipe',        'Equipe', 9),
  ('configuracoes', 'Configurações', 10);

insert into public.role_permissions (role, module, scope, can_write, can_delete)
select 'ceo', m.key, 'all', true, true from public.modules m;

-- Etapas e status (editáveis)
insert into public.options (set_key, label, color, sort, is_final) values
  ('lead_stage','Lead recebido','#8e6bd8',1,false),
  ('lead_stage','Primeiro contato','#2f80ed',2,false),
  ('lead_stage','Qualificação','#0e9aa7',3,false),
  ('lead_stage','Reunião','#b97d00',4,false),
  ('lead_stage','Diagnóstico','#ea5c2a',5,false),
  ('lead_stage','Proposta enviada','#d6336c',6,false),
  ('lead_stage','Negociação','#5b4bdb',7,false),
  ('lead_stage','Fechado','#2e9e6a',8,true),
  ('lead_stage','Perdido','#55555f',9,true),

  ('lead_origin','Indicação',null,1,false),
  ('lead_origin','Instagram',null,2,false),
  ('lead_origin','Site',null,3,false),
  ('lead_origin','WhatsApp',null,4,false),
  ('lead_origin','Evento',null,5,false),
  ('lead_origin','Outro',null,6,false),

  ('client_status','Em negociação','#2f80ed',1,false),
  ('client_status','Em onboarding','#b97d00',2,false),
  ('client_status','Ativo','#2e9e6a',3,false),
  ('client_status','Pausado','#55555f',4,false),
  ('client_status','Encerrado','#55555f',5,true),
  ('client_status','Inadimplente','#c0392b',6,false),

  ('project_status','Planejado','#2f80ed',1,false),
  ('project_status','Em andamento','#ea5c2a',2,false),
  ('project_status','Pausado','#55555f',3,false),
  ('project_status','Concluído','#2e9e6a',4,true),
  ('project_status','Cancelado','#55555f',5,true),

  ('task_status','Pendente','#ea5c2a',1,false),
  ('task_status','Em andamento','#2f80ed',2,false),
  ('task_status','Bloqueada','#c0392b',3,false),
  ('task_status','Concluída','#2e9e6a',4,true),

  ('content_format','Reels',null,1,false),
  ('content_format','Stories',null,2,false),
  ('content_format','Carrossel',null,3,false),
  ('content_format','Estático',null,4,false),
  ('content_format','Fotografia',null,5,false),
  ('content_format','Vídeo institucional',null,6,false),
  ('content_format','Outro',null,7,false);

-- Catálogo de serviços (especificação 3.1)
insert into public.services (code, name, description, category, billing_type, min_months, delivery_days, delivery_note, deliverables, sort) values
  ('ag','Nuage Agência','Gestão estratégica da comunicação','Agência','recorrente',6,null,null, array[
    'Gestão completa de redes sociais','Planejamento estratégico de conteúdo','Planejamento de Stories',
    'Gestão de comunidade','Captação, roteirização, direção e edição de fotos e vídeos',
    'Impulsionamento e gestão de tráfego pago (Meta Ads)','Análise de resultados e envio de relatórios',
    'Posicionamento de marca','Avaliação e otimização do atendimento','Planejamento e execução de campanhas e eventos',
    'Estruturação de processos de comunicação da marca','Criação de manuais e documentos operacionais',
    'Acompanhamento estratégico e consultoria'], 1),
  ('sm','Nuage Social Media','Gestão da presença digital','Social Media','recorrente',6,null,null, array[
    'Gestão completa de redes sociais','Análise de perfil e diagnóstico de presença digital',
    'Planejamento estratégico de conteúdo','Planejamento de Stories','Gestão de comunidade (responder comentários)',
    'Captação, roteirização, direção e edição de fotos e vídeos'], 2),
  ('st','Nuage Studio','Produção audiovisual','Studio','pacote',null,2,'Até 48 horas após a captação', array[
    'Roteiros','Direção criativa e audiovisual','Captação de vídeos','Edição e finalização',
    'Vídeos de até 1min30','Até uma captação por semana, conforme contratação'], 3);

insert into public.service_offers (service_id, label, quantity, sort)
select s.id, o.label, o.qty, o.sort
from public.services s
join (values ('ag','Mensal',null::int,1),('sm','Mensal',null,1),
             ('st','1 vídeo',1,1),('st','5 vídeos',5,2),('st','8 vídeos',8,3),('st','12 vídeos',12,4)
     ) as o(code,label,qty,sort) on o.code = s.code;

insert into public.offer_prices (offer_id, price)
select o.id, p.price
from public.service_offers o
join public.services s on s.id = o.service_id
join (values ('ag','Mensal',2500.00),('sm','Mensal',1500.00),
             ('st','1 vídeo',350.00),('st','5 vídeos',1200.00),('st','8 vídeos',2000.00),('st','12 vídeos',3000.00)
     ) as p(code,label,price) on p.code = s.code and p.label = o.label;

-- Checklist de onboarding (vale para todo contrato ativado)
with t as (
  insert into public.checklist_templates (service_id, name) values (null, 'Onboarding padrão') returning id
)
insert into public.checklist_template_items (template_id, title, sort, due_offset_days)
select t.id, i.title, i.sort, i.d from t,
(values ('Cadastro completo',1,1),('Contrato',2,2),('Cadastro financeiro',3,2),('Briefing',4,5),
        ('Reunião inicial',5,5),('Coleta de identidade visual',6,7),('Acesso aos canais necessários',7,7),
        ('Diagnóstico',8,10),('Planejamento inicial',9,14),('Aprovação do planejamento',10,18),
        ('Início da operação',11,21)) as i(title,sort,d);


-- =========================================
-- 20261119000200_cargos_editaveis.sql
-- =========================================
-- =====================================================================
-- Na.Nu · Cargos editáveis pelo administrador
-- O administrador cria, renomeia e exclui cargos pela tela de Permissões.
-- Cargo novo nasce sem nenhuma permissão: o admin define depois.
-- =====================================================================

create policy "admin cria cargos" on public.roles for insert to authenticated
  with check (public.is_admin());
create policy "admin altera cargos" on public.roles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admin exclui cargos" on public.roles for delete to authenticated
  using (public.is_admin() and key <> 'ceo');

-- Cargo novo: cria a linha "sem acesso" para cada módulo.
create or replace function public.seed_role_permissions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into role_permissions (role, module, scope, can_write, can_delete)
  select new.key, m.key, 'none', false, false from modules m
  on conflict do nothing;
  return new;
end $$;
create trigger roles_seed_permissions after insert on public.roles
for each row execute function public.seed_role_permissions();

-- Não deixa excluir um cargo que ainda está em uso por alguém.
create or replace function public.guard_role_delete() returns trigger
language plpgsql as $$
begin
  if old.key = 'ceo' then raise exception 'O cargo de administrador não pode ser excluído'; end if;
  if exists (select 1 from profiles where role = old.key) then
    raise exception 'Este cargo ainda está atribuído a pessoas da equipe. Troque o cargo delas antes de excluir';
  end if;
  return old;
end $$;
create trigger roles_guard_delete before delete on public.roles
for each row execute function public.guard_role_delete();

create trigger roles_audit after insert or update or delete on public.roles
for each row execute function public.audit();


-- =========================================
-- 20261119000300_conteudos.sql
-- =========================================
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


-- =========================================
-- 20261119000400_permissoes_e_ajustes.sql
-- =========================================
-- Permissões explícitas no esquema public para os papéis do Supabase (anon e authenticated)
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated, anon;
grant all on all sequences in schema public to authenticated, anon;
grant all on all routines in schema public to authenticated, anon;

alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on sequences to authenticated, anon;
alter default privileges in schema public grant all on routines to authenticated, anon;

-- Garante que qualquer usuário existente em auth.users (criado antes do trigger) tenha seu perfil criado
do $$
declare
  r record;
  v_role text;
begin
  for r in select * from auth.users loop
    if not exists (select 1 from public.profiles where id = r.id) then
      if not exists (select 1 from public.profiles) then
        v_role := 'ceo';
      else
        v_role := r.raw_app_meta_data->>'role';
        if v_role is not null and not exists (select 1 from public.roles where key = v_role) then
          v_role := null;
        end if;
      end if;

      insert into public.profiles (id, name, role, active)
      values (
        r.id,
        coalesce(nullif(r.raw_user_meta_data->>'name',''), split_part(r.email,'@',1)),
        v_role,
        v_role is not null
      ) on conflict (id) do nothing;

      insert into public.profile_details (id, email)
      values (r.id, r.email)
      on conflict (id) do nothing;
    end if;
  end loop;
end $$;


-- =========================================
-- 20261119000500_limpa_dados_iniciais.sql
-- =========================================
-- Limpeza de serviços e checklists de exemplo da Nuage
delete from public.checklist_templates;
delete from public.services;


-- =========================================
-- 20261119000600_seguranca_hardening.sql
-- =========================================
-- =====================================================================
-- Na.Nu · Hardening de Segurança e Boas Práticas RLS
-- =====================================================================

-- 1. search_path seguro nas funções de escopo (prevenção contra CVE-426)
create or replace function public.is_content_mine(c public.contents) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select c.owner_id = auth.uid() or c.reviewer_id = auth.uid() or c.created_by = auth.uid()
$$;

create or replace function public.is_task_mine(t public.tasks) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select t.owner_id = auth.uid() or t.created_by = auth.uid()
      or exists (select 1 from task_collaborators c where c.task_id = t.id and c.profile_id = auth.uid())
$$;

create or replace function public.is_project_mine(p_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from projects p where p.id = p_id and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
      or exists (select 1 from project_members m where m.project_id = p_id and m.profile_id = auth.uid())
$$;

-- 2. Princípio do Menor Privilégio (Defense in Depth) para o papel 'anon'
-- Usuários não autenticados não precisam de acesso direto a dados operacionais ou financeiros
revoke all on public.audit_log from anon;
revoke all on public.role_permissions from anon;
revoke all on public.user_permissions from anon;
revoke all on public.profile_details from anon;
revoke all on public.payments from anon;
revoke all on public.contract_items from anon;
revoke all on public.contracts from anon;
revoke all on public.lead_values from anon;
revoke all on public.offer_prices from anon;
revoke all on public.clients from anon;
revoke all on public.leads from anon;
revoke all on public.projects from anon;
revoke all on public.tasks from anon;
revoke all on public.contents from anon;


-- =========================================
-- 20261119000700_correcoes_rls.sql
-- =========================================
-- =====================================================================
-- Na.Nu · Correções de RLS e Integridade de Dados
-- =====================================================================

-- 1. Correção de Colaboradores e Dependências de Tarefas
-- Leitura restrita a tarefas visíveis; escrita restrita a admin/gerente de projetos ou dono/criador da tarefa.
drop policy if exists "ler colaboradores" on public.task_collaborators;
create policy "ler colaboradores" on public.task_collaborators for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

drop policy if exists "alterar colaboradores" on public.task_collaborators;
create policy "alterar colaboradores" on public.task_collaborators for all to authenticated
  using (
    public.can_write_all('projetos')
    or (
      public.can_write('projetos')
      and exists (select 1 from public.tasks t where t.id = task_id and (t.owner_id = auth.uid() or t.created_by = auth.uid()))
    )
  )
  with check (
    public.can_write_all('projetos')
    or (
      public.can_write('projetos')
      and exists (select 1 from public.tasks t where t.id = task_id and (t.owner_id = auth.uid() or t.created_by = auth.uid()))
    )
  );

drop policy if exists "ler dependências" on public.task_dependencies;
create policy "ler dependências" on public.task_dependencies for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

drop policy if exists "alterar dependências" on public.task_dependencies;
create policy "alterar dependências" on public.task_dependencies for all to authenticated
  using (
    public.can_write_all('projetos')
    or (
      public.can_write('projetos')
      and exists (select 1 from public.tasks t where t.id = task_id and (t.owner_id = auth.uid() or t.created_by = auth.uid()))
    )
  )
  with check (
    public.can_write_all('projetos')
    or (
      public.can_write('projetos')
      and exists (select 1 from public.tasks t where t.id = task_id and (t.owner_id = auth.uid() or t.created_by = auth.uid()))
    )
  );

-- 2. Proteção de Histórico Financeiro e Transições de Status em Contratos
-- Não permite que exclusão de contrato apague pagamentos registrados em cascata.
alter table public.payments drop constraint if exists payments_contract_id_fkey;
alter table public.payments add constraint payments_contract_id_fkey
  foreign key (contract_id) references public.contracts(id) on delete restrict;

-- Atualiza a função activate_contract para sinalizar a transição segura
create or replace function public.activate_contract(p_contract uuid, p_owner uuid default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c contracts%rowtype;
  v_project uuid;
  v_status_open uuid;
  v_task_status uuid;
  v_client_active uuid;
  v_client_name text;
  it record;
begin
  if not (public.can_write('contratos') and public.can_write('financeiro')) then
    raise exception 'Sem permissão para ativar contratos';
  end if;
  select * into c from contracts where id = p_contract for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if c.status <> 'rascunho' then raise exception 'Só contratos em rascunho podem ser ativados'; end if;
  if not exists (select 1 from contract_items where contract_id = c.id) then
    raise exception 'Adicione ao menos um serviço ao contrato';
  end if;

  -- Sinaliza que a ativação está sendo realizada pela função autorizada
  perform set_config('app.activating_contract', 'on', true);

  update contracts set status = 'ativo', activated_at = now(), activated_by = auth.uid(),
         start_date = coalesce(start_date, current_date)
   where id = c.id;

  select id into v_client_active from options where set_key = 'client_status' and label = 'Ativo';
  update clients set status_id = coalesce(v_client_active, status_id) where id = c.client_id
  returning name into v_client_name;

  if c.lead_id is not null then
    update leads set client_id = c.client_id,
           stage_id = coalesce((select id from options where set_key='lead_stage' and label='Fechado'), stage_id)
     where id = c.lead_id;
  end if;

  select id into v_status_open from options where set_key = 'project_status' order by sort limit 1;
  select id into v_task_status from options where set_key = 'task_status' order by sort limit 1;

  insert into projects (client_id, contract_id, name, objective, owner_id, status_id, priority, start_date)
  values (c.client_id, c.id, 'Onboarding · ' || v_client_name, 'Colocar o cliente em operação',
          coalesce(p_owner, auth.uid()), v_status_open, 'alta', current_date)
  returning id into v_project;

  for it in
    select ti.title, ti.due_offset_days, ti.sort, t.service_id
    from checklist_template_items ti
    join checklist_templates t on t.id = ti.template_id and t.active
    where t.service_id is null
       or t.service_id in (select service_id from contract_items where contract_id = c.id)
    order by (t.service_id is not null), ti.sort
  loop
    insert into tasks (project_id, client_id, title, owner_id, status_id, start_date, due_date)
    values (v_project, c.client_id, it.title, coalesce(p_owner, auth.uid()), v_task_status, current_date,
            case when it.due_offset_days is not null then current_date + it.due_offset_days end);
  end loop;

  return v_project;
end $$;

-- Trigger que bloqueia bypass de status no contrato
create or replace function public.guard_contract_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Bloqueia voltar de ativo/cancelado/encerrado para rascunho
  if old.status <> 'rascunho' and new.status = 'rascunho' then
    raise exception 'Contratos ativos ou finalizados não podem voltar para rascunho';
  end if;

  -- Bloqueia ativar diretamente sem passar por activate_contract()
  if old.status = 'rascunho' and new.status = 'ativo' then
    if coalesce(nullif(current_setting('app.activating_contract', true), ''), 'off') <> 'on' then
      raise exception 'Contratos só podem ser ativados através da função oficial de ativação';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists contracts_guard_status on public.contracts;
create trigger contracts_guard_status before update on public.contracts
for each row execute function public.guard_contract_status();

-- 3. Bloqueio de Acesso a Usuários Inativos / Pendentes
-- Troca using (true) por using (public.is_active_user()) nas tabelas estruturais
drop policy if exists "ler cargos" on public.roles;
create policy "ler cargos" on public.roles for select to authenticated using (public.is_active_user());

drop policy if exists "ler módulos" on public.modules;
create policy "ler módulos" on public.modules for select to authenticated using (public.is_active_user());

drop policy if exists "ler permissões de cargo" on public.role_permissions;
create policy "ler permissões de cargo" on public.role_permissions for select to authenticated using (public.is_active_user());

drop policy if exists "ler opções" on public.options;
create policy "ler opções" on public.options for select to authenticated using (public.is_active_user());

drop policy if exists "ler serviços" on public.services;
create policy "ler serviços" on public.services for select to authenticated using (public.is_active_user());

drop policy if exists "ler ofertas" on public.service_offers;
create policy "ler ofertas" on public.service_offers for select to authenticated using (public.is_active_user());

drop policy if exists "ler modelos de checklist" on public.checklist_templates;
create policy "ler modelos de checklist" on public.checklist_templates for select to authenticated using (public.is_active_user());

drop policy if exists "ler itens de checklist" on public.checklist_template_items;
create policy "ler itens de checklist" on public.checklist_template_items for select to authenticated using (public.is_active_user());

-- Comentários: exige usuário ativo e registro comentado visível ao usuário
drop policy if exists "comentar" on public.comments;
create policy "comentar" on public.comments for insert to authenticated with check (
  author_id = auth.uid()
  and public.is_active_user()
  and (
    case entity
      when 'task'    then exists (select 1 from public.tasks    x where x.id = entity_id)
      when 'project' then exists (select 1 from public.projects x where x.id = entity_id)
      when 'lead'    then exists (select 1 from public.leads    x where x.id = entity_id)
      when 'client'  then exists (select 1 from public.clients  x where x.id = entity_id)
      when 'content' then exists (select 1 from public.contents x where x.id = entity_id)
    end
  )
);

-- 4. Revogação de permissões execute de anon em rotinas
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on routines from anon;

-- 5. Triggers de Auditoria para tabelas faltantes
drop trigger if exists task_collaborators_audit on public.task_collaborators;
create trigger task_collaborators_audit after insert or update or delete on public.task_collaborators
for each row execute function public.audit();

drop trigger if exists task_checklist_audit on public.task_checklist;
create trigger task_checklist_audit after insert or update or delete on public.task_checklist
for each row execute function public.audit();

drop trigger if exists comments_audit on public.comments;
create trigger comments_audit after insert or update or delete on public.comments
for each row execute function public.audit();

-- 6. Proteção contra desativação/lockout do último administrador
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.active is distinct from old.active
          or new.weekly_capacity_hours is distinct from old.weekly_capacity_hours) then
    raise exception 'Apenas administradores alteram cargo, status ou capacidade';
  end if;

  if (old.role = 'ceo' and (new.role <> 'ceo' or not new.active)) then
    if (select count(*) from profiles where role = 'ceo' and active and id <> old.id) = 0 then
      raise exception 'Não é permitido desativar ou remover o cargo do único administrador ativo';
    end if;
  end if;

  return new;
end $$;


-- =========================================
-- 20261119000800_correcoes_rls_2.sql
-- =========================================
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


-- =========================================
-- 20261119000900_correcoes_rls_3.sql
-- =========================================
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


-- =========================================
-- 20261119001000_grants_service_role.sql
-- =========================================
-- =====================================================================
-- Na.Nu · Permissões do papel service_role
-- Projetos Supabase novos não concedem mais acesso automático às tabelas
-- para os papéis da API. A migration 400 liberou apenas anon/authenticated,
-- e o service_role (usado pela função create-user com a chave de serviço)
-- ficou sem SELECT/UPDATE: a leitura do cargo voltava vazia e a criação de
-- usuário falhava com "Cargo informado não existe".
-- O service_role ignora RLS por definição; a chave fica só nos secrets das
-- Edge Functions, nunca no frontend.
-- =====================================================================

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;


-- =========================================
-- 20261119001100_contas_a_pagar.sql
-- =========================================
-- =====================================================================
-- Na.Nu · Contas a pagar
-- Despesas da agência (aluguel, folha, impostos, fornecedores...), com
-- vencimento, situação e categoria editável. Permissão: módulo Financeiro,
-- a mesma regra dos recebimentos (payments).
-- "Atrasada" não é gravada: é uma conta em aberto com vencimento passado.
-- =====================================================================

-- Categorias (editáveis em Configurações → Etapas e status)
insert into public.options (set_key, label, color, sort, is_final) values
  ('bill_category', 'Aluguel e condomínio',  '#5b4bdb', 1, false),
  ('bill_category', 'Folha de pagamento',    '#ea5c2a', 2, false),
  ('bill_category', 'Impostos e taxas',      '#c0392b', 3, false),
  ('bill_category', 'Fornecedores',          '#0e9aa7', 4, false),
  ('bill_category', 'Software e assinaturas','#2f80ed', 5, false),
  ('bill_category', 'Marketing e anúncios',  '#d6336c', 6, false),
  ('bill_category', 'Equipamentos',          '#b97d00', 7, false),
  ('bill_category', 'Outros',                '#55555f', 8, false)
on conflict (set_key, label) do nothing;

create table public.bills (
  id           uuid primary key default gen_random_uuid(),
  description  text not null check (char_length(description) between 1 and 200),
  supplier     text check (char_length(supplier) <= 200),          -- fornecedor / favorecido
  category_id  uuid references public.options(id),
  amount       numeric(12,2) not null check (amount >= 0),
  due_date     date not null,
  status       text not null default 'aberto' check (status in ('aberto','pago','cancelado')),
  paid_at      date,
  method       text check (method in ('pix','boleto','cartao','transferencia','debito','dinheiro')),
  notes        text check (char_length(notes) <= 2000),
  -- contas repetidas/parceladas criadas juntas compartilham a série
  series_id    uuid,
  installment  int check (installment >= 1),
  installments int check (installments >= 1),
  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- conta paga sempre tem data de pagamento; conta não paga não tem
  constraint bills_paid_at_check check ((status = 'pago') = (paid_at is not null)),
  constraint bills_parcela_dentro_do_total check (installment is null or installments is null or installment <= installments)
);
create index bills_due_idx    on public.bills (due_date);
create index bills_open_idx   on public.bills (due_date) where status = 'aberto';
create index bills_series_idx on public.bills (series_id) where series_id is not null;

create trigger bills_touch before update on public.bills
for each row execute function public.touch_updated_at();
create trigger bills_audit after insert or update or delete on public.bills
for each row execute function public.audit();

alter table public.bills enable row level security;

create policy "financeiro lê contas a pagar" on public.bills for select to authenticated
  using (public.can_read('financeiro'));
create policy "financeiro cria contas a pagar" on public.bills for insert to authenticated
  with check (public.can_write('financeiro'));
create policy "financeiro edita contas a pagar" on public.bills for update to authenticated
  using (public.can_write('financeiro')) with check (public.can_write('financeiro'));
create policy "financeiro exclui contas a pagar" on public.bills for delete to authenticated
  using (public.can_delete('financeiro'));

-- Acesso pela API: só usuários logados (a RLS acima decide o resto) e a chave de serviço.
revoke all on public.bills from anon;
grant select, insert, update, delete on public.bills to authenticated;
grant all on public.bills to service_role;


-- =========================================
-- 20261119001200_notificacoes.sql
-- =========================================
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
