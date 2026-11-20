import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useOptions, usePeople, useTable } from '../data/hooks'
import type { Content, EventRow, Task } from '../data/types'
import { useAuth } from '../lib/auth'
import { addDays, fd, Kpi, money, today } from '../ui/kit'
import { contractMonthly, payState } from './contratosUtil'
import { TaskForm } from './Projetos'
import { ContentForm } from './Conteudo'
import { EventForm } from './Agenda'
import { MonthGrid } from '../components/MonthGrid'
import { Modal } from '../ui/Modal'
import { Seg } from '../ui/kit'
import { Plus } from 'lucide-react'

export default function Inicio() {
  const { profile, can, scope } = useAuth()
  const navigate = useNavigate()
  const seeTasks = can('projetos')
  const allTasks = scope('projetos') === 'all'
  const fin = can('financeiro')

  const tasks = useTable('tasks', { enabled: seeTasks })
  const projects = useTable('projects', { enabled: seeTasks })
  const projStatus = useOptions('project_status')
  const clients = useTable('clients', { enabled: can('clientes') })
  const clientStatus = useOptions('client_status')
  const leads = useTable('leads', { enabled: can('crm') })
  const stages = useOptions('lead_stage')
  const payments = useTable('payments', { enabled: fin })
  const contracts = useTable('contracts', { enabled: fin && can('contratos') })
  const items = useTable('contract_items', { enabled: fin && can('contratos') })
  const people = usePeople()
  const [open, setOpen] = useState<Task | null>(null)
  // calendário "Agenda da agência" (como no protótipo)
  const events = useTable('events', { order: { column: 'date' } })
  const contents = useTable('contents', { enabled: can('producao') })
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [day, setDay] = useState<string | null>(null)
  const [daySec, setDaySec] = useState<'ev' | 'ct'>('ev')
  const [event, setEvent] = useState<EventRow | { date: string } | null>(null)
  const [content, setContent] = useState<Content | { date: string } | null>(null)

  const td = today()
  const in7 = addDays(td, 7)
  const T = (tasks.data ?? []).filter((t) => !t.parent_id)
  const openT = T.filter((t) => !t.done_at)
  const late = openT.filter((t) => t.due_date && t.due_date < td)
  const unassigned = openT.filter((t) => !t.owner_id)
  const next7 = openT.filter((t) => t.due_date && t.due_date >= td && t.due_date <= in7).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  const activeProjects = (projects.data ?? []).filter((p) => !projStatus.byId(p.status_id)?.is_final)
  const lateProjects = activeProjects.filter((p) => p.due_date && p.due_date < td)
  const activeClients = (clients.data ?? []).filter((c) => clientStatus.byId(c.status_id)?.label === 'Ativo')
  const openLeads = (leads.data ?? []).filter((l) => !stages.byId(l.stage_id)?.is_final)
  const lateLeads = openLeads.filter((l) => l.follow_up && l.follow_up < td)
  const ym = td.slice(0, 7)
  const P = payments.data ?? []
  const lateP = P.filter((p) => payState(p) === 'atrasado')
  const contratado = (contracts.data ?? []).filter((k) => k.status === 'ativo')
    .reduce((a, k) => a + contractMonthly((items.data ?? []).filter((i) => i.contract_id === k.id)), 0)
  const recebido = P.filter((p) => p.status === 'pago' && p.paid_at?.startsWith(ym)).reduce((a, p) => a + p.amount, 0)
  const previsto = P.filter((p) => p.due_date.startsWith(ym) && p.status !== 'cancelado').reduce((a, p) => a + p.amount, 0)

  const hr = new Date().getHours()
  const greet = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'
  const cname = (id: string | null) => clients.data?.find((c) => c.id === id)?.name
  const pname = (id: string | null) => projects.data?.find((p) => p.id === id)?.name
  const go = (path: string) => () => navigate(path)
  const eventsOn = (d: string) => (events.data ?? []).filter((e) => e.date === d).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  const postsOn = (d: string) => (contents.data ?? []).filter((c) => c.publish_date === d)
  const dayTitle = (d: string) => { const x = new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return x.charAt(0).toUpperCase() + x.slice(1) }

  type Att = { key: string; title: string; sub: string; why: string; hot: boolean; onClick: () => void }
  const attention: Att[] = [
    ...late.map((t) => ({ key: t.id, title: t.title, sub: `${cname(t.client_id) ?? pname(t.project_id) ?? 'Sem cliente'} · ${people.name(t.owner_id) || 'sem responsável'} · prazo ${fd(t.due_date)}`, why: 'Tarefa atrasada', hot: true, onClick: () => setOpen(t) })),
    ...(fin ? lateP.map((p) => ({ key: p.id, title: `Pagamento de ${money(p.amount)}`, sub: `${p.notes ?? ''} · venceu ${fd(p.due_date)}`, why: 'Pagamento atrasado', hot: true, onClick: go('/financeiro') })) : []),
    ...lateLeads.map((l) => ({ key: l.id, title: l.name, sub: `${l.company ?? ''} · retorno ${fd(l.follow_up)}`, why: 'Retorno de lead vencido', hot: false, onClick: go('/comercial') })),
    ...(allTasks ? unassigned.filter((t) => !late.includes(t)).map((t) => ({ key: t.id, title: t.title, sub: `${cname(t.client_id) ?? pname(t.project_id) ?? ''} · prazo ${fd(t.due_date)}`, why: 'Sem responsável', hot: false, onClick: () => setOpen(t) })) : []),
    ...lateProjects.map((p) => ({ key: p.id, title: p.name, sub: `prazo ${fd(p.due_date)}`, why: 'Projeto atrasado', hot: true, onClick: go(`/projetos?projeto=${p.id}`) })),
  ]

  const load = allTasks ? people.active.map((p) => {
    const mine = openT.filter((t) => t.owner_id === p.id)
    const hours = mine.reduce((a, t) => a + (t.effort_hours ?? 0), 0)
    const cap = p.weekly_capacity_hours
    const over = cap ? hours > cap : mine.length > 6
    return { id: p.id, name: p.name, n: mine.length, late: mine.filter((t) => late.includes(t)).length, hours, cap, over }
  }) : []

  return (
    <>
      <section className="hero">
        <h1>{greet}, {profile?.name.split(' ')[0]}</h1>
        <p>Situação da agência hoje na Na.Nu</p>
      </section>

      <div className="kpis">
        {seeTasks && <Kpi value={openT.length} label={allTasks ? 'tarefas em aberto' : 'minhas tarefas em aberto'} onClick={go('/projetos')} />}
        {seeTasks && <Kpi value={late.length} label="atrasadas" onClick={go('/projetos')} />}
        {seeTasks && <Kpi value={activeProjects.length} label="projetos ativos" onClick={go('/projetos?aba=projetos')} />}
        {can('clientes') && <Kpi value={activeClients.length} label="clientes ativos" onClick={go('/clientes')} />}
        {can('crm') && <Kpi value={openLeads.length} label="leads em andamento" onClick={go('/comercial')} />}
      </div>

      <h2>Agenda da agência</h2>
      <p className="mu" style={{ margin: '-4px 0 12px', fontSize: 14 }}>Toque em um dia para ver os compromissos{can('producao') ? ' e os conteúdos a publicar' : ''}</p>
      <MonthGrid month={month} onMonth={setMonth}
        onDay={(d) => { setDay(d); setDaySec('ev') }}
        actions={<button className="btn primary" onClick={() => setEvent({ date: td })}><Plus aria-hidden />Novo compromisso</button>}
        dayLabel={(d) => `${d}: ${eventsOn(d).length} compromissos, ${postsOn(d).length} conteúdos`}
        renderDay={(d) => {
          const E = eventsOn(d), P = postsOn(d)
          return (
            <>
              {E.slice(0, 2).map((e) => <em key={e.id} style={{ background: 'var(--ac)' }}>{e.time ? `${e.time.slice(0, 5)} ` : ''}{e.title}</em>)}
              {E.length > 2 && <small>+{E.length - 2}</small>}
              {P.length > 0 && <em style={{ background: '#5b4bdb' }}>{P.length} {P.length > 1 ? 'posts' : 'post'}{P.every((c) => c.posted_at) ? ' ✓' : ''}</em>}
            </>
          )
        }} />

      {fin && (
        <>
          <h2>Saúde financeira · {new Date().toLocaleDateString('pt-BR', { month: 'long' })}</h2>
          <div className="kpis neutral">
            {can('contratos') && <Kpi value={money(contratado)} label="contratado por mês" onClick={go('/financeiro')} />}
            <Kpi value={money(recebido)} label="recebido no mês" onClick={go('/financeiro')} />
            <Kpi value={money(previsto)} label="previsto no mês" onClick={go('/financeiro')} />
            <Kpi value={lateP.length} label="pagamentos atrasados" onClick={go('/financeiro')} />
          </div>
          <p className="money-note">Indicadores diferentes: não devem ser somados.</p>
        </>
      )}

      <h2>Precisa de atenção</h2>
      {attention.length ? attention.slice(0, 10).map((a) => (
        <button key={a.why + a.key} type="button" className="row" onClick={a.onClick} style={{ borderLeft: `5px solid ${a.hot ? 'var(--er)' : 'var(--ac)'}` }}>
          <div><b>{a.title}</b><br /><small>{a.sub}</small></div>
          <span className={`tag ${a.hot ? 'late' : ''}`}>{a.why}</span>
        </button>
      )) : <p className="mu">{tasks.isLoading ? 'Carregando…' : 'Nada pendente por aqui'}</p>}

      {seeTasks && (
        <>
          <h2>Entregas dos próximos 7 dias</h2>
          {next7.length ? next7.map((t) => (
            <button key={t.id} type="button" className="row" onClick={() => setOpen(t)}>
              <div><b>{t.title}</b><br /><small>{cname(t.client_id) ?? pname(t.project_id) ?? ''} · {people.name(t.owner_id) || 'sem responsável'}</small></div>
              <span className="tag">{fd(t.due_date)}</span>
            </button>
          )) : <p className="mu">Nenhuma entrega prevista para a semana</p>}
        </>
      )}

      {allTasks && (
        <>
          <h2>Carga da equipe</h2>
          {load.length ? load.map((p) => (
            <Link key={p.id} to="/configuracoes?aba=equipe" className="row">
              <div>{p.name}<br /><small>{p.hours ? `${p.hours}h estimadas` : 'sem estimativa de horas'}{p.cap ? ` · capacidade ${p.cap}h/semana` : ''}{p.late ? ` · ${p.late} atrasada(s)` : ''}</small></div>
              <span className={`tag ${p.over ? 'late' : ''}`}>{p.n} em aberto{p.over ? ' · sobrecarga' : ''}</span>
            </Link>
          )) : <p className="mu">Convide a equipe em Configurações</p>}
        </>
      )}

      {day && (
        <Modal open onClose={() => setDay(null)} title={dayTitle(day)}
          footer={<>
            {daySec === 'ev'
              ? <button className="btn primary" onClick={() => { setEvent({ date: day }); setDay(null) }}><Plus aria-hidden />Novo compromisso</button>
              : can('producao', 'write') && <button className="btn primary" onClick={() => { setContent({ date: day }); setDay(null) }}><Plus aria-hidden />Novo conteúdo neste dia</button>}
            <button className="btn" onClick={() => setDay(null)}>Fechar</button>
          </>}>
          {can('producao') && <div style={{ marginBottom: 16 }}><Seg value={daySec} onChange={setDaySec} items={[['ev', `Compromissos (${eventsOn(day).length})`], ['ct', `Conteúdos do dia (${postsOn(day).length})`]]} /></div>}
          {daySec === 'ev' ? (
            eventsOn(day).length ? eventsOn(day).map((e) => (
              <button key={e.id} type="button" className="row" onClick={() => { setEvent(e); setDay(null) }}>
                <div><b>{e.title}</b><br /><small>{e.time ? e.time.slice(0, 5) : 'Dia todo'}{e.profile_id ? ` · ${people.name(e.profile_id)}` : ' · toda a agência'}{e.client_id && cname(e.client_id) ? ` · ${cname(e.client_id)}` : ''}</small></div>
              </button>
            )) : <p className="mu">Sem compromissos neste dia</p>
          ) : (
            postsOn(day).length ? postsOn(day).map((c) => (
              <button key={c.id} type="button" className="row" onClick={() => { setContent(c); setDay(null) }} style={{ borderLeft: `5px solid ${c.posted_at ? '#2e9e6a' : '#5b4bdb'}` }}>
                <div><b>{c.title}</b><br /><small>{cname(c.client_id) ?? 'Sem cliente'}{c.publish_time ? ` · ${c.publish_time.slice(0, 5)}` : ''} · {people.name(c.owner_id) || 'sem responsável'}</small></div>
                <span className="tag" style={c.posted_at ? { background: '#2e9e6a', color: '#fff' } : undefined}>{c.posted_at ? 'Postado' : 'A postar'}</span>
              </button>
            )) : <p className="mu">Nenhum conteúdo para publicar neste dia</p>
          )}
        </Modal>
      )}
      {event && <EventForm event={'id' in event ? event : null} date={event.date} defaultClient="" onClose={() => setEvent(null)} />}
      {content && <ContentForm key={'id' in content ? content.id : 'new'} content={'id' in content ? content as Content : null} date={'id' in content ? undefined : content.date} onClose={() => setContent(null)} />}
      {open && <TaskForm key={open.id} task={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
    </>
  )
}
