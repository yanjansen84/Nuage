import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../data/db'
import { usePeople, useRun, useTable } from '../data/hooks'
import type { Content, EventRow, Task } from '../data/types'
import { useAuth } from '../lib/auth'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { addDays, Empty, Field, fdFull, Loading, money, nn, PageHead, Seg, Select, today } from '../ui/kit'
import { minEnd } from './contratosUtil'
import { TaskForm } from './Projetos'
import { ContentForm } from './Conteudo'

type Kind = 'conteudo' | 'tarefa' | 'projeto' | 'compromisso' | 'pagamento' | 'contrato' | 'lead'
const KIND: Record<Kind, { label: string; color: string }> = {
  compromisso: { label: 'Compromissos', color: '#0e9aa7' },
  conteudo: { label: 'Conteúdos', color: '#2f80ed' },
  tarefa: { label: 'Tarefas', color: '#ea5c2a' },
  projeto: { label: 'Entregas de projeto', color: '#5b4bdb' },
  pagamento: { label: 'Vencimentos', color: '#2e9e6a' },
  contrato: { label: 'Contratos', color: '#b97d00' },
  lead: { label: 'Retornos comerciais', color: '#d6336c' },
}

interface Item {
  key: string; kind: Kind; date: string; time?: string | null; title: string; sub: string; done?: boolean
  clientId: string | null; open: () => void
}

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export default function Agenda() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const client = sp.get('cliente') ?? ''
  const setClient = (v: string) => { const n = new URLSearchParams(sp); if (v) n.set('cliente', v); else n.delete('cliente'); setSp(n, { replace: true }) }
  const [view, setView] = useState<'mes' | 'lista'>('mes')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [hidden, setHidden] = useState<Kind[]>([])
  const [day, setDay] = useState<string | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [event, setEvent] = useState<EventRow | { date: string } | null>(null)

  const clients = useTable('clients', { order: { column: 'name' }, enabled: can('clientes') })
  const events = useTable('events', { order: { column: 'date' } })
  const tasks = useTable('tasks', { enabled: can('projetos') })
  const projects = useTable('projects', { enabled: can('projetos') })
  const contracts = useTable('contracts', { enabled: can('contratos') })
  const payments = useTable('payments', { enabled: can('financeiro') })
  const leads = useTable('leads', { enabled: can('crm') })
  const contents = useTable('contents', { enabled: can('producao') })
  const [content, setContent] = useState<Content | null>(null)
  const people = usePeople()

  const cname = (id: string | null | undefined) => clients.data?.find((c) => c.id === id)?.name
  const contractClient = (id: string) => contracts.data?.find((k) => k.id === id)?.client_id ?? null

  const all = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const e of events.data ?? []) out.push({
      key: `e${e.id}`, kind: 'compromisso', date: e.date, time: e.time?.slice(0, 5), title: e.title,
      sub: [cname(e.client_id), e.profile_id ? people.name(e.profile_id) : 'Toda a agência'].filter(Boolean).join(' · '),
      clientId: e.client_id, open: () => setEvent(e),
    })
    for (const c of contents.data ?? []) if (c.publish_date) out.push({
      key: `c${c.id}`, kind: 'conteudo', date: c.publish_date, time: c.publish_time?.slice(0, 5), title: c.title, done: !!c.posted_at,
      sub: [cname(c.client_id), c.channel, c.posted_at ? 'postado' : 'a postar'].filter(Boolean).join(' · '),
      clientId: c.client_id, open: () => setContent(c),
    })
    for (const t of tasks.data ?? []) if (t.due_date) out.push({
      key: `t${t.id}`, kind: 'tarefa', date: t.due_date, title: t.title, done: !!t.done_at,
      sub: [cname(t.client_id), people.name(t.owner_id) || 'sem responsável'].filter(Boolean).join(' · '),
      clientId: t.client_id, open: () => setTask(t),
    })
    for (const p of projects.data ?? []) if (p.due_date) out.push({
      key: `p${p.id}`, kind: 'projeto', date: p.due_date, title: `Entrega: ${p.name}`,
      sub: [cname(p.client_id), people.name(p.owner_id)].filter(Boolean).join(' · '),
      clientId: p.client_id, open: () => navigate(`/projetos?projeto=${p.id}`),
    })
    for (const p of payments.data ?? []) if (p.status !== 'cancelado') out.push({
      key: `$${p.id}`, kind: 'pagamento', date: p.due_date, title: `Vencimento ${money(p.amount)}`, done: p.status === 'pago',
      sub: [cname(contractClient(p.contract_id)), p.notes].filter(Boolean).join(' · '),
      clientId: contractClient(p.contract_id), open: () => navigate('/financeiro'),
    })
    for (const k of contracts.data ?? []) {
      if (k.status === 'rascunho') continue
      const open = () => navigate(`/contratos/${k.id}`)
      if (k.start_date) out.push({ key: `ks${k.id}`, kind: 'contrato', date: k.start_date, title: 'Início do contrato', sub: cname(k.client_id) ?? '', clientId: k.client_id, open })
      const end = minEnd(k)
      if (end && k.status === 'ativo') {
        out.push({ key: `ke${k.id}`, kind: 'contrato', date: end, title: 'Fim do prazo mínimo', sub: `${cname(k.client_id) ?? ''} · renovação ${k.renewal === 'automatica' ? 'automática' : 'manual'}`, clientId: k.client_id, open })
        if (k.notice_days) out.push({ key: `kn${k.id}`, kind: 'contrato', date: addDays(end, -k.notice_days), title: `Limite do aviso prévio (${k.notice_days} dias)`, sub: cname(k.client_id) ?? '', clientId: k.client_id, open })
      }
    }
    for (const l of leads.data ?? []) if (l.follow_up && !l.client_id) out.push({
      key: `l${l.id}`, kind: 'lead', date: l.follow_up, title: `Retorno: ${l.name}`, sub: [l.company, people.name(l.owner_id)].filter(Boolean).join(' · '),
      clientId: l.client_id, open: () => navigate('/comercial'),
    })
    return out.sort((a, b) => (a.date + (a.time ?? '99')).localeCompare(b.date + (b.time ?? '99')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.data, contents.data, tasks.data, projects.data, payments.data, contracts.data, leads.data, clients.data, people.data])

  const items = all.filter((i) => !hidden.includes(i.kind) && (!client || i.clientId === client))
  const kinds = (Object.keys(KIND) as Kind[]).filter((k) =>
    k === 'compromisso' || (k === 'conteudo' ? can('producao') : k === 'tarefa' || k === 'projeto' ? can('projetos') : k === 'pagamento' ? can('financeiro') : k === 'contrato' ? can('contratos') : can('crm')))
  const td = today()
  const loading = events.isLoading || tasks.isLoading

  // ---------- mês ----------
  const y = month.getFullYear(), m = month.getMonth()
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate()
  const byDay = (d: string) => items.filter((i) => i.date === d)
  const monthLabel = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // ---------- lista ----------
  const late = items.filter((i) => i.date < td && !i.done && (i.kind === 'tarefa' || i.kind === 'pagamento' || i.kind === 'conteudo'))
  const upcoming = items.filter((i) => i.date >= td && i.date <= addDays(td, 60))
  const groups = upcoming.reduce<Record<string, Item[]>>((a, i) => { (a[i.date] ||= []).push(i); return a }, {})

  const row = (i: Item) => (
    <button key={i.key} type="button" className="row" onClick={i.open} style={{ borderLeft: `5px solid ${KIND[i.kind].color}` }}>
      <div>
        <b style={i.done ? { textDecoration: 'line-through', opacity: .6 } : undefined}>{i.time ? `${i.time} · ` : ''}{i.title}</b><br />
        <small>{i.sub}</small>
      </div>
      <span className="tag" style={{ background: KIND[i.kind].color, color: '#fff' }}>{KIND[i.kind].label.replace(/s$/, '').replace('Entregas de projeto', 'Entrega').replace('Retornos comerciais', 'Retorno')}</span>
    </button>
  )
  const dayLabel = (d: string) => { const x = new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return x.charAt(0).toUpperCase() + x.slice(1) }

  return (
    <>
      <PageHead title="Agenda" sub={client ? `Tudo o que está programado para ${cname(client) ?? 'o cliente'}.` : 'Tudo o que está programado na agência. Escolha um cliente para filtrar.'}
        actions={<button className="btn primary" onClick={() => setEvent({ date: td })}>Novo compromisso</button>} />

      <div className="toolbar">
        {can('clientes') && <Select value={client} onChange={(e) => setClient(e.target.value)} placeholder="Todos os clientes" aria-label="Cliente"
          options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />}
        <Seg value={view} onChange={setView} items={[['mes', 'Mês'], ['lista', 'Próximos 60 dias']]} />
        <div className="legend">
          {kinds.map((k) => (
            <label key={k} className={hidden.includes(k) ? 'off' : ''}>
              <input type="checkbox" checked={!hidden.includes(k)} onChange={(e) => setHidden(e.target.checked ? hidden.filter((x) => x !== k) : [...hidden, k])} />
              <i style={{ background: KIND[k].color }} />{KIND[k].label}
            </label>
          ))}
        </div>
      </div>

      {loading ? <Loading /> : view === 'mes' ? (
        <>
          <div className="toolbar month-nav">
            <button className="btn icon" aria-label="Mês anterior" onClick={() => setMonth(new Date(y, m - 1, 1))}><ChevronLeft aria-hidden /></button>
            <b className="label">{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</b>
            <button className="btn icon" aria-label="Próximo mês" onClick={() => setMonth(new Date(y, m + 1, 1))}><ChevronRight aria-hidden /></button>
            <button className="btn" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Hoje</button>
          </div>
          <div className="mg" role="grid" aria-label={`Calendário de ${monthLabel}`}>
            {WEEK.map((w) => <div key={w} className="h" role="columnheader">{w}</div>)}
            {Array.from({ length: first }, (_, i) => <div key={`b${i}`} className="blank" />)}
            {Array.from({ length: days }, (_, i) => {
              const d = ymd(y, m, i + 1)
              const list = byDay(d)
              return (
                <button key={d} type="button" className={`day ${d === td ? 'today' : ''} ${d < td ? 'past' : ''}`} onClick={() => setDay(d)} aria-label={`${dayLabel(d)}, ${list.length} itens`}>
                  <b>{i + 1}</b>
                  {list.slice(0, 3).map((it) => (
                    <em key={it.key} style={{ background: KIND[it.kind].color, ...(it.done ? { opacity: .5, textDecoration: 'line-through' } : {}) }}>
                      {it.time ? `${it.time} ` : ''}{it.title}
                    </em>
                  ))}
                  {list.length > 3 && <small>+{list.length - 3}</small>}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          {late.length > 0 && <><h2>Atrasados</h2>{late.map(row)}</>}
          {Object.keys(groups).length ? Object.entries(groups).map(([d, list]) => (
            <div key={d}>
              <h2>{d === td ? 'Hoje' : d === addDays(td, 1) ? 'Amanhã' : dayLabel(d)}</h2>
              {list.map(row)}
            </div>
          )) : <Empty>Nada programado nos próximos 60 dias{client ? ' para este cliente' : ''}.</Empty>}
        </>
      )}

      {day && (
        <Modal open onClose={() => setDay(null)} title={dayLabel(day)}
          footer={<><button className="btn primary" onClick={() => { setEvent({ date: day }); setDay(null) }}>Novo compromisso neste dia</button><button className="btn" onClick={() => setDay(null)}>Fechar</button></>}>
          {byDay(day).length ? byDay(day).map((i) => row({ ...i, open: () => { setDay(null); i.open() } })) : <p className="mu">Nada programado neste dia</p>}
        </Modal>
      )}
      {content && <ContentForm key={content.id} content={content} onClose={() => setContent(null)} />}
      {task && <TaskForm key={task.id} task={task} onClose={() => setTask(null)} onOpen={setTask} />}
      {event && <EventForm event={'id' in event ? event : null} date={event.date} defaultClient={client} onClose={() => setEvent(null)} />}
    </>
  )
}

export function EventForm({ event, date, defaultClient, onClose }: { event: EventRow | null; date: string; defaultClient: string; onClose: () => void }) {
  const { can, profile } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const people = usePeople()
  const clients = useTable('clients', { order: { column: 'name' }, enabled: can('clientes') })
  const me = db.currentUserId() ?? profile?.id
  const canEdit = !event || event.created_by === me || can('configuracoes', 'write')
  // compromisso existente abre só para leitura; "Editar" libera os campos
  const [editing, setEditing] = useState(!event)
  const initial = () => ({
    title: event?.title ?? '', date: event?.date ?? date, time: event?.time?.slice(0, 5) ?? '', profile_id: event?.profile_id ?? '',
    client_id: event?.client_id ?? defaultClient, notes: event?.notes ?? '',
  })
  const [f, setF] = useState(initial)
  const cancelEdit = () => { setF(initial()); setEditing(false) }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const valid = f.title.trim() && f.date

  async function save() {
    if (!valid) return
    const p = { title: f.title.trim(), date: f.date, time: f.time || null, profile_id: f.profile_id || null, client_id: f.client_id || null, notes: nn(f.notes) }
    const ok = await run(async () => { if (event) await db.update('events', { id: event.id }, p); else await db.insert('events', p) }, 'Compromisso salvo')
    if (ok) onClose()
  }
  async function remove() {
    if (!event || !(await confirm('Excluir este compromisso?', { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('events', { id: event.id }), 'Compromisso excluído')) onClose()
  }

  return (
    <Modal open onClose={onClose} title={!event ? 'Novo compromisso' : editing ? 'Editar compromisso' : 'Compromisso'}
      footer={<>
        {canEdit && !editing && <button className="btn primary" onClick={() => setEditing(true)}><Pencil aria-hidden />Editar</button>}
        {canEdit && editing && <button className="btn primary" onClick={save} disabled={!valid}>Salvar</button>}
        {event && editing
          ? <button className="btn" onClick={cancelEdit}>Cancelar edição</button>
          : <button className="btn" onClick={onClose}>{event ? 'Fechar' : 'Cancelar'}</button>}
        {event && editing && canEdit && <button className="btn danger push" onClick={remove}>Excluir</button>}
      </>}>
      <fieldset disabled={!canEdit || !editing} className={editing ? undefined : 'readonly'} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Título *" full><input value={f.title} onChange={set('title')} autoFocus={!event} placeholder="Ex.: Reunião de alinhamento, captação de vídeo" /></Field>
          <Field label="Data *"><input type="date" value={f.date} onChange={set('date')} /></Field>
          <Field label="Horário"><input type="time" value={f.time} onChange={set('time')} /></Field>
          <Field label="Participante"><Select value={f.profile_id} onChange={set('profile_id')} placeholder="Toda a agência" options={people.active.map((p) => ({ value: p.id, label: p.name }))} /></Field>
          {can('clientes') && <Field label="Cliente"><Select value={f.client_id} onChange={set('client_id')} placeholder="Sem cliente (interno)" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>}
          <Field label="Observações" full><textarea value={f.notes} onChange={set('notes')} placeholder="Pauta, local, link da reunião…" /></Field>
        </div>
      </fieldset>
      {event && <p className="hist">Criado em {fdFull(event.created_at)}</p>}
    </Modal>
  )
}
