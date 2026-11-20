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
