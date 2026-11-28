import { useState } from 'react'
import { Comments } from '../components/Comments'
import { db } from '../data/db'
import { useOpenFromUrl, usePeople, useRun, useTable } from '../data/hooks'
import type { Strategy, StrategyStatus } from '../data/types'
import { useAuth } from '../lib/auth'
import { useFeedback } from '../ui/Feedback'
import { Empty, fdFull, Field, Loading, nn, PageHead, Seg, Select, Tag } from '../ui/kit'
import { Modal } from '../ui/Modal'
import { STRATEGY_STATUS } from './estrategiaUtil'

export default function Estrategia() {
  const { can, scope } = useAuth()
  const strategies = useTable('strategies', { order: { column: 'created_at', ascending: false } })
  const clients = useTable('clients', { order: { column: 'name' }, enabled: can('clientes') })
  const people = usePeople()
  const [q, setQ] = useState('')
  const [cli, setCli] = useState('')
  const [st, setSt] = useState<'ativos' | 'rascunho' | 'todos'>('todos')
  const [editing, setEditing] = useState<Strategy | 'new' | null>(null)
  useOpenFromUrl('estrategia', strategies.data, setEditing)

  const all = strategies.data ?? []
  const L = all.filter((s) =>
    (st === 'todos' || (st === 'ativos' ? s.status === 'ativo' : s.status === 'rascunho')) &&
    (!cli || s.client_id === cli) &&
    (!q || `${s.title} ${s.positioning ?? ''} ${s.goals ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const cname = (id: string | null) => clients.data?.find((c) => c.id === id)?.name ?? 'Agência / Geral'

  return (
    <>
      <PageHead
        title="Estratégia"
        sub={<>{all.filter((s) => s.status === 'ativo').length} ativas{scope('estrategia') === 'own' && ' · você vê apenas as estratégias atribuídas a você'}</>}
        actions={can('estrategia', 'write') && <button className="btn primary" onClick={() => setEditing('new')}>Nova estratégia</button>}
      />

      <div className="toolbar">
        <Seg value={st} onChange={setSt} items={[['todos', 'Todas'], ['ativos', 'Ativas'], ['rascunho', 'Rascunho']]} />
        <input type="search" placeholder="Buscar estratégia" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar estratégia" />
        {can('clientes') && (
          <Select value={cli} onChange={(e) => setCli(e.target.value)} placeholder="Todos os clientes" aria-label="Cliente"
            options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        )}
      </div>

      {strategies.isLoading ? <Loading /> : !L.length ? (
        <Empty action={can('estrategia', 'write') && <button className="btn primary" onClick={() => setEditing('new')}>Criar primeira estratégia</button>}>
          {all.length ? 'Nenhuma estratégia com esses filtros.' : 'Nenhuma estratégia cadastrada ainda.'}
        </Empty>
      ) : (
        <div className="cards">
          {L.map((s) => {
            const meta = STRATEGY_STATUS[s.status]
            return (
              <button key={s.id} type="button" className="card plain" onClick={() => setEditing(s)}>
                <b>{s.title}</b>
                <small className="mu">{cname(s.client_id)} · {people.name(s.owner_id) || 'sem responsável'}</small>
                {(s.start_date || s.end_date) && (
                  <small className="mu">{fdFull(s.start_date)} → {fdFull(s.end_date)}</small>
                )}
                {s.positioning && <small className="mu">{s.positioning.slice(0, 110)}{s.positioning.length > 110 ? '…' : ''}</small>}
                <div className="foot">
                  <Tag color={meta.color}>{meta.label}</Tag>
                  {s.pillars.slice(0, 3).map((p, i) => <span key={i}>{p}</span>)}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {editing && (
        <StrategyForm
          key={editing === 'new' ? 'new' : editing.id}
          strategy={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

export function StrategyForm({ strategy, defaultClient, onClose }: { strategy: Strategy | null; defaultClient?: string; onClose: () => void }) {
  const { can, scope, profile } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const people = usePeople()
  const clients = useTable('clients', { order: { column: 'name' }, enabled: can('clientes') })
  const me = db.currentUserId() ?? profile?.id ?? ''
  const own = scope('estrategia') === 'own'
  const canEdit = can('estrategia', 'write')

  const [f, setF] = useState(() => ({
    title: strategy?.title ?? '',
    client_id: strategy?.client_id ?? defaultClient ?? '',
    status: (strategy?.status ?? 'rascunho') as StrategyStatus,
    owner_id: strategy?.owner_id ?? (own ? me : ''),
    start_date: strategy?.start_date ?? '',
    end_date: strategy?.end_date ?? '',
    positioning: strategy?.positioning ?? '',
    personas: strategy?.personas ?? '',
    pillars: (strategy?.pillars ?? []).join('\n'),
    channels: strategy?.channels ?? '',
    goals: strategy?.goals ?? '',
    kpis: strategy?.kpis ?? '',
    notes: strategy?.notes ?? '',
  }))
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function save() {
    if (!f.title.trim() || busy) return
    setBusy(true)
    const payload = {
      title: f.title.trim(),
      client_id: f.client_id || null,
      status: f.status,
      owner_id: f.owner_id || null,
      start_date: f.start_date || null,
      end_date: f.end_date || null,
      positioning: nn(f.positioning),
      personas: nn(f.personas),
      pillars: f.pillars.split('\n').map((x) => x.trim()).filter(Boolean),
      channels: nn(f.channels),
      goals: nn(f.goals),
      kpis: nn(f.kpis),
      notes: nn(f.notes),
    }
    const ok = await run(async () => {
      if (strategy) await db.update('strategies', { id: strategy.id }, payload)
      else await db.insert('strategies', payload)
    }, 'Estratégia salva')
    setBusy(false)
    if (ok) onClose()
  }

  async function remove() {
    if (!strategy || !(await confirm('Excluir esta estratégia?', { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('strategies', { id: strategy.id }), 'Estratégia excluída')) onClose()
  }

  return (
    <Modal open onClose={onClose} size="lg" title={strategy ? 'Estratégia' : 'Nova estratégia'}
      footer={<>
        {canEdit && <button className="btn primary" onClick={save} disabled={!f.title.trim() || busy}>{busy ? 'Salvando…' : 'Salvar'}</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        {strategy && can('estrategia', 'delete') && <button className="btn danger push" onClick={remove}>Excluir</button>}
      </>}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Título *" full><input value={f.title} onChange={set('title')} maxLength={200} autoFocus={!strategy} placeholder="Ex.: Posicionamento e Conteúdo Q1" /></Field>
          {can('clientes') && (
            <Field label="Cliente"><Select value={f.client_id} onChange={set('client_id')} placeholder="Agência / Geral" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          )}
          <Field label="Status"><Select value={f.status} onChange={set('status')} options={Object.entries(STRATEGY_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} /></Field>
          <Field label="Responsável">
            <Select value={f.owner_id} onChange={set('owner_id')} disabled={own} placeholder="Sem responsável" options={people.active.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Início"><input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
          <Field label="Fim"><input type="date" value={f.end_date} onChange={set('end_date')} /></Field>
          <Field label="Canais principais"><input value={f.channels} onChange={set('channels')} placeholder="Ex.: Instagram, TikTok, Meta Ads" /></Field>
          <Field label="Posicionamento" full><textarea rows={3} value={f.positioning} onChange={set('positioning')} placeholder="Proposta de valor, território de marca e mensagem central" /></Field>
          <Field label="Personas / Público" full><textarea rows={3} value={f.personas} onChange={set('personas')} placeholder="Perfis prioritários, dores e desejos" /></Field>
          <Field label="Pilares de conteúdo (um por linha)" full><textarea rows={4} value={f.pillars} onChange={set('pillars')} placeholder={'Bastidores\nProva social\nEducação'} /></Field>
          <Field label="Metas e objetivos" full><textarea rows={3} value={f.goals} onChange={set('goals')} placeholder="Objetivos do ciclo" /></Field>
          <Field label="Indicadores (KPIs)" full><textarea rows={2} value={f.kpis} onChange={set('kpis')} placeholder="Ex.: alcance, salvamentos, leads qualificados, CAC" /></Field>
          <Field label="Observações" full><textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="Notas adicionais" /></Field>
        </div>
      </fieldset>
      {strategy ? <Comments entity="strategy" id={strategy.id} /> : <p className="mu" style={{ fontSize: 13 }}>Salve a estratégia para adicionar comentários</p>}
    </Modal>
  )
}
