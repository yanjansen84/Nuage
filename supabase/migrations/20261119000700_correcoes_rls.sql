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
