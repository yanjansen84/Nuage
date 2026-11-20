import { CalendarDays, ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../data/db'
import { useClientServices, useOptions, usePeople, useRun, useTable } from '../data/hooks'
import type { Client } from '../data/types'
import { useAuth } from '../lib/auth'
import { Comments } from '../components/Comments'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { Empty, Field, fd, fdFull, Loading, money, nn, PageHead, Select, Tabs, Tag, today } from '../ui/kit'
import { contractMonthly, CONTRACT_STATUS } from './contratosUtil'

const PALETTE = ['#5b4bdb', '#0e9aa7', '#d6336c', '#2e9e6a', '#b97d00', '#2f80ed', '#ea5c2a']

export default function Clientes() {
  const { can } = useAuth()
  const clients = useTable('clients', { order: { column: 'name' } })
  const status = useOptions('client_status')
  const services = useClientServices()
  const tasks = useTable('tasks', { enabled: can('projetos') })
  const [q, setQ] = useState('')
  const [st, setSt] = useState('')
  const [editing, setEditing] = useState(false)
  const navigate = useNavigate()

  const L = (clients.data ?? []).filter((c) =>
    (!st || c.status_id === st) && (!q || `${c.name} ${c.segment ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const openTasks = (id: string) => (tasks.data ?? []).filter((t) => t.client_id === id && !t.done_at).length

  return (
    <>
      <PageHead title="Clientes" sub={`${clients.data?.length ?? 0} clientes cadastrados`}
        actions={can('clientes', 'write') && <button className="btn primary" onClick={() => setEditing(true)}>Novo cliente</button>} />
      <div className="toolbar">
        <input type="search" placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
        <Select value={st} onChange={(e) => setSt(e.target.value)} placeholder="Todos os status" options={status.list.map((s) => ({ value: s.id, label: s.label }))} aria-label="Filtrar por status" />
      </div>
      {clients.isLoading ? <Loading /> : !L.length ? (
        <Empty>{clients.data?.length ? 'Nenhum cliente com esse filtro' : 'Nenhum cliente cadastrado ainda. Clientes também nascem da conversão de um lead no Comercial.'}</Empty>
      ) : (
        <div className="cards">
          {L.map((c, i) => {
            const svc = (services.data ?? []).filter((s) => s.client_id === c.id)
            const s = status.byId(c.status_id)
            return (
              <Link key={c.id} to={`/clientes/${c.id}`} className="card" style={{ background: PALETTE[i % PALETTE.length] }}>
                <b>{c.name}</b>
                <small>{c.segment || 'Sem segmento'}</small>
                <small>{svc.length ? svc.map((x) => x.service_name.replace('Nuage ', '') + (x.offer_label && x.offer_label !== 'Mensal' ? ` (${x.offer_label})` : '')).join(' · ') : 'Sem serviço ativo'}</small>
                <div className="foot">
                  <span>{s?.label ?? 'Sem status'}</span>
                  {can('projetos') && <span>{openTasks(c.id)} tarefas em aberto</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
      {editing && <ClientForm client={null} onClose={() => setEditing(false)} onSaved={(id) => navigate(`/clientes/${id}`)} />}
    </>
  )
}

export function ClientForm({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const run = useRun()
  const status = useOptions('client_status')
  const [f, setF] = useState({
    name: client?.name ?? '', segment: client?.segment ?? '', contact_name: client?.contact_name ?? '',
    phone: client?.phone ?? '', email: client?.email ?? '', status_id: client?.status_id ?? '', notes: client?.notes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const statusId = f.status_id || status.byLabel('Em negociação')?.id || ''

  async function save() {
    const p = { name: f.name.trim(), segment: nn(f.segment), contact_name: nn(f.contact_name), phone: nn(f.phone),
      email: nn(f.email), status_id: statusId || null, notes: nn(f.notes) }
    if (!p.name) return
    const r = await run(async () => client ? (await db.update('clients', { id: client.id }, p), client) : db.insert('clients', p), 'Cliente salvo')
    if (r && r !== true) { onClose(); onSaved?.(r.id) }
  }

  return (
    <Modal open onClose={onClose} title={client ? 'Editar cliente' : 'Novo cliente'}
      footer={<><button className="btn primary" onClick={save} disabled={!f.name.trim()}>Salvar</button><button className="btn" onClick={onClose}>Cancelar</button></>}>
      <div className="form-grid">
        <Field label="Nome do cliente *" full><input value={f.name} onChange={set('name')} placeholder="Nome da empresa ou marca" autoFocus /></Field>
        <Field label="Segmento"><input value={f.segment} onChange={set('segment')} placeholder="Ex.: Alimentação, Moda, Saúde" /></Field>
        <Field label="Status"><Select value={statusId} onChange={set('status_id')} options={status.list.map((s) => ({ value: s.id, label: s.label }))} /></Field>
        <Field label="Pessoa de contato"><input value={f.contact_name} onChange={set('contact_name')} placeholder="Quem responde pelo cliente" /></Field>
        <Field label="Telefone / WhatsApp"><input value={f.phone} onChange={set('phone')} placeholder="(00) 00000-0000" inputMode="tel" /></Field>
        <Field label="E-mail" full><input type="email" value={f.email} onChange={set('email')} placeholder="contato@empresa.com.br" /></Field>
        <Field label="Observações" full><textarea value={f.notes} onChange={set('notes')} placeholder="Informações importantes sobre o cliente" /></Field>
      </div>
    </Modal>
  )
}

type TabKey = 'geral' | 'contratos' | 'projetos' | 'historico'

export function ClienteDetalhe() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const navigate = useNavigate()
  const run = useRun()
  const { confirm } = useFeedback()
  const clients = useTable('clients', { match: { id } })
  const status = useOptions('client_status')
  const services = useClientServices()
  const contracts = useTable('contracts', { match: { client_id: id }, enabled: can('contratos') })
  const items = useTable('contract_items', { enabled: can('contratos') && can('financeiro') })
  const projects = useTable('projects', { match: { client_id: id }, enabled: can('projetos') })
  const projStatus = useOptions('project_status')
  const tasks = useTable('tasks', { match: { client_id: id }, enabled: can('projetos') })
  const people = usePeople()
  const [tab, setTab] = useState<TabKey>('geral')
  const [editing, setEditing] = useState(false)

  const c = clients.data?.[0]
  if (clients.isLoading) return <Loading />
  if (!c) return <Empty action={<Link className="btn" to="/clientes">Voltar</Link>}>Cliente não encontrado ou sem permissão de acesso</Empty>

  const s = status.byId(c.status_id)
  const svc = (services.data ?? []).filter((x) => x.client_id === c.id)
  const openT = (tasks.data ?? []).filter((t) => !t.done_at)
  const lateT = openT.filter((t) => t.due_date && t.due_date < today())

  async function remove() {
    if (!(await confirm(`Excluir o cliente "${c!.name}"? Isso não pode ser desfeito.`, { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('clients', { id: c!.id }), 'Cliente excluído')) navigate('/clientes')
  }

  return (
    <>
      <Link to="/clientes" className="back"><ChevronLeft aria-hidden />Clientes</Link>
      <PageHead title={c.name} sub={<>{s && <Tag color={s.color}>{s.label}</Tag>} {c.segment}</>}
        actions={<>
          <Link className="btn" to={`/agenda?cliente=${c.id}`}><CalendarDays aria-hidden />Ver agenda</Link>
          {can('clientes', 'write') && <button className="btn" onClick={() => setEditing(true)}>Editar</button>}
          {can('contratos', 'write') && <Link className="btn primary" to={`/contratos/novo?cliente=${c.id}`}>Novo contrato</Link>}
          {can('clientes', 'delete') && <button className="btn danger" onClick={remove}>Excluir</button>}
        </>} />

      <Tabs value={tab} onChange={setTab} items={[
        { key: 'geral', label: 'Visão geral' },
        { key: 'contratos', label: 'Contratos', hidden: !can('contratos'), badge: contracts.data?.length },
        { key: 'projetos', label: 'Projetos e tarefas', hidden: !can('projetos'), badge: projects.data?.length },
        { key: 'historico', label: 'Comentários' },
      ]} />

      {tab === 'geral' && (
        <div className="split">
          <div className="panel">
            <h3>Dados principais</h3>
            <dl className="kv">
              <dt>Contato</dt><dd>{c.contact_name || '—'}</dd>
              <dt>Telefone</dt><dd>{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : '—'}</dd>
              <dt>E-mail</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
              <dt>Cliente desde</dt><dd>{fdFull(c.created_at)}</dd>
              <dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{c.notes || '—'}</dd>
            </dl>
          </div>
          <div className="panel">
            <h3>Serviços ativos</h3>
            {svc.length ? svc.map((x, i) => <div key={i}><i className="chip">{x.service_name}{x.offer_label ? ` · ${x.offer_label}` : ''}</i></div>)
              : <p className="mu" style={{ margin: 0 }}>Nenhum contrato ativo</p>}
            {can('projetos') && <>
              <h3 style={{ marginTop: 16 }}>Operação</h3>
              <dl className="kv"><dt>Tarefas em aberto</dt><dd>{openT.length}</dd><dt>Atrasadas</dt><dd style={lateT.length ? { color: 'var(--er)', fontWeight: 700 } : undefined}>{lateT.length}</dd></dl>
            </>}
          </div>
        </div>
      )}

      {tab === 'contratos' && (
        (contracts.data ?? []).length ? (contracts.data ?? []).map((k) => {
          const its = (items.data ?? []).filter((i) => i.contract_id === k.id)
          const st = CONTRACT_STATUS[k.status]
          return (
            <Link key={k.id} to={`/contratos/${k.id}`} className="row">
              <div><b>Contrato {k.start_date ? `desde ${fdFull(k.start_date)}` : '(rascunho)'}</b><br />
                <small>{k.renewal === 'automatica' ? 'Renovação automática' : 'Renovação manual'}{k.notice_days ? ` · aviso prévio ${k.notice_days} dias` : ''}{k.due_day ? ` · vence dia ${k.due_day}` : ''}</small></div>
              <div className="meta">{can('financeiro') && <span className="mu">{money(contractMonthly(its))}/mês</span>}<Tag color={st.color}>{st.label}</Tag></div>
            </Link>
          )
        }) : <Empty action={can('contratos', 'write') && <Link className="btn primary" to={`/contratos/novo?cliente=${c.id}`}>Criar contrato</Link>}>Nenhum contrato para este cliente</Empty>
      )}

      {tab === 'projetos' && (
        <>
          {(projects.data ?? []).map((p) => {
            const pt = (tasks.data ?? []).filter((t) => t.project_id === p.id)
            const done = pt.filter((t) => t.done_at).length
            const ps = projStatus.byId(p.status_id)
            return (
              <Link key={p.id} to={`/projetos?projeto=${p.id}`} className="row">
                <div><b>{p.name}</b><br /><small>{people.name(p.owner_id) || 'sem responsável'} · prazo {fd(p.due_date)} · {done}/{pt.length} tarefas</small></div>
                <Tag color={ps?.color}>{ps?.label ?? '—'}</Tag>
              </Link>
            )
          })}
          {!projects.data?.length && <Empty>Nenhum projeto deste cliente. Projetos são criados ao ativar um contrato ou em Projetos.</Empty>}
        </>
      )}

      {tab === 'historico' && <Comments entity="client" id={c.id} />}

      <p className="mu" style={{ fontSize: 13, marginTop: 32 }}>Briefing, Estratégia, Produções, Campanhas e Reuniões entram como abas na Fase 2</p>
      {editing && <ClientForm client={c} onClose={() => setEditing(false)} />}
    </>
  )
}
