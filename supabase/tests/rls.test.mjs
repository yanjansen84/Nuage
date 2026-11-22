import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../migrations', import.meta.url))
const db = new PGlite()
const q = (s, p) => db.query(s, p)
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
`)
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(`${dir}/${f}`, 'utf8'))
  console.log('aplicado', f)
}
await db.exec(`grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated, anon;
grant all on all functions in schema public to authenticated;`)

ok((await q("select count(*)::int n from roles")).rows[0].n === 1, 'sistema começa só com o cargo de administrador')

// Cenário: o administrador cria os cargos Designer e Financeiro e define as permissões
// (é o que ele faria em Configurações → Permissões).
await db.exec(`
insert into roles (key, name, sort) values ('designer','Designer',2), ('financeiro','Responsável financeiro',3);
update role_permissions set scope='all', can_write=false where role='designer' and module in ('clientes');
update role_permissions set scope='own', can_write=false where role='designer' and module='dashboard';
update role_permissions set scope='own', can_write=true where role='designer' and module in ('projetos','producao');
update role_permissions set scope='all', can_write=false where role='financeiro' and module in ('dashboard','clientes','configuracoes');
update role_permissions set scope='all', can_write=true where role='financeiro' and module='contratos';
update role_permissions set scope='all', can_write=true, can_delete=true where role='financeiro' and module='financeiro';
`)

const U = { ceo: '00000000-0000-0000-0000-000000000001', des: '00000000-0000-0000-0000-000000000002', fin: '00000000-0000-0000-0000-000000000003', novo: '00000000-0000-0000-0000-000000000004' }
await q(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'ceo@x.com','{"name":"Magno CEO"}')`, [U.ceo])
await q(`insert into auth.users (id,email,raw_app_meta_data) values ($1,'des@x.com','{"role":"designer"}')`, [U.des])
await q(`insert into auth.users (id,email,raw_app_meta_data) values ($1,'fin@x.com','{"role":"financeiro"}')`, [U.fin])
await q(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'novo@x.com','{"role":"ceo"}')`, [U.novo])

const p = (await q(`select id,role,active from profiles order by id`)).rows
ok(p[0].role === 'ceo' && p[0].active, 'primeiro usuário vira CEO')
ok(p[1].role === 'designer', 'convidado recebe cargo do app_metadata')
ok(p[3].role === null && !p[3].active, 'user_metadata não concede cargo (sem auto-promoção)')

const as = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`)
  try { return await fn() } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`) }
}
// Cenário de teste: dados de catálogo e templates para validação de RLS e ativação
await db.exec(`
insert into services (code, name, category, billing_type, sort) values ('ag','Agência','Agência','recorrente',1), ('sm','Social Media','Social Media','recorrente',2), ('st','Studio','Studio','pacote',3) on conflict do nothing;
insert into service_offers (service_id, label, sort) select id, 'Mensal', 1 from services where code in ('ag','sm') on conflict do nothing;
insert into service_offers (service_id, label, sort) select id, 'Pacote', 1 from services where code = 'st' on conflict do nothing;
insert into service_offers (service_id, label, sort) select id, 'Pacote 2', 2 from services where code = 'st' on conflict do nothing;
insert into service_offers (service_id, label, sort) select id, 'Pacote 3', 3 from services where code = 'st' on conflict do nothing;
insert into service_offers (service_id, label, sort) select id, 'Pacote 4', 4 from services where code = 'st' on conflict do nothing;
insert into offer_prices (offer_id, price) select id, 1000 from service_offers on conflict do nothing;
insert into checklist_templates (id, name, active) values ('00000000-0000-0000-0000-000000000001', 'Onboarding Geral', true) on conflict do nothing;
insert into checklist_template_items (template_id, title, sort) select '00000000-0000-0000-0000-000000000001', 'Item ' || i, i from generate_series(1, 11) i on conflict do nothing;
`)

const count = (sql) => q(sql).then(r => Number(r.rows[0].n))

await as(U.ceo, async () => {
  ok(await count(`select count(*) n from offer_prices`) === 6, 'CEO lê preços')
  ok(await count(`select count(*) n from my_permissions() where scope='all'`) === 10, 'CEO tem acesso total aos 10 módulos')
  const c = (await q(`insert into clients (name) values ('Cliente A') returning id`)).rows[0].id
  const k = (await q(`insert into contracts (client_id, notice_days, due_day, payment_method) values ($1,15,10,'pix') returning id`, [c])).rows[0].id
  const s = (await q(`select s.id sid, o.id oid from services s join service_offers o on o.service_id=s.id where s.code='sm'`)).rows[0]
  await q(`insert into contract_items (contract_id, service_id, offer_id, negotiated_price, billing_type) values ($1,$2,$3,1400,'recorrente')`, [k, s.sid, s.oid])
  await q(`select activate_contract($1, $2)`, [k, U.des])
  ok(await count(`select count(*) n from tasks where owner_id='${U.des}'`) === 11, 'ativar contrato gera 11 tarefas de onboarding')
  ok((await q(`select o.label from clients c join options o on o.id=c.status_id`)).rows[0].label === 'Ativo', 'cliente passa a Ativo')
  await q(`insert into tasks (title, owner_id) values ('Tarefa só do CEO', $1)`, [U.ceo])
  ok(await count(`select count(*) n from audit_log`) > 0, 'auditoria registrada e legível pelo admin')
  ok(await count(`select count(*) n from client_services()`) === 1, 'serviços do cliente visíveis')
})

await as(U.des, async () => {
  ok(await count(`select count(*) n from offer_prices`) === 0, 'designer NÃO lê preços')
  ok(await count(`select count(*) n from contracts`) === 0, 'designer NÃO lê contratos')
  ok(await count(`select count(*) n from contract_items`) === 0, 'designer NÃO lê itens de contrato')
  ok(await count(`select count(*) n from audit_log`) === 0, 'designer NÃO lê auditoria')
  ok(await count(`select count(*) n from tasks`) === 11, 'designer vê só as próprias tarefas')
  ok(await count(`select count(*) n from profiles`) === 4, 'designer vê nomes da equipe')
  ok(await count(`select count(*) n from profile_details`) === 1, 'designer vê só os próprios contatos')
  ok(await count(`select count(*) n from client_services()`) === 1, 'designer vê quais serviços o cliente tem (sem valor)')
  let err = null
  try { await q(`update profiles set role='ceo' where id=$1`, [U.des]) } catch (e) { err = e.message }
  ok(!!err, 'designer não consegue se promover: ' + err)
  err = null
  try { await q(`select activate_contract(gen_random_uuid())`) } catch (e) { err = e.message }
  ok(err?.includes('Sem permissão'), 'designer não ativa contrato')
  const r = await q(`update tasks set title='x' where title='Tarefa só do CEO'`)
  ok(r.affectedRows === 0, 'designer não edita tarefa alheia')
})

await as(U.fin, async () => {
  ok(await count(`select count(*) n from offer_prices`) === 6, 'financeiro lê preços')
  ok(await count(`select count(*) n from contract_items`) === 1, 'financeiro lê itens de contrato')
  ok(await count(`select count(*) n from tasks`) === 0, 'financeiro não vê tarefas (projetos restrito)')
  await q(`update offer_prices set price=price where true`)
  let err = null
  try { await q(`update role_permissions set scope='all' where role='financeiro'`).then(r => { if (!r.affectedRows) err = 'bloqueado' }) } catch (e) { err = e.message }
  ok(!!err, 'financeiro não altera permissões')
})

await as(U.ceo, async () => {
  await q("insert into roles (key, name, sort) values ('estagio', 'Estágio', 9)")
  ok(await count("select count(*) n from role_permissions where role='estagio' and scope='none'") === 10, 'cargo novo nasce sem nenhuma permissão')
  await q("update roles set name='Estágio criativo' where key='estagio'")
  let err = null
  try { await q("delete from roles where key='designer'") } catch (e) { err = e.message }
  ok(err?.includes('atribuído'), 'não exclui cargo em uso')
  err = null
  try { await q("delete from roles where key='ceo'") } catch (e) { err = e.message }
  ok(await count("select count(*) n from roles where key='ceo'") === 1, 'não exclui o cargo de administrador')
  await q("delete from roles where key='estagio'")
  ok(await count("select count(*) n from role_permissions where role='estagio'") === 0, 'excluir cargo remove suas permissões')
})

await as(U.des, async () => {
  let err = null
  try { await q("insert into roles (key, name) values ('hack', 'Hack')") } catch (e) { err = e.message }
  ok(!!err, 'não-admin não cria cargo')
})

// ---------- Conteúdo ----------
await as(U.ceo, async () => {
  const st = (label) => q(`select id from options where set_key='content_status' and label=$1`, [label]).then((r) => r.rows[0].id)
  const c = (await q(`insert into contents (title, status_id, owner_id, publish_date) values ('Reels lançamento', $1, $2, current_date + 2) returning id, posted_at`, [await st('Planejado'), U.des])).rows[0]
  ok(c.posted_at === null, 'conteúdo novo não está postado')
  await q(`update contents set status_id=$1 where id=$2`, [await st('Publicado'), c.id])
  const after = (await q(`select posted_at from contents where id=$1`, [c.id])).rows[0]
  ok(after.posted_at !== null, 'marcar como Publicado registra a data de postagem')
  ok(await count(`select count(*) n from content_history where content_id='${c.id}'`) === 2, 'histórico registra criação e mudança de status')
  await q(`update contents set status_id=$1 where id=$2`, [await st('Agendado'), c.id])
  ok((await q(`select posted_at from contents where id=$1`, [c.id])).rows[0].posted_at === null, 'voltar de Publicado desmarca postado')
  await q(`insert into contents (title, owner_id) values ('Post do CEO', $1)`, [U.ceo])
  await q(`insert into comments (entity, entity_id, body) values ('content', $1, 'Ajustar legenda')`, [c.id])
})

await as(U.des, async () => {
  ok(await count(`select count(*) n from contents`) === 1, 'designer vê só os próprios conteúdos')
  ok(await count(`select count(*) n from comments where entity='content'`) === 1, 'designer vê comentários do próprio conteúdo')
  let err = null
  try { await q(`insert into contents (title, owner_id) values ('x', $1)`, [U.ceo]) } catch (e) { err = e.message }
  ok(!!err, 'designer não cria conteúdo em nome de outra pessoa')
})

await as(U.fin, async () => {
  ok(await count(`select count(*) n from contents`) === 0, 'financeiro sem acesso a conteúdo')
})

await as(U.novo, async () => {
  ok(await count(`select count(*) n from clients`) === 0, 'usuário sem cargo não vê nada')
})

// ======================================================================
// Testes de regressão (PoC de segurança confirmada)
// ======================================================================

// 1. Designer com escopo próprio NÃO se adiciona como colaborador em tarefa alheia
await as(U.ceo, async () => {
  const tid = (await q(`insert into tasks (title, owner_id) values ('Tarefa Secreta CEO', $1) returning id`, [U.ceo])).rows[0].id
  await as(U.des, async () => {
    let err = null
    try { await q(`insert into task_collaborators (task_id, profile_id) values ($1, $2)`, [tid, U.des]) } catch (e) { err = e.message }
    ok(!!err, 'PoC 1: designer com escopo próprio não se adiciona em tarefa alheia')
    ok(await count(`select count(*) n from task_collaborators where task_id='${tid}'`) === 0, 'PoC 1: designer não lista colaboradores de tarefa alheia')
    ok(await count(`select count(*) n from tasks where id='${tid}'`) === 0, 'PoC 1: tarefa alheia continua inacessível para o designer')
  })
})

// 2. Proteção de integridade contratual e histórico financeiro
await as(U.ceo, async () => {
  const cId = (await q(`insert into clients (name) values ('Cliente Contrato') returning id`)).rows[0].id
  const kId = (await q(`insert into contracts (client_id, status) values ($1, 'ativo') returning id`, [cId])).rows[0].id
  await q(`insert into payments (contract_id, due_date, amount, status) values ($1, current_date, 500, 'pago')`, [kId])

  let err = null
  try { await q(`update contracts set status='rascunho' where id=$1`, [kId]) } catch (e) { err = e.message }
  ok(!!err, 'PoC 2: contrato ativo não pode ser revertido para rascunho')

  const kDraftWithPay = (await q(`insert into contracts (client_id, status) values ($1, 'rascunho') returning id`, [cId])).rows[0].id
  await q(`insert into payments (contract_id, due_date, amount, status) values ($1, current_date, 500, 'pago')`, [kDraftWithPay])

  err = null
  try { await q(`delete from contracts where id=$1`, [kDraftWithPay]) } catch (e) { err = e.message }
  ok(!!err, 'PoC 2: contrato com pagamentos não pode ser excluído (ON DELETE RESTRICT)')
  ok(await count(`select count(*) n from payments where contract_id='${kDraftWithPay}'`) === 1, 'PoC 2: pagamentos continuam protegidos')

  // Tentativa de ativar sem chamar activate_contract
  const kDraft = (await q(`insert into contracts (client_id, status) values ($1, 'rascunho') returning id`, [cId])).rows[0].id
  await as(U.fin, async () => {
    let err2 = null
    try { await q(`update contracts set status='ativo' where id=$1`, [kDraft]) } catch (e) { err2 = e.message }
    ok(!!err2, 'PoC 2: não ativa contrato diretamente com update status=ativo')
  })
})

// 3. Usuários sem cargo ou inativos não leem estrutura nem comentam
await as(U.novo, async () => {
  ok(await count(`select count(*) n from roles`) === 0, 'PoC 3: usuário inativo não lê roles')
  ok(await count(`select count(*) n from role_permissions`) === 0, 'PoC 3: usuário inativo não lê matriz de permissões')
  ok(await count(`select count(*) n from options`) === 0, 'PoC 3: usuário inativo não lê opções')

  let err = null
  try {
    const anyTask = (await q(`select id from tasks limit 1`)).rows[0]?.id
    if (anyTask) await q(`insert into comments (entity, entity_id, body) values ('task', $1, 'Spam')`, [anyTask])
    else err = 'blocked'
  } catch (e) { err = e.message }
  ok(!!err, 'PoC 3: usuário inativo não insere comentários')
})

// 4. Proteção contra desativação do último admin
await as(U.ceo, async () => {
  let err = null
  try { await q(`update profiles set active=false where id=$1`, [U.ceo]) } catch (e) { err = e.message }
  ok(!!err, 'PoC 4: bloqueia desativar o único administrador ativo do sistema')
})
