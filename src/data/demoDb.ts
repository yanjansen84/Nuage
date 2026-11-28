// Banco em memória do modo demonstração. Imita as políticas RLS do
// Supabase para que "Ver como" mostre exatamente o que cada cargo veria.
import { DEMO_USER_ID, demoSeed } from '../lib/demo'
import type { Db, Match } from './db'
import type { ClientService, PublicApprovalInfo, Table, Tables } from './types'

type Store = { [K in Table]: Tables[K][] }
type AnyRow = Record<string, unknown>
const KEY = 'nanu.demo.db.v9'

let store: Store = load()
function load(): Store {
  try {
    // descarta dados de versões anteriores do demo
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('nanu.demo.db.') && k !== KEY) sessionStorage.removeItem(k)
    const s = sessionStorage.getItem(KEY)
    if (s) return JSON.parse(s)
  } catch { /* ignora */ }
  return demoSeed()
}
function persist() {
  try { sessionStorage.setItem(KEY, JSON.stringify(store)) } catch { /* ignora */ }
}
export function resetDemo() { store = demoSeed(); persist() }

const rows = <T extends Table>(t: T) => store[t] as unknown as AnyRow[]
const me = () => DEMO_USER_ID
const today = () => new Date().toLocaleDateString('sv-SE')
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))
const delay = () => new Promise((r) => setTimeout(r, 120))
const DENIED = 'Você não tem permissão para esta ação.'

// ---------- permissões efetivas ----------
export function demoPerm(module: string) {
  const p = rows('profiles').find((x) => x.id === me())
  if (!p?.active) return { scope: 'none', w: false, d: false }
  const rp = rows('role_permissions').find((x) => x.role === p.role && x.module === module)
  const up = rows('user_permissions').find((x) => x.user_id === me() && x.module === module)
  const scope = (up?.scope ?? rp?.scope ?? 'none') as string
  return { scope, w: Boolean(up?.can_write ?? rp?.can_write ?? false), d: Boolean(up?.can_delete ?? rp?.can_delete ?? false) }
}
const read = (m: string) => demoPerm(m).scope !== 'none'
const readAll = (m: string) => demoPerm(m).scope === 'all'
const write = (m: string) => { const p = demoPerm(m); return p.scope !== 'none' && p.w }
const writeAll = (m: string) => { const p = demoPerm(m); return p.scope === 'all' && p.w }
const del = (m: string) => { const p = demoPerm(m); return p.scope !== 'none' && p.d }
const admin = () => writeAll('configuracoes')

const projectMine = (pid: unknown) => {
  const p = rows('projects').find((x) => x.id === pid)
  return !!p && (p.owner_id === me() || p.created_by === me()
    || rows('project_members').some((m) => m.project_id === pid && m.profile_id === me()))
}
const taskMine = (t: AnyRow) => t.owner_id === me() || t.created_by === me()
  || rows('task_collaborators').some((c) => c.task_id === t.id && c.profile_id === me())
const contentMine = (c: AnyRow) => c.owner_id === me() || c.reviewer_id === me() || c.created_by === me()
const strategyMine = (s: AnyRow) => s.owner_id === me() || s.created_by === me()
const visible = (table: Table, id: unknown) => rows(table).some((r) => r.id === id && canRead(table, r))

function canRead(t: Table, r: AnyRow): boolean {
  switch (t) {
    case 'profile_details': return r.id === me() || read('equipe')
    case 'user_permissions': return r.user_id === me() || admin()
    case 'audit_log': return admin()
    case 'notifications': case 'push_subscriptions': return r.user_id === me()
    case 'offer_prices': case 'payments': case 'bills': return read('financeiro')
    case 'lead_values': return read('financeiro') && read('crm')
    case 'contracts': return read('contratos')
    case 'contract_items': return read('contratos') && read('financeiro')
    case 'clients': case 'client_briefings': case 'campaigns': return read('clientes')
    case 'campaign_budgets': return read('financeiro') && read('clientes')
    case 'strategies': return readAll('estrategia') || (read('estrategia') && strategyMine(r))
    case 'leads': return readAll('crm') || (read('crm') && (r.owner_id === me() || r.created_by === me()))
    case 'projects': return readAll('projetos') || (read('projetos') && projectMine(r.id))
    case 'project_members': case 'task_collaborators': case 'task_dependencies': return read('projetos')
    case 'tasks': return readAll('projetos') || (read('projetos') && taskMine(r))
    case 'contents': return readAll('producao') || (read('producao') && contentMine(r))
    case 'content_history': case 'content_approval_links': case 'content_approvals': return visible('contents', r.content_id)
    case 'task_checklist': return visible('tasks', r.task_id)
    case 'comments': {
      const map = { task: 'tasks', project: 'projects', lead: 'leads', client: 'clients', content: 'contents', strategy: 'strategies' } as const
      return visible(map[r.entity as keyof typeof map], r.entity_id)
    }
    default: return true
  }
}

type Op = 'insert' | 'update' | 'delete'
function canWrite(t: Table, r: AnyRow, op: Op): boolean {
  switch (t) {
    case 'profiles': return op === 'update' && (r.id === me() || admin())
    case 'profile_details': return op === 'update' && (r.id === me() || writeAll('equipe'))
    case 'roles': return admin() && !(op === 'delete' && r.key === 'ceo')
    case 'modules': case 'audit_log': case 'content_approvals': return false
    // como no banco: a pessoa só marca como lida e dispensa as próprias; quem cria é o sistema
    case 'notifications': return op !== 'insert' && r.user_id === me()
    case 'push_subscriptions': return r.user_id === me()
    case 'role_permissions': case 'user_permissions': return admin()
    case 'options': case 'services': case 'service_offers': case 'checklist_templates': case 'checklist_template_items':
      return writeAll('configuracoes')
    case 'offer_prices': return write('financeiro') && read('configuracoes')
    case 'clients': case 'client_briefings': case 'campaigns': return op === 'delete' ? del('clientes') : write('clientes')
    case 'campaign_budgets': return write('financeiro') && write('clientes')
    case 'strategies':
      if (op === 'insert') return writeAll('estrategia') || (write('estrategia') && (r.owner_id ?? me()) === me())
      if (op === 'delete') return del('estrategia') && (readAll('estrategia') || r.created_by === me())
      return writeAll('estrategia') || (write('estrategia') && strategyMine(r))
    case 'leads':
      if (op === 'delete') return del('crm')
      if (op === 'insert') return write('crm')
      return writeAll('crm') || (write('crm') && (r.owner_id === me() || r.created_by === me()))
    case 'lead_values': return write('financeiro') && write('crm')
    case 'contracts': return op === 'delete' ? del('contratos') && r.status === 'rascunho' : write('contratos')
    case 'contract_items': {
      const c = rows('contracts').find((x) => x.id === r.contract_id)
      // como no banco: em rascunho com Contratos + Financeiro; contrato firmado, só o administrador (correção)
      return admin() || (write('contratos') && write('financeiro') && c?.status === 'rascunho')
    }
    case 'payments': return write('financeiro')
    case 'bills': return op === 'delete' ? del('financeiro') : write('financeiro')
    case 'projects':
      if (op === 'insert') return writeAll('projetos')
      if (op === 'delete') return del('projetos') && readAll('projetos')
      return writeAll('projetos') || (write('projetos') && projectMine(r.id))
    case 'project_members': return writeAll('projetos')
    case 'tasks':
      if (op === 'insert') return writeAll('projetos') || (write('projetos') && (r.owner_id ?? me()) === me())
      if (op === 'delete') return del('projetos') && (readAll('projetos') || r.created_by === me())
      return writeAll('projetos') || (write('projetos') && taskMine(r))
    case 'task_collaborators': case 'task_dependencies': return write('projetos')
    case 'task_checklist': return write('projetos') && visible('tasks', r.task_id)
    case 'comments': return op === 'insert' ? r.author_id === me() : (r.author_id === me() || admin())
    case 'events': return op === 'insert' ? true : (r.created_by === me() || admin())
    case 'contents':
      if (op === 'insert') return writeAll('producao') || (write('producao') && (r.owner_id ?? me()) === me())
      if (op === 'delete') return del('producao') && (readAll('producao') || r.created_by === me())
      return writeAll('producao') || (write('producao') && contentMine(r))
    case 'content_approval_links':
      return (op === 'delete' ? del('producao') : write('producao')) && visible('contents', r.content_id)
    default: return false
  }
}

// ---------- regras que no banco são triggers ----------
const HAS_ID: Table[] = ['profiles', 'profile_details', 'options', 'services', 'service_offers', 'checklist_templates',
  'checklist_template_items', 'clients', 'campaigns', 'strategies', 'leads', 'contracts', 'contract_items', 'payments',
  'bills', 'projects', 'tasks', 'task_checklist', 'comments', 'events', 'contents', 'content_approval_links',
  'content_approvals', 'notifications', 'push_subscriptions']

function defaults(t: Table, r: AnyRow): AnyRow {
  const out: AnyRow = { ...r }
  if (HAS_ID.includes(t) && !out.id) out.id = uuid()
  if (['clients', 'campaigns', 'strategies', 'leads', 'contracts', 'projects', 'tasks', 'events', 'contents', 'bills', 'content_approval_links'].includes(t) && out.created_by === undefined) out.created_by = me()
  if (['clients', 'campaigns', 'strategies', 'leads', 'contracts', 'tasks', 'comments', 'events', 'contents', 'bills', 'content_approval_links', 'content_approvals', 'push_subscriptions'].includes(t) && !out.created_at) out.created_at = new Date().toISOString()
  if (t === 'client_briefings') { out.updated_by ??= me(); out.updated_at = new Date().toISOString() }
  if (t === 'push_subscriptions' && !out.user_id) out.user_id = me()
  if (t === 'strategies') { out.status ??= 'rascunho'; out.pillars ??= [] }
  if (t === 'content_approval_links') {
    out.token ??= (uuid() + uuid()).replace(/-/g, '')
    out.expires_at ??= new Date(Date.now() + 14 * 86400_000).toISOString()
    out.revoked_at ??= null
  }
  if (t === 'comments' && !out.author_id) out.author_id = me()
  if (t === 'comments' && out.resolved === undefined) out.resolved = false
  if (t === 'tasks') { out.priority ??= 'media'; out.parent_id ??= null; out.done_at ??= null; out.recurrence_source_id ??= null }
  if (t === 'projects') out.priority ??= 'media'
  if (t === 'bills') { out.status ??= 'aberto'; out.paid_at ??= null }
  if (t === 'contracts') {
    out.status ??= 'rascunho'; out.renewal ??= 'automatica'; out.templates ??= ['agencia']
    out.portfolio_authorized ??= true; out.forum_city ??= 'São Luís - MA'
  }
  if (t === 'payments') out.status ??= 'previsto'
  if (t === 'options') { out.active ??= true; out.is_final ??= false }
  if (t === 'services' || t === 'service_offers') { out.active ??= true; if (t === 'services') out.deliverables ??= [] }
  if (t === 'task_checklist') out.done ??= false
  return out
}
function shiftDate(isoDate: string, freq: string) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d, 12)
  if (freq === 'daily') dt.setDate(dt.getDate() + 1)
  else if (freq === 'weekly') dt.setDate(dt.getDate() + 7)
  else dt.setMonth(dt.getMonth() + 1)
  return dt.toLocaleDateString('sv-SE')
}

function generateNextRecurringTask(t: AnyRow) {
  const rec = t.recurrence as { freq?: string } | null
  if (!t.done_at || t.parent_id || !rec?.freq) return
  if (rows('tasks').some((x) => x.recurrence_source_id === t.id)) return
  const openStatus = rows('options').filter((o) => o.set_key === 'task_status' && !o.is_final && o.active)
    .sort((a, b) => Number(a.sort) - Number(b.sort))[0]?.id ?? null
  const nextId = uuid()
  const nextTask = defaults('tasks', {
    id: nextId, project_id: t.project_id, client_id: t.client_id, title: t.title, description: t.description,
    owner_id: t.owner_id, status_id: openStatus, priority: t.priority,
    start_date: t.start_date ? shiftDate(String(t.start_date), rec.freq) : today(),
    due_date: t.due_date ? shiftDate(String(t.due_date), rec.freq) : null,
    effort_hours: t.effort_hours, recurrence: t.recurrence, recurrence_source_id: t.id,
  })
  rows('tasks').push(nextTask)
  for (const c of rows('task_collaborators').filter((x) => x.task_id === t.id))
    rows('task_collaborators').push({ task_id: nextId, profile_id: c.profile_id })
  for (const chk of rows('task_checklist').filter((x) => x.task_id === t.id))
    rows('task_checklist').push({ id: uuid(), task_id: nextId, title: chk.title, done: false, sort: chk.sort })
}

function syncTaskDone(r: AnyRow, wasDone?: boolean) {
  if (!('status_id' in r)) return
  const fin = rows('options').find((o) => o.id === r.status_id)?.is_final
  if (fin && !r.done_at) r.done_at = new Date().toISOString()
  if (!fin) r.done_at = null
  if (!wasDone && r.done_at) generateNextRecurringTask(r)
}
function syncContent(r: AnyRow) {
  if (!('status_id' in r)) return
  const fin = rows('options').find((o) => o.id === r.status_id)?.is_final
  if (fin && !r.posted_at) r.posted_at = new Date().toISOString()
  if (!fin) r.posted_at = null
}
let histId = 0
function logContent(r: AnyRow, fromStatus: unknown) {
  const label = (id: unknown) => (rows('options').find((o) => o.id === id)?.label as string) ?? null
  rows('content_history').push({ id: ++histId + Date.now(), content_id: r.id, at: new Date().toISOString(), actor: me(),
    from_label: fromStatus === undefined ? null : label(fromStatus), to_label: label(r.status_id) })
}
function guardProfile(before: AnyRow, patch: AnyRow) {
  if (admin()) return
  for (const k of ['role', 'active', 'weekly_capacity_hours'])
    if (k in patch && patch[k] !== before[k]) throw new Error('Apenas administradores alteram cargo, status ou capacidade')
}

let auditId = 0
function audit(t: Table, action: string, oldR: AnyRow | null, newR: AnyRow | null) {
  if (t === 'audit_log') return
  const r = newR ?? oldR ?? {}
  rows('audit_log').unshift({
    id: ++auditId, at: new Date().toISOString(), actor: me(), action, table_name: t,
    record_id: String(r.id ?? r.user_id ?? r.role ?? r.offer_id ?? r.lead_id ?? ''), old_data: oldR, new_data: newR,
  })
  if (rows('audit_log').length > 300) rows('audit_log').length = 300
}

const matches = (r: AnyRow, m?: AnyRow) => !m || Object.entries(m).every(([k, v]) => r[k] === v)
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

// ---------- implementação ----------
export const demoDb: Db = {
  async list(table, match, order, limit) {
    await delay()
    let out = rows(table).filter((r) => matches(r, match as AnyRow) && canRead(table, r))
    if (order) {
      const { column, ascending = true } = order
      out = [...out].sort((a, b) => {
        const x = a[column] ?? '', y = b[column] ?? ''
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1)
      })
    }
    if (limit) out = out.slice(0, limit)
    return clone(out) as never
  },
  async page(table, { match, order, from, to }) {
    const all = await demoDb.list(table, match, order)
    return { rows: all.slice(from, to + 1), total: all.length }
  },
  async insert(table, row) {
    await delay()
    const r = defaults(table, row as AnyRow)
    if (!canWrite(table, r, 'insert')) throw new Error(DENIED)
    if (table === 'tasks') syncTaskDone(r)
    if (table === 'contents') syncContent(r)
    rows(table).push(r); audit(table, 'insert', null, r)
    if (table === 'contents') logContent(r, undefined)
    if (table === 'roles') for (const m of rows('modules'))
      rows('role_permissions').push({ role: r.key, module: m.key, scope: 'none', can_write: false, can_delete: false })
    persist()
    return clone(r) as never
  },
  async insertMany(table, list) {
    for (const row of list) await demoDb.insert(table, row)
  },
  async update(table, match, patch) {
    await delay()
    const targets = rows(table).filter((r) => matches(r, match as AnyRow) && canRead(table, r))
    for (const r of targets) {
      if (!canWrite(table, r, 'update')) throw new Error(DENIED)
      if (table === 'profiles') guardProfile(r, patch as AnyRow)
      const before = clone(r)
      Object.assign(r, patch)
      if (table === 'tasks') syncTaskDone(r, Boolean(before.done_at))
      if (table === 'contents' && 'status_id' in (patch as AnyRow)) { syncContent(r); if (before.status_id !== r.status_id) logContent(r, before.status_id) }
      audit(table, 'update', before, r)
    }
    persist()
  },
  async upsert(table, row, onConflict) {
    const keys = onConflict.split(',').map((k) => k.trim())
    const m = Object.fromEntries(keys.map((k) => [k, (row as AnyRow)[k]])) as Match<typeof table>
    const exists = rows(table).some((r) => matches(r, m as AnyRow))
    if (exists) await demoDb.update(table, m, row)
    else await demoDb.insert(table, row)
  },
  async remove(table, match) {
    await delay()
    const list = rows(table)
    const targets = list.filter((r) => matches(r, match as AnyRow) && canRead(table, r))
    for (const r of targets) if (!canWrite(table, r, 'delete')) throw new Error(DENIED)
    if (table === 'roles' && targets.some((x) => rows('profiles').some((p) => p.role === x.key)))
      throw new Error('Este cargo ainda está atribuído a pessoas da equipe. Troque o cargo delas antes de excluir')
    // integridade: cliente com contrato não pode ser apagado (on delete restrict)
    if (table === 'clients' && targets.some((c) => rows('contracts').some((k) => k.client_id === c.id)))
      throw new Error('Este registro está em uso por outro cadastro e não pode ser removido.')
    for (const r of targets) { list.splice(list.indexOf(r), 1); audit(table, 'delete', r, null) }
    // cascatas principais
    const ids = targets.map((r) => r.id)
    if (table === 'tasks') for (const t of ['task_checklist', 'task_collaborators'] as const)
      store[t] = rows(t).filter((x) => !ids.includes(x.task_id)) as never
    if (table === 'tasks') store.tasks = rows('tasks').filter((x) => !ids.includes(x.parent_id)) as never
    if (table === 'contents') store.content_history = rows('content_history').filter((x) => !ids.includes(x.content_id)) as never
    if (table === 'roles') { const keys = targets.map((x) => x.key); store.role_permissions = rows('role_permissions').filter((x) => !keys.includes(x.role)) as never }
    if (table === 'contracts') store.contract_items = rows('contract_items').filter((x) => !ids.includes(x.contract_id)) as never
    if (table === 'service_offers') store.offer_prices = rows('offer_prices').filter((x) => !ids.includes(x.offer_id)) as never
    persist()
  },
  async activateContract(contractId, ownerId) {
    await delay()
    if (!(write('contratos') && write('financeiro'))) throw new Error('Sem permissão para ativar contratos')
    const c = rows('contracts').find((x) => x.id === contractId)
    if (!c) throw new Error('Contrato não encontrado')
    if (c.status !== 'rascunho') throw new Error('Só contratos em rascunho podem ser ativados')
    const items = rows('contract_items').filter((i) => i.contract_id === c.id)
    if (!items.length) throw new Error('Adicione ao menos um serviço ao contrato')
    Object.assign(c, { status: 'ativo', activated_at: new Date().toISOString(), start_date: c.start_date ?? today() })
    const opt = (set: string, label?: string) => rows('options').filter((o) => o.set_key === set && (!label || o.label === label))
      .sort((a, b) => Number(a.sort) - Number(b.sort))[0]?.id ?? null
    const client = rows('clients').find((x) => x.id === c.client_id)!
    client.status_id = opt('client_status', 'Ativo') ?? client.status_id
    if (c.lead_id) {
      const l = rows('leads').find((x) => x.id === c.lead_id)
      if (l) { l.client_id = c.client_id; l.stage_id = opt('lead_stage', 'Fechado') ?? l.stage_id }
    }
    const owner = ownerId ?? me()
    const pid = uuid()
    rows('projects').push({ id: pid, client_id: c.client_id, service_id: null, contract_id: c.id, name: `Onboarding · ${client.name}`,
      description: null, objective: 'Colocar o cliente em operação', owner_id: owner, status_id: opt('project_status'),
      priority: 'alta', start_date: today(), due_date: null, created_by: me() })
    const svcIds = items.map((i) => i.service_id)
    const tpls = rows('checklist_templates').filter((t) => t.active && (t.service_id === null || svcIds.includes(t.service_id)))
    const tItems = rows('checklist_template_items').filter((i) => tpls.some((t) => t.id === i.template_id))
      .sort((a, b) => Number(a.sort) - Number(b.sort))
    for (const it of tItems) {
      const due = it.due_offset_days == null ? null : (() => { const d = new Date(); d.setDate(d.getDate() + Number(it.due_offset_days)); return d.toLocaleDateString('sv-SE') })()
      rows('tasks').push(defaults('tasks', { project_id: pid, client_id: c.client_id, title: it.title, owner_id: owner,
        status_id: opt('task_status'), start_date: today(), due_date: due }))
    }
    audit('contracts', 'update', null, c); persist()
    return pid
  },
  async clientServices() {
    await delay()
    if (!read('clientes')) return []
    const out: ClientService[] = []
    for (const c of rows('contracts').filter((k) => k.status === 'ativo'))
      for (const i of rows('contract_items').filter((x) => x.contract_id === c.id)) {
        const s = rows('services').find((x) => x.id === i.service_id)
        const o = rows('service_offers').find((x) => x.id === i.offer_id)
        out.push({ client_id: String(c.client_id), service_id: String(i.service_id), service_name: String(s?.name ?? ''), offer_label: (o?.label as string) ?? null, contract_status: 'ativo' })
      }
    return out
  },
  async createUser({ email, name, role }) {
    await delay()
    if (!admin()) throw new Error('Apenas administradores podem criar usuários')
    if (rows('profile_details').some((d) => d.email === email)) throw new Error('Já existe um usuário com este e-mail.')
    const id = uuid()
    rows('profiles').push({ id, name, role, link: 'Efetivo', active: true, weekly_capacity_hours: null })
    rows('profile_details').push({ id, email, phone: null, insta: null, x: null })
    audit('profiles', 'insert', null, { id, name, role }); persist()
    // no demo não há login real: a senha é só ilustrativa (no sistema real, quem gera é o servidor)
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%&*!?'
    const password = Array.from(crypto.getRandomValues(new Uint32Array(14)), (n) => abc[n % abc.length]).join('')
    return { id, email, password }
  },
  async refreshNotifications() { await delay(); return 0 },
  async markAllNotificationsRead() {
    await delay()
    const now = new Date().toISOString()
    for (const n of rows('notifications')) if (n.user_id === me() && !n.read_at) n.read_at = now
    persist()
  },
  // sem servidor no demo: não há tempo real
  subscribeNotifications: () => () => {},
  async getContentForApproval(token) {
    await delay()
    const nowIso = new Date().toISOString()
    const link = rows('content_approval_links').find((l) => l.token === token.trim() && !l.revoked_at && String(l.expires_at) > nowIso)
    if (!link) return null
    const c = rows('contents').find((x) => x.id === link.content_id)
    if (!c) return null
    const cl = rows('clients').find((x) => x.id === c.client_id)
    const fmt = rows('options').find((x) => x.id === c.format_id)
    const st = rows('options').find((x) => x.id === c.status_id)
    const apr = rows('content_approvals').find((a) => a.link_id === link.id)
    return {
      content_id: String(c.id), title: String(c.title), client_name: (cl?.name as string) ?? null,
      format_label: (fmt?.label as string) ?? null, status_label: (st?.label as string) ?? null, status_color: (st?.color as string) ?? null,
      channel: (c.channel as string) ?? null, objective: (c.objective as string) ?? null, caption: (c.caption as string) ?? null,
      links: (c.links as string) ?? null, publish_date: (c.publish_date as string) ?? null, publish_time: (c.publish_time as string) ?? null,
      expires_at: String(link.expires_at), decision: (apr?.decision as PublicApprovalInfo['decision']) ?? null,
      reviewer_name: (apr?.reviewer_name as string) ?? null, feedback: (apr?.comment as string) ?? null,
      decided_at: (apr?.created_at as string) ?? null,
    }
  },
  async submitContentApproval({ token, decision, reviewer_name, comment }) {
    await delay()
    const name = reviewer_name.trim()
    const body = comment?.trim() || null
    if (!name) throw new Error('Informe seu nome')
    if (decision === 'ajustes' && !body) throw new Error('Descreva os ajustes desejados')
    const nowIso = new Date().toISOString()
    const link = rows('content_approval_links').find((l) => l.token === token.trim() && !l.revoked_at && String(l.expires_at) > nowIso)
    if (!link) throw new Error('Link de aprovação inválido ou expirado')
    if (rows('content_approvals').some((a) => a.link_id === link.id)) throw new Error('Este link de aprovação já foi respondido')
    const c = rows('contents').find((x) => x.id === link.content_id)
    if (!c) throw new Error('Conteúdo não encontrado')
    rows('content_approvals').push(defaults('content_approvals', {
      link_id: link.id, content_id: c.id, decision, reviewer_name: name, comment: body,
    }))
    const targetLabel = decision === 'aprovado' ? 'Aprovado' : 'Ajustes'
    const st = rows('options').find((o) => o.set_key === 'content_status' && o.label === targetLabel)
    if (st && st.id !== c.status_id) {
      const prev = c.status_id
      c.status_id = st.id
      syncContent(c)
      logContent(c, prev)
    }
    persist()
  },
  currentUserId: () => DEMO_USER_ID,
}

/** No demo, o cargo escolhido em "Ver como" vira o cargo do seu usuário. */
export function setDemoRole(role: string) {
  const p = rows('profiles').find((x) => x.id === DEMO_USER_ID)
  if (p) { p.role = role; persist() }
}
export function demoPermissionsList() {
  return rows('modules').sort((a, b) => Number(a.sort) - Number(b.sort)).map((m) => {
    const p = demoPerm(String(m.key))
    return { module: m.key, scope: p.scope, can_write: p.w, can_delete: p.d }
  })
}

/** Cargos existentes no demo (inclui os criados pelo administrador). */
export function demoRoles() {
  return (rows('roles') as unknown as { key: string; name: string; sort: number }[])
    .slice().sort((a, b) => a.sort - b.sort)
}
