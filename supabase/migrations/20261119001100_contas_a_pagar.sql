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
