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
