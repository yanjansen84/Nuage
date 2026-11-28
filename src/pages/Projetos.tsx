import { Check, Download, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../data/db'
import { useOpenFromUrl, useOptions, usePeople, useRun, useTable } from '../data/hooks'
import type { Priority, Project, Task } from '../data/types'
import { useAuth } from '../lib/auth'
import { downloadCsv } from '../lib/csv'
import { Comments } from '../components/Comments'
import { Kanban } from '../components/Kanban'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { Empty, Field, fd, Loading, maskDecimal, nn, num, PageHead, PRIORITY, Progress, Seg, Select, Tabs, Tag, today } from '../ui/kit'

type View = 'tarefas' | 'projetos'

export default function Projetos() {
  const [sp, setSp] = useSearchParams()
  const view: View = sp.get('aba') === 'projetos' ? 'projetos' : 'tarefas'
  const setView = (v: View) => { const n = new URLSearchParams(sp); if (v === 'projetos') n.set('aba', 'projetos'); else n.delete('aba'); setSp(n, { replace: true }) }
  const projects = useTable('projects')
  const tasks = useTable('tasks')
  return (
    <>
      <PageHead title="Projetos e tarefas" />
      <Tabs value={view} onChange={setView} items={[
        { key: 'tarefas', label: 'Tarefas', badge: (tasks.data ?? []).filter((t) => !t.done_at && !t.parent_id).length },
        { key: 'projetos', label: 'Projetos', badge: projects.data?.length },
      ]} />
      {view === 'tarefas' ? <TaskList /> : <ProjectList />}
    </>
  )
}

// ======================================================================
// Tarefas
// ======================================================================
function useTaskHelpers() {
  const status = useOptions('task_status')
  const deps = useTable('task_dependencies')
  const tasks = useTable('tasks')
  const doneStatus = status.list.find((s) => s.is_final)
  const openStatus = status.list.find((s) => !s.is_final)
  const blocked = (t: Task) => !t.done_at && (deps.data ?? []).some((d) => d.task_id === t.id &&
    (tasks.data ?? []).some((x) => x.id === d.depends_on && !x.done_at))
  return { status, doneStatus, openStatus, blocked }
}

function TaskList() {
  const { can, scope } = useAuth()
  const run = useRun()
  const { toast } = useFeedback()
  const [sp, setSp] = useSearchParams()
  const tasks = useTable('tasks', { order: { column: 'due_date' } })
  const projects = useTable('projects')
  const clients = useTable('clients', { enabled: can('clientes') })
  const people = usePeople()
  const { status, doneStatus, openStatus, blocked } = useTaskHelpers()
  const [mode, setMode] = useState<'list' | 'kb'>('kb')
  const [show, setShow] = useState<'p' | 'd' | 'a'>('p')
  const [who, setWho] = useState('')
  const [cli, setCli] = useState('')
  const proj = sp.get('projeto') ?? ''
  const setProj = (v: string) => { const n = new URLSearchParams(sp); if (v) n.set('projeto', v); else n.delete('projeto'); setSp(n, { replace: true }) }
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  useOpenFromUrl('tarefa', tasks.data, setEditing)

  const A = (tasks.data ?? []).filter((t) => !t.parent_id && (!proj || t.project_id === proj))
  const done = A.filter((t) => t.done_at).length
  const pc = A.length ? Math.round((done / A.length) * 100) : 0
  const L = A.filter((t) => (show === 'a' || (show === 'p' ? !t.done_at : !!t.done_at)) && (!who || t.owner_id === who) && (!cli || t.client_id === cli))
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
  const late = (t: Task) => !t.done_at && t.due_date && t.due_date < today()
  const cname = (id: string | null) => clients.data?.find((c) => c.id === id)?.name
  const pname = (id: string | null) => projects.data?.find((p) => p.id === id)?.name

  async function moveTo(t: Task, statusId: string) {
    if (status.byId(statusId)?.is_final && blocked(t)) return toast('Esta tarefa depende de outra que ainda não foi concluída', true)
    await run(() => db.update('tasks', { id: t.id }, { status_id: statusId }), `Movida para ${status.byId(statusId)?.label ?? ''}`)
  }

  async function toggle(t: Task) {
    if (!doneStatus || !openStatus) return
    await run(() => db.update('tasks', { id: t.id }, { status_id: t.done_at ? openStatus.id : doneStatus.id }), t.done_at ? 'Tarefa reaberta' : 'Tarefa concluída')
  }

  const row = (t: Task) => {
    const st = status.byId(t.status_id)
    const color = t.done_at ? 'var(--ok)' : late(t) ? 'var(--er)' : 'var(--ac)'
    const bl = blocked(t)
    return (
      <div key={t.id} className={`row tk ${t.done_at ? 'dn' : ''}`} style={{ borderLeft: `5px solid ${color}` }}>
        <button className={`ck ${t.done_at ? 'on' : ''}`} onClick={() => toggle(t)} disabled={!can('projetos', 'write') || bl}
          aria-label={t.done_at ? `Reabrir ${t.title}` : `Concluir ${t.title}`} title={bl ? 'Bloqueada por dependência' : undefined}>{t.done_at && <Check aria-hidden />}</button>
        <div role="button" tabIndex={0} onClick={() => setEditing(t)} onKeyDown={(e) => e.key === 'Enter' && setEditing(t)} style={{ cursor: 'pointer' }}>
          <b>{t.title}</b><br />
          <small>{[cname(t.client_id) ?? pname(t.project_id), people.name(t.owner_id) || 'sem responsável', `prazo ${fd(t.due_date)}`].filter(Boolean).join(' · ')}</small>
        </div>
        <div className="meta">
          {t.priority !== 'media' && !t.done_at && <Tag color={PRIORITY[t.priority].color} solid={false}>{PRIORITY[t.priority].label}</Tag>}
          {bl && <span className="tag late">Bloqueada</span>}
          <Tag color={t.done_at ? '#2e9e6a' : late(t) ? '#c0392b' : st?.color}>{t.done_at ? 'Concluída' : late(t) ? 'Atrasada' : st?.label ?? 'Pendente'}</Tag>
        </div>
      </div>
    )
  }

  return (
    <>
      <Progress value={pc} />
      <p className="mu">{done} de {A.length} concluídas ({pc}%){scope('projetos') === 'own' && ' · você vê apenas as tarefas atribuídas a você'}</p>
      <div className="toolbar">
        <Seg value={mode} onChange={setMode} items={[['kb', 'Kanban'], ['list', 'Lista']]} />
        {mode === 'list' && <Seg value={show} onChange={setShow} items={[['p', 'Pendentes'], ['d', 'Concluídas'], ['a', 'Todas']]} />}
        <Select value={who} onChange={(e) => setWho(e.target.value)} placeholder="Todos os responsáveis" options={people.active.map((p) => ({ value: p.id, label: p.name }))} aria-label="Responsável" />
        {can('clientes') && <Select value={cli} onChange={(e) => setCli(e.target.value)} placeholder="Todos os clientes" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} aria-label="Cliente" />}
        <Select value={proj} onChange={(e) => setProj(e.target.value)} placeholder="Todos os projetos" options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} aria-label="Projeto" />
        <span className="spacer" />
        {L.length > 0 && (
          <button className="btn" onClick={() => downloadCsv(
            `tarefas-${today()}.csv`,
            ['Título', 'Status', 'Prioridade', 'Responsável', 'Cliente', 'Projeto', 'Início', 'Prazo', 'Esforço (h)', 'Concluída em'],
            L.map((t) => [
              t.title, status.byId(t.status_id)?.label, PRIORITY[t.priority].label,
              people.name(t.owner_id), cname(t.client_id), pname(t.project_id),
              t.start_date, t.due_date, t.effort_hours, t.done_at ? t.done_at.slice(0, 10) : '',
            ]),
          )}><Download aria-hidden />Exportar CSV</button>
        )}
        {can('projetos', 'write') && <button className="btn primary" onClick={() => setEditing('new')}>Nova tarefa</button>}
      </div>
      {tasks.isLoading ? <Loading /> : mode === 'list' ? (
        L.length ? L.map(row) : <Empty>{A.length ? 'Nenhuma tarefa com esses filtros' : 'Nenhuma tarefa ainda'}</Empty>
      ) : (
        <Kanban columns={status.list} columnOf={(t) => t.status_id}
          items={A.filter((t) => (!who || t.owner_id === who) && (!cli || t.client_id === cli))}
          onOpen={setEditing} onMove={can('projetos', 'write') ? moveTo : undefined}
          renderCard={(t) => (
            <div style={late(t) ? { borderLeft: '4px solid var(--er)', paddingLeft: 8, marginLeft: -12 } : undefined}>
              <b>{t.title}</b>
              <small>{cname(t.client_id) ?? pname(t.project_id) ?? ''}</small>
              <small>{people.name(t.owner_id) || 'sem responsável'} · {fd(t.due_date)}</small>
              {(blocked(t) || (t.priority !== 'media' && !t.done_at)) && <small>
                {blocked(t) && <span className="tag late">Bloqueada</span>}{' '}
                {t.priority !== 'media' && !t.done_at && <Tag color={PRIORITY[t.priority].color} solid={false}>{PRIORITY[t.priority].label}</Tag>}
              </small>}
            </div>
          )} />
      )}
      {editing && <TaskForm key={editing === 'new' ? 'new' : editing.id} task={editing === 'new' ? null : editing} defaultProject={proj} onClose={() => setEditing(null)} onOpen={setEditing} />}
    </>
  )
}

export function TaskForm({ task, defaultProject, parent, onClose, onOpen }: {
  task: Task | null; defaultProject?: string; parent?: Task; onClose: () => void; onOpen?: (t: Task) => void
}) {
  const { can, scope, profile } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const me = db.currentUserId() ?? profile?.id ?? ''
  const own = scope('projetos') === 'own'
  const people = usePeople()
  const projects = useTable('projects')
  const clients = useTable('clients', { enabled: can('clientes') })
  const allTasks = useTable('tasks')
  const collabs = useTable('task_collaborators', { match: { task_id: task?.id ?? '' }, enabled: !!task })
  const deps = useTable('task_dependencies', { match: { task_id: task?.id ?? '' }, enabled: !!task })
  const checklist = useTable('task_checklist', { match: { task_id: task?.id ?? '' }, order: { column: 'sort' }, enabled: !!task })
  const { status } = useTaskHelpers()
  const canEdit = can('projetos', 'write')

  const [f, setF] = useState(() => ({
    title: task?.title ?? '', description: task?.description ?? '', owner_id: task?.owner_id ?? (own ? me : ''),
    project_id: task?.project_id ?? parent?.project_id ?? defaultProject ?? '', client_id: task?.client_id ?? parent?.client_id ?? '',
    status_id: task?.status_id ?? '', priority: task?.priority ?? 'media', start_date: task?.start_date ?? today(),
    due_date: task?.due_date ?? '', effort_hours: task?.effort_hours?.toString() ?? '', recurrence: task?.recurrence?.freq ?? '',
  }))
  const [col, setCol] = useState<string[] | null>(null)
  const [dep, setDep] = useState<string[] | null>(null)
  const colIds = col ?? (collabs.data ?? []).map((c) => c.profile_id)
  const depIds = dep ?? (deps.data ?? []).map((d) => d.depends_on)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const statusId = f.status_id || status.list[0]?.id || ''
  const subtasks = task ? (allTasks.data ?? []).filter((t) => t.parent_id === task.id) : []
  const [newCheck, setNewCheck] = useState('')
  const [newSub, setNewSub] = useState('')

  const onProject = (pid: string) => {
    const p = projects.data?.find((x) => x.id === pid)
    setF({ ...f, project_id: pid, client_id: p?.client_id ?? f.client_id })
  }

  async function save() {
    const p = {
      title: f.title.trim(), description: nn(f.description), owner_id: f.owner_id || null, project_id: f.project_id || null,
      client_id: f.client_id || null, status_id: statusId || null, priority: f.priority as Priority, start_date: f.start_date || null,
      due_date: f.due_date || null, effort_hours: num(f.effort_hours),
      recurrence: f.recurrence ? { freq: f.recurrence as 'daily' | 'weekly' | 'monthly' } : null,
      ...(parent ? { parent_id: parent.id } : {}),
    }
    if (!p.title) return
    const r = await run(async () => {
      const saved = task ? (await db.update('tasks', { id: task.id }, p), task) : await db.insert('tasks', p)
      if (col) {
        await db.remove('task_collaborators', { task_id: saved.id })
        await db.insertMany('task_collaborators', col.map((profile_id) => ({ task_id: saved.id, profile_id })))
      }
      if (dep) {
        await db.remove('task_dependencies', { task_id: saved.id })
        await db.insertMany('task_dependencies', dep.map((depends_on) => ({ task_id: saved.id, depends_on })))
      }
      return saved
    }, 'Tarefa salva')
    if (r) onClose()
  }
  async function remove() {
    if (!task || !(await confirm('Excluir esta tarefa (e suas subtarefas)?', { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('tasks', { id: task.id }), 'Tarefa excluída')) onClose()
  }
  async function addCheck() {
    if (!task || !newCheck.trim()) return
    if (await run(() => db.insert('task_checklist', { task_id: task.id, title: newCheck.trim(), sort: (checklist.data?.length ?? 0) + 1 }))) setNewCheck('')
  }
  async function addSub() {
    if (!task || !newSub.trim()) return
    const ok = await run(() => db.insert('tasks', { title: newSub.trim(), parent_id: task.id, project_id: task.project_id, client_id: task.client_id,
      owner_id: own ? me : task.owner_id, status_id: status.list[0]?.id ?? null, start_date: today() }))
    if (ok) setNewSub('')
  }

  const depOptions = (allTasks.data ?? []).filter((t) => t.id !== task?.id && !t.parent_id && !depIds.includes(t.id) && (!f.project_id || t.project_id === f.project_id))
  const tname = (id: string) => allTasks.data?.find((t) => t.id === id)

  return (
    <Modal open onClose={onClose} size="lg" title={task ? (parent || task.parent_id ? 'Subtarefa' : 'Tarefa') : parent ? 'Nova subtarefa' : 'Nova tarefa'}
      footer={<>
        {canEdit && <button className="btn primary" onClick={save} disabled={!f.title.trim()}>Salvar</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        {task && can('projetos', 'delete') && <button className="btn danger push" onClick={remove}>Excluir</button>}
      </>}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <Field label="Título *"><input value={f.title} onChange={set('title')} placeholder="O que precisa ser feito" autoFocus={!task} /></Field>
        <div className="form-grid">
          <Field label="Responsável">
            <Select value={f.owner_id} onChange={set('owner_id')} disabled={own} placeholder="Sem responsável"
              options={people.active.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Status"><Select value={statusId} onChange={set('status_id')} options={status.list.map((s) => ({ value: s.id, label: s.label }))} /></Field>
          <Field label="Projeto"><Select value={f.project_id} onChange={(e) => onProject(e.target.value)} placeholder="Sem projeto" options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} /></Field>
          {can('clientes') && <Field label="Cliente"><Select value={f.client_id} onChange={set('client_id')} placeholder="Sem cliente" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>}
          <Field label="Prioridade"><Select value={f.priority} onChange={set('priority')} options={Object.entries(PRIORITY).map(([v, p]) => ({ value: v, label: p.label }))} /></Field>
          <Field label="Esforço estimado (horas)" hint="Usado no cálculo de carga da equipe"><input type="text" inputMode="decimal" value={f.effort_hours} onChange={(e) => setF({ ...f, effort_hours: maskDecimal(e.target.value) })} placeholder="Ex.: 4" /></Field>
          <Field label="Início"><input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
          <Field label="Prazo"><input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
          <Field label="Repetir" hint="Ao concluir a tarefa, a próxima ocorrência é criada automaticamente">
            <Select value={f.recurrence} onChange={set('recurrence')} placeholder="Não repete" options={[{ value: 'daily', label: 'Diariamente' }, { value: 'weekly', label: 'Semanalmente' }, { value: 'monthly', label: 'Mensalmente' }]} />
          </Field>
        </div>
        <Field label={`Descrição (${f.description.length}/5000)`}><textarea rows={5} maxLength={5000} value={f.description} onChange={set('description')} placeholder="Detalhes, referências e critérios de entrega" /></Field>

        <fieldset className="box">
          <legend>Colaboradores</legend>
          <div className="checks">
            {people.active.filter((p) => p.id !== f.owner_id).map((p) => (
              <label key={p.id}><input type="checkbox" checked={colIds.includes(p.id)}
                onChange={(e) => setCol(e.target.checked ? [...colIds, p.id] : colIds.filter((x) => x !== p.id))} />{p.name}</label>
            ))}
          </div>
        </fieldset>

        <fieldset className="box">
          <legend>Depende de</legend>
          {depIds.map((d) => (
            <span key={d} className="chip" style={{ gap: 4 }}>
              {tname(d)?.done_at && <Check size={12} aria-hidden />}{tname(d)?.title ?? 'tarefa sem acesso'}
              {canEdit && <button type="button" className="btn ghost sm icon" onClick={() => setDep(depIds.filter((x) => x !== d))} aria-label="Remover dependência"><X size={12} aria-hidden /></button>}
            </span>
          ))}
          {!depIds.length && <p className="mu" style={{ margin: '4px 0' }}>Sem dependências</p>}
          {canEdit && depOptions.length > 0 && <Select value="" onChange={(e) => e.target.value && setDep([...depIds, e.target.value])} placeholder="Adicionar dependência…" options={depOptions.map((t) => ({ value: t.id, label: t.title }))} />}
        </fieldset>
      </fieldset>

      {task ? (
        <>
          <fieldset className="box">
            <legend>Checklist</legend>
            <div className="checklist">
              {(checklist.data ?? []).map((c) => (
                <label key={c.id} className={c.done ? 'done' : ''}>
                  <input type="checkbox" checked={c.done} disabled={!canEdit} onChange={() => run(() => db.update('task_checklist', { id: c.id }, { done: !c.done }))} />
                  <span style={{ flex: 1 }}>{c.title}</span>
                  {canEdit && <button type="button" className="btn ghost sm icon" onClick={() => run(() => db.remove('task_checklist', { id: c.id }))} aria-label={`Remover ${c.title}`}><X aria-hidden /></button>}
                </label>
              ))}
            </div>
            {canEdit && <div className="comment-form" style={{ marginTop: 8 }}>
              <input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Novo item" onKeyDown={(e) => e.key === 'Enter' && addCheck()} style={{ flex: 1 }} aria-label="Novo item do checklist" />
              <button type="button" className="btn" onClick={addCheck}>Adicionar</button>
            </div>}
          </fieldset>

          {!task.parent_id && (
            <fieldset className="box">
              <legend>Subtarefas</legend>
              {subtasks.map((s) => (
                <button key={s.id} type="button" className={`row ${s.done_at ? 'dn' : ''}`} onClick={() => onOpen?.(s)}>
                  <div><b style={s.done_at ? { textDecoration: 'line-through', opacity: .6 } : undefined}>{s.title}</b><br /><small>{people.name(s.owner_id) || 'sem responsável'} · {fd(s.due_date)}</small></div>
                  {s.done_at && <span className="tag">Concluída</span>}
                </button>
              ))}
              {!subtasks.length && <p className="mu" style={{ margin: '4px 0' }}>Nenhuma subtarefa</p>}
              {canEdit && <div className="comment-form" style={{ marginTop: 8 }}>
                <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Nova subtarefa" onKeyDown={(e) => e.key === 'Enter' && addSub()} style={{ flex: 1 }} aria-label="Nova subtarefa" />
                <button type="button" className="btn" onClick={addSub}>Adicionar</button>
              </div>}
            </fieldset>
          )}
          <Comments entity="task" id={task.id} />
          <p className="hist">Criada em {fd(task.created_at)}{task.done_at ? ` · concluída em ${fd(task.done_at)}` : ''}</p>
        </>
      ) : <p className="mu" style={{ fontSize: 13 }}>Salve a tarefa para adicionar checklist, subtarefas e comentários</p>}
    </Modal>
  )
}

// ======================================================================
// Projetos
// ======================================================================
function ProjectList() {
  const { can, scope } = useAuth()
  const [, setSp] = useSearchParams()
  const projects = useTable('projects')
  const tasks = useTable('tasks')
  const clients = useTable('clients', { enabled: can('clientes') })
  const status = useOptions('project_status')
  const people = usePeople()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [st, setSt] = useState('ativos')
  const P = (projects.data ?? []).filter((p) => st === 'todos' || (st === 'ativos' ? !status.byId(p.status_id)?.is_final : status.byId(p.status_id)?.is_final))

  return (
    <>
      <div className="toolbar">
        <Seg value={st} onChange={setSt} items={[['ativos', 'Ativos'], ['concluidos', 'Concluídos'], ['todos', 'Todos']]} />
        <span className="spacer" />
        {can('projetos', 'write') && scope('projetos') === 'all' && <button className="btn primary" onClick={() => setEditing('new')}>Novo projeto</button>}
      </div>
      {projects.isLoading ? <Loading /> : !P.length ? <Empty>Nenhum projeto aqui. Projetos também são criados ao ativar um contrato.</Empty> : (
        <div className="cards">
          {P.map((p) => {
            const T = (tasks.data ?? []).filter((t) => t.project_id === p.id && !t.parent_id)
            const d = T.filter((t) => t.done_at).length
            const pc = T.length ? Math.round((d / T.length) * 100) : 0
            const s = status.byId(p.status_id)
            const late = p.due_date && p.due_date < today() && !s?.is_final
            return (
              <button key={p.id} type="button" className="card plain" onClick={() => setEditing(p)} style={late ? { borderColor: 'var(--er)' } : undefined}>
                <b>{p.name}</b>
                <small className="mu">{clients.data?.find((c) => c.id === p.client_id)?.name ?? 'Interno'} · {people.name(p.owner_id) || 'sem responsável'}</small>
                <div className="prog sm" style={{ marginTop: 8 }}><i style={{ width: `${pc}%` }} /></div>
                <small className="mu">{d}/{T.length} tarefas · prazo {fd(p.due_date)}{late ? ' · atrasado' : ''}</small>
                <div className="foot">
                  <Tag color={s?.color}>{s?.label ?? '—'}</Tag>
                  {p.priority !== 'media' && <Tag color={PRIORITY[p.priority].color} solid={false}>{PRIORITY[p.priority].label}</Tag>}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {editing && <ProjectForm project={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
        onTasks={(id) => { setEditing(null); setSp({ projeto: id }) }} />}
    </>
  )
}

function ProjectForm({ project, onClose, onTasks }: { project: Project | null; onClose: () => void; onTasks: (id: string) => void }) {
  const { can, scope } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const people = usePeople()
  const clients = useTable('clients', { enabled: can('clientes') })
  const services = useTable('services', { order: { column: 'sort' } })
  const status = useOptions('project_status')
  const members = useTable('project_members', { match: { project_id: project?.id ?? '' }, enabled: !!project })
  const canEdit = project ? can('projetos', 'write') : can('projetos', 'write') && scope('projetos') === 'all'
  const [f, setF] = useState({
    name: project?.name ?? '', client_id: project?.client_id ?? '', service_id: project?.service_id ?? '',
    description: project?.description ?? '', objective: project?.objective ?? '', owner_id: project?.owner_id ?? '',
    status_id: project?.status_id ?? '', priority: project?.priority ?? 'media', start_date: project?.start_date ?? today(), due_date: project?.due_date ?? '',
  })
  const [mem, setMem] = useState<string[] | null>(null)
  const memIds = mem ?? (members.data ?? []).map((m) => m.profile_id)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const statusId = f.status_id || status.list[0]?.id || ''

  const payload = useMemo(() => ({
    name: f.name.trim(), client_id: f.client_id || null, service_id: f.service_id || null, description: nn(f.description),
    objective: nn(f.objective), owner_id: f.owner_id || null, status_id: statusId || null, priority: f.priority as Priority,
    start_date: f.start_date || null, due_date: f.due_date || null,
  }), [f, statusId])

  async function save() {
    if (!payload.name) return
    const r = await run(async () => {
      const saved = project ? (await db.update('projects', { id: project.id }, payload), project) : await db.insert('projects', payload)
      if (mem && scope('projetos') === 'all') {
        await db.remove('project_members', { project_id: saved.id })
        await db.insertMany('project_members', mem.map((profile_id) => ({ project_id: saved.id, profile_id })))
      }
      return saved
    }, 'Projeto salvo')
    if (r) onClose()
  }
  async function remove() {
    if (!project || !(await confirm('Excluir este projeto e todas as suas tarefas?', { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('projects', { id: project.id }), 'Projeto excluído')) onClose()
  }

  return (
    <Modal open onClose={onClose} size="lg" title={project ? 'Projeto' : 'Novo projeto'}
      footer={<>
        {canEdit && <button className="btn primary" onClick={save} disabled={!f.name.trim()}>Salvar</button>}
        {project && <button className="btn" onClick={() => onTasks(project.id)}>Ver tarefas</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        {project && can('projetos', 'delete') && <button className="btn danger push" onClick={remove}>Excluir</button>}
      </>}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Nome do projeto *" full><input value={f.name} onChange={set('name')} placeholder="Ex.: Campanha de lançamento" autoFocus={!project} /></Field>
          {can('clientes') && <Field label="Cliente"><Select value={f.client_id} onChange={set('client_id')} placeholder="Interno (sem cliente)" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>}
          <Field label="Serviço"><Select value={f.service_id} onChange={set('service_id')} placeholder="—" options={(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="Responsável principal"><Select value={f.owner_id} onChange={set('owner_id')} placeholder="Sem responsável" options={people.active.map((p) => ({ value: p.id, label: p.name }))} /></Field>
          <Field label="Status"><Select value={statusId} onChange={set('status_id')} options={status.list.map((s) => ({ value: s.id, label: s.label }))} /></Field>
          <Field label="Prioridade"><Select value={f.priority} onChange={set('priority')} options={Object.entries(PRIORITY).map(([v, p]) => ({ value: v, label: p.label }))} /></Field>
          <Field label="Início"><input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
          <Field label="Prazo previsto"><input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
          <Field label="Objetivo" full><input value={f.objective} onChange={set('objective')} placeholder="Resultado esperado do projeto" /></Field>
          <Field label="Descrição" full><textarea value={f.description} onChange={set('description')} placeholder="Detalhes, referências e critérios de entrega" /></Field>
        </div>
        <fieldset className="box" disabled={scope('projetos') !== 'all'}>
          <legend>Equipe envolvida</legend>
          <div className="checks">
            {people.active.map((p) => (
              <label key={p.id}><input type="checkbox" checked={memIds.includes(p.id)}
                onChange={(e) => setMem(e.target.checked ? [...memIds, p.id] : memIds.filter((x) => x !== p.id))} />{p.name}</label>
            ))}
          </div>
        </fieldset>
      </fieldset>
      {project && <Comments entity="project" id={project.id} />}
    </Modal>
  )
}
