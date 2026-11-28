import { Briefcase, Clapperboard, Compass, FileText, KanbanSquare, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTable } from '../data/hooks'
import { useAuth } from '../lib/auth'
import { Modal } from '../ui/Modal'

interface Hit {
  key: string
  kind: string
  title: string
  sub: string
  to: string
  icon: typeof Search
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        className="notif-btn search-btn"
        onClick={() => setOpen(true)}
        aria-label="Buscar no sistema (Ctrl+K)"
        title="Buscar no sistema (Ctrl+K)"
      >
        <Search aria-hidden />
      </button>
      {open && <SearchModal onClose={() => setOpen(false)} />}
    </>
  )
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const clients = useTable('clients', { enabled: can('clientes') })
  const leads = useTable('leads', { enabled: can('crm') })
  const contracts = useTable('contracts', { enabled: can('contratos') })
  const projects = useTable('projects', { enabled: can('projetos') })
  const tasks = useTable('tasks', { enabled: can('projetos') })
  const contents = useTable('contents', { enabled: can('producao') })
  const strategies = useTable('strategies', { enabled: can('estrategia') })

  const cname = (id: string | null) => clients.data?.find((c) => c.id === id)?.name ?? ''

  const all = useMemo<Hit[]>(() => {
    const out: Hit[] = []
    for (const c of clients.data ?? []) out.push({
      key: `cli-${c.id}`, kind: 'Cliente', title: c.name, sub: c.segment || c.contact_name || 'Cliente',
      to: `/clientes/${c.id}`, icon: Users,
    })
    for (const l of leads.data ?? []) out.push({
      key: `lead-${l.id}`, kind: 'Lead', title: l.name, sub: l.company || l.origin || 'Comercial',
      to: `/comercial?lead=${l.id}`, icon: Briefcase,
    })
    for (const k of contracts.data ?? []) out.push({
      key: `ct-${k.id}`, kind: 'Contrato', title: `Contrato · ${cname(k.client_id) || 'Cliente'}`,
      sub: k.status, to: `/contratos/${k.id}`, icon: FileText,
    })
    for (const p of projects.data ?? []) out.push({
      key: `pj-${p.id}`, kind: 'Projeto', title: p.name, sub: cname(p.client_id) || 'Projeto interno',
      to: `/projetos?aba=projetos&projeto=${p.id}`, icon: KanbanSquare,
    })
    for (const t of tasks.data ?? []) out.push({
      key: `tk-${t.id}`, kind: 'Tarefa', title: t.title, sub: cname(t.client_id) || 'Tarefa',
      to: `/projetos?tarefa=${t.id}`, icon: KanbanSquare,
    })
    for (const c of contents.data ?? []) out.push({
      key: `cnt-${c.id}`, kind: 'Conteúdo', title: c.title, sub: [cname(c.client_id), c.channel].filter(Boolean).join(' · ') || 'Conteúdo',
      to: `/conteudo?conteudo=${c.id}`, icon: Clapperboard,
    })
    for (const s of strategies.data ?? []) out.push({
      key: `str-${s.id}`, kind: 'Estratégia', title: s.title, sub: cname(s.client_id) || 'Geral',
      to: `/estrategia?estrategia=${s.id}`, icon: Compass,
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients.data, leads.data, contracts.data, projects.data, tasks.data, contents.data, strategies.data])

  const term = q.trim().toLowerCase()
  const hits = term
    ? all.filter((h) => `${h.title} ${h.sub} ${h.kind}`.toLowerCase().includes(term)).slice(0, 20)
    : all.slice(0, 10)

  const go = (to: string) => { onClose(); navigate(to) }

  return (
    <Modal open onClose={onClose} title="Busca global" size="md">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar clientes, leads, contratos, projetos, tarefas, conteúdos…"
        autoFocus
        style={{ width: '100%', marginBottom: 12 }}
        aria-label="Termo de busca"
      />
      {!hits.length ? (
        <p className="mu" style={{ margin: '12px 0 0' }}>Nenhum resultado encontrado para “{q}”.</p>
      ) : (
        <div style={{ display: 'grid', gap: 6, maxHeight: '55dvh', overflow: 'auto' }}>
          {hits.map((h) => (
            <button key={h.key} type="button" className="row" style={{ marginBottom: 0 }} onClick={() => go(h.to)}>
              <h.icon size={16} aria-hidden style={{ color: 'var(--mu)', flexShrink: 0 }} />
              <div><b>{h.title}</b><br /><small>{h.sub}</small></div>
              <span className="tag soft">{h.kind}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
