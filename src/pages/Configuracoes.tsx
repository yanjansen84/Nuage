import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../data/db'
import { useOptions, usePeople, useRun, useTable } from '../data/hooks'
import type { BillingType, OptionRow, RolePermission, RoleRow, Service, ServiceOffer } from '../data/types'
import { useAuth } from '../lib/auth'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { Empty, Field, fdt, Loading, maskInteger, maskMoney, money, nn, num, parseMoney, PageHead, Select, Tabs } from '../ui/kit'
import { EquipeTab } from './EquipeTab'
import { Pagination } from '../ui/Pagination'
import { useQuery } from '@tanstack/react-query'
import type { Table } from '../data/types'

type Aba = 'equipe' | 'permissoes' | 'servicos' | 'etapas' | 'checklists' | 'auditoria'

export default function Configuracoes() {
  const { can } = useAuth()
  const admin = can('configuracoes', 'write')
  const seeConfig = can('configuracoes')
  const seeTeam = can('equipe') || admin
  const [sp, setSp] = useSearchParams()
  const requested = sp.get('aba') as Aba | null
  const aba: Aba = requested === 'usuarios' as never ? 'equipe' : requested ?? (seeTeam ? 'equipe' : 'servicos')
  return (
    <>
      <PageHead title="Configurações" sub={admin ? 'Tudo aqui é editável sem mexer no código' : seeConfig ? 'Consulta das configurações. Somente administradores alteram.' : 'Equipe da agência'} />
      <Tabs value={aba} onChange={(v) => setSp({ aba: v }, { replace: true })} items={[
        { key: 'equipe', label: 'Equipe e usuários', hidden: !seeTeam },
        { key: 'permissoes', label: 'Permissões', hidden: !admin },
        { key: 'servicos', label: 'Serviços e preços', hidden: !seeConfig },
        { key: 'etapas', label: 'Etapas e status', hidden: !seeConfig },
        { key: 'checklists', label: 'Checklists', hidden: !seeConfig },
        { key: 'auditoria', label: 'Auditoria', hidden: !admin },
      ]} />
      {aba === 'equipe' && seeTeam && <EquipeTab />}
      {aba === 'permissoes' && admin && <Permissoes />}
      {aba === 'servicos' && seeConfig && <Servicos />}
      {aba === 'etapas' && seeConfig && <Etapas />}
      {aba === 'checklists' && seeConfig && <Checklists />}
      {aba === 'auditoria' && admin && <Auditoria />}
    </>
  )
}

// ---------------------------------------------------------------- Permissões
const SCOPES = [{ value: 'none', label: 'Sem acesso' }, { value: 'own', label: 'Só os próprios' }, { value: 'all', label: 'Todos' }]
const scopeLabel = (s: string) => SCOPES.find((x) => x.value === s)?.label ?? s

function Permissoes() {
  const [mode, setMode] = useState<'cargo' | 'pessoa'>('cargo')
  return (
    <>
      <div className="toolbar">
        <div className="seg">
          <button className={`btn ${mode === 'cargo' ? 'on' : ''}`} onClick={() => setMode('cargo')}>Por cargo</button>
          <button className={`btn ${mode === 'pessoa' ? 'on' : ''}`} onClick={() => setMode('pessoa')}>Ajuste por pessoa</button>
        </div>
      </div>
      {mode === 'cargo' ? <RoleMatrix /> : <UserMatrix />}
      <p className="money-note">As permissões valem no banco de dados, não só na tela: quem não tem acesso não consegue ler os dados nem por consulta direta</p>
    </>
  )
}

function RoleMatrix() {
  const { reload } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const people = usePeople()
  const [roleForm, setRoleForm] = useState<'new' | 'rename' | null>(null)
  const roles = useTable('roles', { order: { column: 'sort' } })
  const modules = useTable('modules', { order: { column: 'sort' } })
  const perms = useTable('role_permissions')
  const [role, setRole] = useState('ceo')
  const get = (m: string) => perms.data?.find((p) => p.role === role && p.module === m) ?? { role, module: m, scope: 'none', can_write: false, can_delete: false } as RolePermission
  const current = roles.data?.find((r) => r.key === role)
  const inUse = (people.data ?? []).filter((p) => p.role === role).length
  async function removeRole() {
    if (!current) return
    if (inUse) return run(async () => { throw new Error('Este cargo ainda está atribuído a ' + inUse + ' pessoa(s). Troque o cargo delas em Equipe e usuários antes de excluir') })
    if (!(await confirm(`Excluir o cargo "${current.name}"? As permissões dele também serão removidas.`, { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('roles', { key: current.key }), 'Cargo excluído')) setRole('ceo')
  }
  async function change(m: string, patch: Partial<RolePermission>) {
    const cur = get(m)
    const next = { ...cur, ...patch }
    if (next.scope === 'none') { next.can_write = false; next.can_delete = false }
    if (await run(() => db.upsert('role_permissions', next, 'role,module'), 'Permissão atualizada')) reload()
  }
  return (
    <>
      <div className="toolbar">
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Cargo"
          options={(roles.data ?? []).map((r) => ({ value: r.key, label: r.name }))} />
        <span className="mu" style={{ fontSize: 13 }}>{inUse} {inUse === 1 ? 'pessoa' : 'pessoas'} com este cargo</span>
        <span className="spacer" />
        <button className="btn" onClick={() => setRoleForm('rename')} disabled={!current}><Pencil aria-hidden />Renomear</button>
        <button className="btn danger" onClick={removeRole} disabled={!current || role === 'ceo'} title={role === 'ceo' ? 'O cargo de administrador não pode ser excluído' : undefined}><Trash2 aria-hidden />Excluir cargo</button>
        <button className="btn primary" onClick={() => setRoleForm('new')}><Plus aria-hidden />Novo cargo</button>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Módulo</th><th>Leitura</th><th>Criar e editar</th><th>Excluir</th></tr></thead>
          <tbody>
            {(modules.data ?? []).map((m) => {
              const p = get(m.key)
              const locked = role === 'ceo' && m.key === 'configuracoes'
              return (
                <tr key={m.key}>
                  <td><b>{m.name}</b>{m.key === 'estrategia' && <span className="mu"> · Fase 2</span>}</td>
                  <td><Select value={p.scope} disabled={locked} onChange={(e) => change(m.key, { scope: e.target.value as RolePermission['scope'] })} options={SCOPES} aria-label={`Leitura em ${m.name}`} /></td>
                  <td><input type="checkbox" checked={p.can_write} disabled={locked || p.scope === 'none'} onChange={(e) => change(m.key, { can_write: e.target.checked })} aria-label={`Criar e editar em ${m.name}`} /></td>
                  <td><input type="checkbox" checked={p.can_delete} disabled={locked || p.scope === 'none'} onChange={(e) => change(m.key, { can_delete: e.target.checked })} aria-label={`Excluir em ${m.name}`} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {roleForm && <RoleForm role={roleForm === 'rename' ? current ?? null : null} roles={roles.data ?? []}
        onClose={() => setRoleForm(null)} onSaved={(k) => { setRole(k); reload() }} />}
    </>
  )
}

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

function RoleForm({ role, roles, onClose, onSaved }: { role: RoleRow | null; roles: RoleRow[]; onClose: () => void; onSaved: (key: string) => void }) {
  const run = useRun()
  const [name, setName] = useState(role?.name ?? '')
  const dup = roles.some((r) => r.key !== role?.key && r.name.trim().toLowerCase() === name.trim().toLowerCase())
  async function save() {
    const n = name.trim()
    if (!n || dup) return
    if (role) {
      if (await run(() => db.update('roles', { key: role.key }, { name: n }), 'Cargo renomeado')) { onSaved(role.key); onClose() }
      return
    }
    let key = slug(n) || 'cargo'
    while (roles.some((r) => r.key === key)) key += '_2'
    const sort = Math.max(0, ...roles.map((r) => r.sort)) + 1
    if (await run(() => db.insert('roles', { key, name: n, sort }), 'Cargo criado · agora defina as permissões')) { onSaved(key); onClose() }
  }
  return (
    <Modal open onClose={onClose} title={role ? 'Renomear cargo' : 'Novo cargo'} size="sm"
      footer={<><button className="btn primary" onClick={save} disabled={!name.trim() || dup}>{role ? 'Salvar' : 'Criar cargo'}</button><button className="btn" onClick={onClose}>Cancelar</button></>}>
      <Field label="Nome do cargo *" hint={dup ? 'Já existe um cargo com esse nome' : role ? undefined : 'O cargo nasce sem nenhum acesso. Depois de criar, marque o que ele pode ver e fazer em cada módulo'}>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ex.: Editor de vídeo" onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
    </Modal>
  )
}

function UserMatrix() {
  const { reload } = useAuth()
  const run = useRun()
  const people = usePeople()
  const modules = useTable('modules', { order: { column: 'sort' } })
  const rolePerms = useTable('role_permissions')
  const userPerms = useTable('user_permissions')
  const [uid, setUid] = useState('')
  const person = people.data?.find((p) => p.id === uid)
  const base = (m: string) => rolePerms.data?.find((p) => p.role === person?.role && p.module === m)
  const over = (m: string) => userPerms.data?.find((p) => p.user_id === uid && p.module === m)
  const tri = (v: boolean | null | undefined) => (v == null ? '' : v ? 'sim' : 'nao')
  const fromTri = (v: string) => (v === '' ? null : v === 'sim')

  async function change(m: string, patch: { scope?: string | null; can_write?: boolean | null; can_delete?: boolean | null }) {
    const cur = over(m)
    const next = { user_id: uid, module: m, scope: cur?.scope ?? null, can_write: cur?.can_write ?? null, can_delete: cur?.can_delete ?? null, ...patch }
    const ok = await run(() => (next.scope == null && next.can_write == null && next.can_delete == null
      ? db.remove('user_permissions', { user_id: uid, module: m })
      : db.upsert('user_permissions', next as never, 'user_id,module')), 'Ajuste salvo')
    if (ok) reload()
  }

  return (
    <>
      <Field label="Pessoa"><Select value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Selecione" options={people.active.map((p) => ({ value: p.id, label: p.name }))} /></Field>
      {!person ? <p className="mu">Escolha uma pessoa para ajustar permissões além do padrão do cargo</p> : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="t">
            <thead><tr><th>Módulo</th><th>Leitura</th><th>Criar e editar</th><th>Excluir</th></tr></thead>
            <tbody>
              {(modules.data ?? []).map((m) => {
                const b = base(m.key), o = over(m.key)
                return (
                  <tr key={m.key} style={o ? { background: 'var(--acs)' } : undefined}>
                    <td><b>{m.name}</b></td>
                    <td><Select value={o?.scope ?? ''} onChange={(e) => change(m.key, { scope: e.target.value || null })} aria-label={`Leitura em ${m.name}`}
                      options={[{ value: '', label: `Do cargo (${scopeLabel(b?.scope ?? 'none')})` }, ...SCOPES]} /></td>
                    <td><Select value={tri(o?.can_write)} onChange={(e) => change(m.key, { can_write: fromTri(e.target.value) })} aria-label={`Editar em ${m.name}`}
                      options={[{ value: '', label: `Do cargo (${b?.can_write ? 'sim' : 'não'})` }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} /></td>
                    <td><Select value={tri(o?.can_delete)} onChange={(e) => change(m.key, { can_delete: fromTri(e.target.value) })} aria-label={`Excluir em ${m.name}`}
                      options={[{ value: '', label: `Do cargo (${b?.can_delete ? 'sim' : 'não'})` }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Serviços
function Servicos() {
  const { can } = useAuth()
  const services = useTable('services', { order: { column: 'sort' } })
  const offers = useTable('service_offers', { order: { column: 'sort' } })
  const prices = useTable('offer_prices', { enabled: can('financeiro') })
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const price = (id: string) => prices.data?.find((p) => p.offer_id === id)?.price
  return (
    <>
      <div className="toolbar"><span className="mu">O preço padrão é sugerido nos contratos; mudanças aqui não alteram contratos já firmados</span><span className="spacer" />
        {can('configuracoes', 'write') && <button className="btn primary" onClick={() => setEditing('new')}>Novo serviço</button>}</div>
      <div className="cards">
        {(services.data ?? []).map((s) => (
          <button key={s.id} type="button" className="card plain" onClick={() => setEditing(s)} style={s.active ? undefined : { opacity: .55 }}>
            <b>{s.name}</b>
            <small className="mu">{s.description}</small>
            <small className="mu">{s.billing_type === 'recorrente' ? 'Recorrente' : s.billing_type === 'pacote' ? 'Pacote' : 'Avulso'}{s.min_months ? ` · mínimo ${s.min_months} meses` : ''}{s.delivery_note ? ` · ${s.delivery_note}` : ''}</small>
            <div className="foot">
              {(offers.data ?? []).filter((o) => o.service_id === s.id && o.active).map((o) => (
                <span key={o.id}>{o.label}{can('financeiro') && price(o.id) != null ? ` · ${money(price(o.id))}` : ''}</span>
              ))}
              {!s.active && <span>Inativo</span>}
            </div>
          </button>
        ))}
      </div>
      {editing && <ServiceForm service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ServiceForm({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const { can } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const offers = useTable('service_offers', { match: { service_id: service?.id ?? '' }, order: { column: 'sort' }, enabled: !!service })
  const prices = useTable('offer_prices', { enabled: can('financeiro') })
  const canEdit = can('configuracoes', 'write')
  const canPrice = can('financeiro', 'write') && can('configuracoes')
  const [f, setF] = useState({
    name: service?.name ?? '', description: service?.description ?? '', category: service?.category ?? '',
    billing_type: service?.billing_type ?? 'recorrente', delivery_days: service?.delivery_days?.toString() ?? '',
    delivery_note: service?.delivery_note ?? '', min_months: service?.min_months?.toString() ?? '',
    deliverables: (service?.deliverables ?? []).join('\n'), notes: service?.notes ?? '', active: service?.active ?? true,
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const [newOffer, setNewOffer] = useState({ label: '', quantity: '', price: '' })
  const priceOf = (id: string) => prices.data?.find((p) => p.offer_id === id)?.price

  async function save() {
    const p = {
      name: f.name.trim(), description: nn(f.description), category: nn(f.category), billing_type: f.billing_type as BillingType,
      delivery_days: num(f.delivery_days), delivery_note: nn(f.delivery_note), min_months: num(f.min_months),
      deliverables: f.deliverables.split('\n').map((x) => x.trim()).filter(Boolean), notes: nn(f.notes), active: f.active,
    }
    if (!p.name) return
    const ok = await run(async () => { if (service) await db.update('services', { id: service.id }, p); else await db.insert('services', p) }, 'Serviço salvo')
    if (ok) onClose()
  }
  async function addOffer() {
    if (!service || !newOffer.label.trim()) return
    const ok = await run(async () => {
      const o = await db.insert('service_offers', { service_id: service.id, label: newOffer.label.trim(), quantity: num(newOffer.quantity), sort: (offers.data?.length ?? 0) + 1 })
      if (canPrice && newOffer.price !== '') await db.upsert('offer_prices', { offer_id: o.id, price: parseMoney(newOffer.price) ?? 0 }, 'offer_id')
    }, 'Opção adicionada')
    if (ok) setNewOffer({ label: '', quantity: '', price: '' })
  }
  const updOffer = (o: ServiceOffer, patch: Partial<ServiceOffer>) => run(() => db.update('service_offers', { id: o.id }, patch))
  const setPrice = (o: ServiceOffer, v: string) => {
    const p = parseMoney(v)
    if (p != null && p !== priceOf(o.id)) {
      run(() => db.upsert('offer_prices', { offer_id: o.id, price: p }, 'offer_id'), 'Preço atualizado')
    }
  }
  async function removeOffer(o: ServiceOffer) {
    if (!(await confirm(`Remover a opção "${o.label}"? Se já estiver em contratos, desative em vez de remover.`, { danger: true, confirmLabel: 'Remover' }))) return
    await run(() => db.remove('service_offers', { id: o.id }), 'Opção removida')
  }

  return (
    <Modal open onClose={onClose} size="lg" title={service ? service.name : 'Novo serviço'}
      footer={<>{canEdit && <button className="btn primary" onClick={save} disabled={!f.name.trim()}>Salvar</button>}<button className="btn" onClick={onClose}>Fechar</button></>}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Nome *"><input value={f.name} onChange={set('name')} placeholder="Ex.: Nuage Studio" /></Field>
          <Field label="Categoria"><input value={f.category} onChange={set('category')} placeholder="Ex.: Audiovisual" /></Field>
          <Field label="Descrição comercial" full><input value={f.description} onChange={set('description')} placeholder="Resumo comercial do serviço" /></Field>
          <Field label="Tipo de cobrança"><Select value={f.billing_type} onChange={set('billing_type')} options={[{ value: 'recorrente', label: 'Recorrente' }, { value: 'pacote', label: 'Pacote' }, { value: 'avulso', label: 'Avulso' }]} /></Field>
          <Field label="Contrato mínimo (meses)"><input type="text" inputMode="numeric" value={f.min_months} onChange={(e) => setF({ ...f, min_months: maskInteger(e.target.value) })} placeholder="Ex.: 6" /></Field>
          <Field label="Prazo de execução (dias)"><input type="text" inputMode="numeric" value={f.delivery_days} onChange={(e) => setF({ ...f, delivery_days: maskInteger(e.target.value) })} placeholder="Ex.: 2" /></Field>
          <Field label="Observação do prazo"><input value={f.delivery_note} onChange={set('delivery_note')} placeholder="Ex.: até 48h após a captação" /></Field>
          <Field label="Entregáveis (um por linha)" full><textarea rows={6} value={f.deliverables} onChange={set('deliverables')} placeholder="Um entregável por linha" /></Field>
          <Field label="Condições e observações internas" full><textarea value={f.notes} onChange={set('notes')} placeholder="Condições comerciais e observações internas" /></Field>
        </div>
        <label className="checks" style={{ marginTop: 12 }}><label><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Serviço ativo</label></label>
      </fieldset>

      {service && (
        <fieldset className="box">
          <legend>Opções contratáveis e preço padrão</legend>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Opção</th><th>Qtd.</th>{can('financeiro') && <th>Preço (R$)</th>}<th>Ativa</th><th /></tr></thead>
              <tbody>
                {(offers.data ?? []).map((o) => (
                  <tr key={o.id}>
                    <td><input defaultValue={o.label} disabled={!canEdit} onBlur={(e) => e.target.value.trim() && e.target.value !== o.label && updOffer(o, { label: e.target.value.trim() })} aria-label="Nome da opção" /></td>
                    <td><input type="text" inputMode="numeric" style={{ width: 72 }} defaultValue={o.quantity ?? ''} disabled={!canEdit} onBlur={(e) => num(maskInteger(e.target.value)) !== o.quantity && updOffer(o, { quantity: num(maskInteger(e.target.value)) })} aria-label="Quantidade" /></td>
                    {can('financeiro') && <td><input type="text" inputMode="numeric" style={{ width: 112 }} key={priceOf(o.id)} defaultValue={priceOf(o.id) != null ? maskMoney(priceOf(o.id)) : ''} disabled={!canPrice} onBlur={(e) => setPrice(o, e.target.value)} aria-label="Preço" placeholder="0,00" /></td>}
                    <td><input type="checkbox" checked={o.active} disabled={!canEdit} onChange={(e) => updOffer(o, { active: e.target.checked })} aria-label="Ativa" /></td>
                    <td>{canEdit && <button className="btn ghost sm danger" onClick={() => removeOffer(o)}>Remover</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
              <input placeholder="Nova opção (ex.: 3 vídeos)" value={newOffer.label} onChange={(e) => setNewOffer({ ...newOffer, label: e.target.value })} aria-label="Nova opção" />
              <input type="text" inputMode="numeric" placeholder="Qtd." style={{ width: 80 }} value={newOffer.quantity} onChange={(e) => setNewOffer({ ...newOffer, quantity: maskInteger(e.target.value) })} aria-label="Quantidade" />
              {canPrice && <input type="text" inputMode="numeric" placeholder="Preço (R$)" style={{ width: 112 }} value={newOffer.price} onChange={(e) => setNewOffer({ ...newOffer, price: maskMoney(e.target.value) })} aria-label="Preço" />}
              <button className="btn" onClick={addOffer} disabled={!newOffer.label.trim()}>Adicionar</button>
            </div>
          )}
          {!can('financeiro') && <p className="money-note">Preços visíveis apenas para quem acessa o Financeiro</p>}
        </fieldset>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Etapas e status
const SETS: { key: string; label: string; final?: string }[] = [
  { key: 'lead_stage', label: 'Etapas do funil comercial', final: 'Encerra o lead' },
  { key: 'lead_origin', label: 'Origens de lead' },
  { key: 'client_status', label: 'Status de cliente', final: 'Cliente encerrado' },
  { key: 'project_status', label: 'Status de projeto', final: 'Encerra o projeto' },
  { key: 'task_status', label: 'Status de tarefa', final: 'Conclui a tarefa' },
  { key: 'content_status', label: 'Status de conteúdo', final: 'Marca como postado' },
  { key: 'content_format', label: 'Formatos de conteúdo' },
]

function Etapas() {
  const { can } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const [set, setSet] = useState('lead_stage')
  const opts = useOptions(set, true)
  const [label, setLabel] = useState('')
  const canEdit = can('configuracoes', 'write')
  const meta = SETS.find((s) => s.key === set)!
  const L = opts.data ?? []

  const upd = (o: OptionRow, patch: Partial<OptionRow>) => run(() => db.update('options', { id: o.id }, patch))
  async function move(i: number, dir: -1 | 1) {
    const a = L[i], b = L[i + dir]
    if (!a || !b) return
    await run(async () => { await db.update('options', { id: a.id }, { sort: b.sort }); await db.update('options', { id: b.id }, { sort: a.sort }) })
  }
  async function add() {
    if (!label.trim()) return
    if (await run(() => db.insert('options', { set_key: set, label: label.trim(), sort: ((L[L.length - 1]?.sort) ?? 0) + 1, color: '#55555f' }), 'Opção adicionada')) setLabel('')
  }
  async function remove(o: OptionRow) {
    if (!(await confirm(`Excluir "${o.label}"? Se estiver em uso, prefira desativar para preservar o histórico.`, { danger: true, confirmLabel: 'Excluir' }))) return
    await run(() => db.remove('options', { id: o.id }), 'Opção excluída')
  }

  return (
    <>
      <Field label="Cadastro"><Select value={set} onChange={(e) => setSet(e.target.value)} options={SETS.map((s) => ({ value: s.key, label: s.label }))} /></Field>
      {opts.isLoading ? <Loading /> : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="t">
            <thead><tr><th>Ordem</th><th>Nome</th>{set !== 'lead_origin' && <th>Cor</th>}{meta.final && <th>{meta.final}</th>}<th>Ativa</th><th /></tr></thead>
            <tbody>
              {L.map((o, i) => (
                <tr key={o.id} style={o.active ? undefined : { opacity: .55 }}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost icon" disabled={!canEdit || i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp aria-hidden /></button>
                    <button className="btn sm ghost icon" disabled={!canEdit || i === L.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown aria-hidden /></button>
                  </td>
                  <td><input key={o.label} defaultValue={o.label} disabled={!canEdit} onBlur={(e) => e.target.value.trim() && e.target.value !== o.label && upd(o, { label: e.target.value.trim() })} aria-label="Nome" /></td>
                  {set !== 'lead_origin' && <td><input type="color" value={o.color ?? '#55555f'} disabled={!canEdit} onChange={(e) => upd(o, { color: e.target.value })} aria-label="Cor" style={{ width: 44, padding: 2, height: 32, borderRadius: 6 }} /></td>}
                  {meta.final && <td><input type="checkbox" checked={o.is_final} disabled={!canEdit} onChange={(e) => upd(o, { is_final: e.target.checked })} aria-label={meta.final} /></td>}
                  <td><input type="checkbox" checked={o.active} disabled={!canEdit} onChange={(e) => upd(o, { active: e.target.checked })} aria-label="Ativa" /></td>
                  <td>{canEdit && <button className="btn ghost sm danger" onClick={() => remove(o)}>Excluir</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && <div className="toolbar" style={{ marginTop: 12 }}>
        <input placeholder="Nova opção" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Nova opção" />
        <button className="btn" onClick={add} disabled={!label.trim()}>Adicionar</button>
      </div>}
    </>
  )
}

// ---------------------------------------------------------------- Checklists
function Checklists() {
  const { can } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const templates = useTable('checklist_templates')
  const services = useTable('services', { order: { column: 'sort' } })
  const [tid, setTid] = useState('')
  const T = templates.data ?? []
  const current = T.find((t) => t.id === tid) ?? T[0]
  const items = useTable('checklist_template_items', { match: { template_id: current?.id ?? '' }, order: { column: 'sort' }, enabled: !!current })
  const [title, setTitle] = useState('')
  const [newTplSvc, setNewTplSvc] = useState('')
  const canEdit = can('configuracoes', 'write')
  const svcName = (id: string | null) => (id ? services.data?.find((s) => s.id === id)?.name : 'Todo contrato')
  const L = items.data ?? []

  async function add() {
    if (!current || !title.trim()) return
    if (await run(() => db.insert('checklist_template_items', { template_id: current.id, title: title.trim(), sort: ((L[L.length - 1]?.sort) ?? 0) + 1 }))) setTitle('')
  }
  async function move(i: number, dir: -1 | 1) {
    const a = L[i], b = L[i + dir]
    if (a && b) await run(async () => { await db.update('checklist_template_items', { id: a.id }, { sort: b.sort }); await db.update('checklist_template_items', { id: b.id }, { sort: a.sort }) })
  }
  async function newTemplate() {
    const s = services.data?.find((x) => x.id === newTplSvc)
    if (!s) return
    const t = await run(() => db.insert('checklist_templates', { service_id: s.id, name: `Onboarding · ${s.name}` }), 'Checklist criado')
    if (t && t !== true) { setTid(t.id); setNewTplSvc('') }
  }

  return (
    <>
      <p className="mu">Ao ativar um contrato, o sistema cria uma tarefa para cada item: os do checklist geral e os dos serviços contratados</p>
      <div className="toolbar">
        <Select value={current?.id ?? ''} onChange={(e) => setTid(e.target.value)} aria-label="Checklist"
          options={T.map((t) => ({ value: t.id, label: `${t.name} (${svcName(t.service_id)})${t.active ? '' : ' · inativo'}` }))} />
        {current && canEdit && <label className="checks"><label><input type="checkbox" checked={current.active} onChange={(e) => run(() => db.update('checklist_templates', { id: current.id }, { active: e.target.checked }))} />Ativo</label></label>}
        <span className="spacer" />
        {canEdit && <>
          <Select value={newTplSvc} onChange={(e) => setNewTplSvc(e.target.value)} placeholder="Checklist específico de…" aria-label="Serviço do novo checklist"
            options={(services.data ?? []).filter((s) => !T.some((t) => t.service_id === s.id)).map((s) => ({ value: s.id, label: s.name }))} />
          <button className="btn" onClick={newTemplate} disabled={!newTplSvc}>Criar</button>
        </>}
      </div>
      {!current ? <Empty>Nenhum checklist cadastrado</Empty> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Ordem</th><th>Tarefa</th><th>Prazo (dias após ativação)</th><th /></tr></thead>
            <tbody>
              {L.map((it, i) => (
                <tr key={it.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm ghost icon" disabled={!canEdit || i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp aria-hidden /></button>
                    <button className="btn sm ghost icon" disabled={!canEdit || i === L.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown aria-hidden /></button>
                  </td>
                  <td><input key={it.title} defaultValue={it.title} disabled={!canEdit} style={{ width: '100%' }} onBlur={(e) => e.target.value.trim() && e.target.value !== it.title && run(() => db.update('checklist_template_items', { id: it.id }, { title: e.target.value.trim() }))} aria-label="Tarefa" /></td>
                  <td><input type="number" min="0" style={{ width: 88 }} defaultValue={it.due_offset_days ?? ''} disabled={!canEdit} onBlur={(e) => num(e.target.value) !== it.due_offset_days && run(() => db.update('checklist_template_items', { id: it.id }, { due_offset_days: num(e.target.value) }))} aria-label="Prazo em dias" /></td>
                  <td>{canEdit && <button className="btn ghost sm danger" onClick={async () => (await confirm(`Remover "${it.title}"?`, { danger: true, confirmLabel: 'Remover' })) && run(() => db.remove('checklist_template_items', { id: it.id }))}>Remover</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && current && <div className="toolbar" style={{ marginTop: 12 }}>
        <input placeholder="Nova tarefa do checklist" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Nova tarefa" style={{ flex: 1, maxWidth: 420 }} />
        <button className="btn" onClick={add} disabled={!title.trim()}>Adicionar</button>
      </div>}
    </>
  )
}

// ---------------------------------------------------------------- Auditoria
const TABLE_LABEL: Record<string, string> = {
  profiles: 'Usuário', profile_details: 'Contatos', role_permissions: 'Permissão de cargo', user_permissions: 'Permissão pessoal',
  options: 'Cadastro', services: 'Serviço', service_offers: 'Opção de serviço', offer_prices: 'Preço', checklist_templates: 'Checklist',
  checklist_template_items: 'Item de checklist', clients: 'Cliente', leads: 'Lead', lead_values: 'Valor de lead', contracts: 'Contrato',
  contract_items: 'Item de contrato', payments: 'Pagamento', projects: 'Projeto', project_members: 'Equipe do projeto', tasks: 'Tarefa',
  task_dependencies: 'Dependência', events: 'Agenda', roles: 'Cargo', contents: 'Conteúdo',
}
const ACTION: Record<string, string> = { insert: 'criou', update: 'alterou', delete: 'excluiu' }

function Auditoria() {
  const people = usePeople()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const [kind, setKind] = useState('')
  const q = useQuery({
    queryKey: ['t', 'audit_log', 'page', page, size, kind],
    queryFn: () => db.page('audit_log', {
      match: kind ? { table_name: kind } : undefined,
      order: { column: 'at', ascending: false },
      from: (page - 1) * size, to: page * size - 1,
    }),
    placeholderData: (prev) => prev,
  })
  const desc = (r: Record<string, unknown> | null) => (r ? String(r.name ?? r.title ?? r.label ?? r.notes ?? r.key ?? '') : '')
  const rows = q.data?.rows ?? []
  const kinds = Object.entries(TABLE_LABEL).sort((a, b) => a[1].localeCompare(b[1])) as [Table, string][]

  return (
    <>
      <div className="toolbar">
        <span className="mu">Todas as alterações feitas no sistema. O registro não pode ser editado por usuários</span>
        <span className="spacer" />
        <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1) }} placeholder="Todos os registros" aria-label="Tipo de registro"
          options={kinds.map(([v, l]) => ({ value: v, label: l }))} />
      </div>
      {q.isLoading ? <Loading /> : !rows.length ? <Empty>Nenhuma alteração registrada{kind ? ' para esse tipo' : ''}</Empty> : (
        <>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Registro</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fdt(a.at)}</td>
                    <td>{people.name(a.actor) || 'Sistema'}</td>
                    <td>{ACTION[a.action] ?? a.action} {TABLE_LABEL[a.table_name]?.toLowerCase() ?? a.table_name}</td>
                    <td>{desc(a.new_data) || desc(a.old_data) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={size} total={q.data?.total ?? 0} onPage={setPage} onPageSize={setSize} />
        </>
      )}
    </>
  )
}
