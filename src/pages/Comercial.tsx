import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { useOpenFromUrl, useOptions, usePeople, useRun, useTable } from '../data/hooks'
import type { Lead } from '../data/types'
import { useAuth } from '../lib/auth'
import { Comments } from '../components/Comments'
import { Kanban } from '../components/Kanban'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { Empty, Field, fd, Loading, maskEmail, maskMoney, maskPhone, money, nn, parseMoney, PageHead, Seg, Select, Tag, today } from '../ui/kit'

export default function Comercial() {
  const { can } = useAuth()
  const leads = useTable('leads', { order: { column: 'created_at', ascending: false } })
  const stages = useOptions('lead_stage')
  const services = useTable('services', { order: { column: 'sort' } })
  const values = useTable('lead_values', { enabled: can('financeiro') })
  const people = usePeople()
  const [view, setView] = useState<'kb' | 'list'>('kb')
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('')
  const [editing, setEditing] = useState<Lead | 'new' | null>(null)
  useOpenFromUrl('lead', leads.data, setEditing)

  const all = leads.data ?? []
  const L = all.filter((l) =>
    (!owner || l.owner_id === owner) &&
    (!q || `${l.name} ${l.company ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const isFinal = (l: Lead) => stages.byId(l.stage_id)?.is_final
  const won = all.filter((l) => stages.byId(l.stage_id)?.label === 'Fechado').length
  const open = all.filter((l) => !isFinal(l)).length
  const conv = all.length ? Math.round((won / all.length) * 100) : 0
  const valueOf = (id: string) => values.data?.find((v) => v.lead_id === id)?.estimated_value ?? null
  const pipeline = can('financeiro')
    ? all.filter((l) => !isFinal(l)).reduce((a, l) => a + (valueOf(l.id) ?? 0), 0) : null

  const svcName = (id: string | null) => services.data?.find((s) => s.id === id)?.name.replace('Nuage ', '')

  const run = useRun()
  const move = (l: Lead, stageId: string) =>
    run(() => db.update('leads', { id: l.id }, { stage_id: stageId }), `Movido para ${stages.byId(stageId)?.label ?? ''}`)

  const card = (l: Lead) => {
    const late = l.follow_up && l.follow_up < today() && !isFinal(l)
    return (
      <>
        <b>{l.name}</b>
        {l.company && <small>{l.company}</small>}
        <small>
          {svcName(l.service_id) && <i className="chip">{svcName(l.service_id)}</i>}
          {can('financeiro') && valueOf(l.id) != null && <i className="chip">{money(valueOf(l.id))}</i>}
        </small>
        <small>
          {people.name(l.owner_id) || 'sem responsável'}
          {l.follow_up && <> · <span style={late ? { color: 'var(--er)', fontWeight: 700 } : undefined}>retorno {fd(l.follow_up)}</span></>}
        </small>
        {l.client_id && <small>Virou cliente</small>}
      </>
    )
  }

  return (
    <>
      <PageHead title="Comercial"
        sub={<>{open} em andamento · {won} fechados · conversão de {conv}%{pipeline != null && <> · funil estimado {money(pipeline)}</>}</>}
        actions={can('crm', 'write') && <button className="btn primary" onClick={() => setEditing('new')}>Novo lead</button>} />

      <div className="toolbar">
        <Seg value={view} onChange={setView} items={[['kb', 'Kanban'], ['list', 'Lista']]} />
        <input type="search" placeholder="Buscar por nome ou empresa" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar leads" />
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Todos os responsáveis"
          options={people.active.map((p) => ({ value: p.id, label: p.name }))} aria-label="Filtrar por responsável" />
      </div>

      {leads.isLoading ? <Loading /> : !all.length ? (
        <Empty action={can('crm', 'write') && <button className="btn primary" onClick={() => setEditing('new')}>Cadastrar primeiro lead</button>}>
          Nenhum lead cadastrado ainda.
        </Empty>
      ) : view === 'kb' ? (
        <Kanban columns={stages.list} items={L} columnOf={(l) => l.stage_id} renderCard={card}
          onOpen={setEditing} onMove={can('crm', 'write') ? move : undefined} />
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Contato</th><th>Empresa</th><th>Etapa</th><th>Responsável</th><th>Retorno</th>{can('financeiro') && <th className="num">Valor estimado</th>}</tr></thead>
            <tbody>
              {L.map((l) => {
                const st = stages.byId(l.stage_id)
                return (
                  <tr key={l.id} className="click" onClick={() => setEditing(l)}>
                    <td><b>{l.name}</b></td><td>{l.company}</td>
                    <td><Tag color={st?.color}>{st?.label ?? '—'}</Tag></td>
                    <td>{people.name(l.owner_id) || '—'}</td><td>{fd(l.follow_up, '—')}</td>
                    {can('financeiro') && <td className="num">{money(valueOf(l.id))}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <LeadForm lead={editing === 'new' ? null : editing} value={editing === 'new' ? null : valueOf(editing.id)} onClose={() => setEditing(null)} />}
    </>
  )
}

function LeadForm({ lead, value, onClose }: { lead: Lead | null; value: number | null; onClose: () => void }) {
  const { can } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const navigate = useNavigate()
  const stages = useOptions('lead_stage')
  const origins = useOptions('lead_origin')
  const clientStatus = useOptions('client_status')
  const services = useTable('services', { match: { active: true }, order: { column: 'sort' } })
  const people = usePeople()
  const canEdit = lead ? can('crm', 'write') : true
  const [f, setF] = useState(() => ({
    name: lead?.name ?? '', company: lead?.company ?? '', phone: maskPhone(lead?.phone ?? ''), email: lead?.email ?? '',
    segment: lead?.segment ?? '', origin: lead?.origin ?? 'Indicação', service_id: lead?.service_id ?? '',
    owner_id: lead?.owner_id ?? '', stage_id: lead?.stage_id ?? '', next_action: lead?.next_action ?? '',
    follow_up: lead?.follow_up ?? '', notes: lead?.notes ?? '', value: value == null ? '' : maskMoney(value),
  }))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const stageId = f.stage_id || stages.list[0]?.id || ''
  const [busy, setBusy] = useState(false)

  const payload = useMemo(() => ({
    name: f.name.trim(), company: nn(f.company), phone: nn(f.phone), email: nn(f.email), segment: nn(f.segment),
    origin: nn(f.origin), service_id: f.service_id || null, owner_id: f.owner_id || null, stage_id: stageId || null,
    next_action: nn(f.next_action), follow_up: f.follow_up || null, notes: nn(f.notes),
  }), [f, stageId])

  async function save() {
    if (!payload.name) return
    setBusy(true)
    const ok = await run(async () => {
      const saved = lead ? (await db.update('leads', { id: lead.id }, payload), lead) : await db.insert('leads', payload)
      if (can('financeiro', 'write') && (value == null ? '' : maskMoney(value)) !== f.value)
        await db.upsert('lead_values', { lead_id: saved.id, estimated_value: parseMoney(f.value) }, 'lead_id')
      return true
    }, 'Lead salvo')
    setBusy(false)
    if (ok) onClose()
  }

  async function convert() {
    if (!lead) return
    if (!(await confirm('Criar o cliente a partir deste lead e marcar como Fechado?', { confirmLabel: 'Converter' }))) return
    const client = await run(async () => {
      await db.update('leads', { id: lead.id }, payload)
      const c = await db.insert('clients', {
        name: payload.company ?? payload.name, segment: payload.segment, contact_name: payload.name,
        phone: payload.phone, email: payload.email, status_id: clientStatus.byLabel('Em onboarding')?.id ?? null,
      })
      await db.update('leads', { id: lead.id }, { client_id: c.id, stage_id: stages.byLabel('Fechado')?.id ?? stageId })
      return c
    }, 'Cliente criado')
    if (!client || client === true) return
    onClose()
    if (can('contratos', 'write') && await confirm('Cliente criado. Deseja montar o contrato agora?', { confirmLabel: 'Criar contrato' }))
      navigate(`/contratos/novo?cliente=${client.id}&lead=${lead.id}${lead.service_id ? `&servico=${lead.service_id}` : ''}`)
    else navigate(`/clientes/${client.id}`)
  }

  async function remove() {
    if (!lead || !(await confirm('Excluir este lead definitivamente?', { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('leads', { id: lead.id }), 'Lead excluído')) onClose()
  }

  return (
    <Modal open onClose={onClose} title={lead ? 'Lead' : 'Novo lead'} size="lg"
      footer={<>
        {canEdit && <button className="btn primary" onClick={save} disabled={busy || !f.name.trim()}>Salvar</button>}
        {lead && !lead.client_id && can('clientes', 'write') && !stages.byId(lead.stage_id)?.label.startsWith('Perdido') &&
          <button className="btn" onClick={convert}>Converter em cliente</button>}
        {lead?.client_id && <button className="btn" onClick={() => navigate(`/clientes/${lead.client_id}`)}>Abrir cliente</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        {lead && can('crm', 'delete') && <button className="btn danger push" onClick={remove}>Excluir</button>}
      </>}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Nome do contato *"><input value={f.name} onChange={set('name')} placeholder="Nome de quem entrou em contato" autoFocus /></Field>
          <Field label="Empresa"><input value={f.company} onChange={set('company')} placeholder="Nome da empresa" /></Field>
          <Field label="Telefone / WhatsApp"><input value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" inputMode="tel" maxLength={15} /></Field>
          <Field label="E-mail"><input value={f.email} onChange={(e) => setF({ ...f, email: maskEmail(e.target.value) })} placeholder="contato@empresa.com.br" type="email" /></Field>
          <Field label="Segmento"><input value={f.segment} onChange={set('segment')} placeholder="Ex.: Alimentação, Moda, Saúde" /></Field>
          <Field label="Origem"><Select value={f.origin} onChange={set('origin')} options={origins.list.map((o) => ({ value: o.label, label: o.label }))} /></Field>
          <Field label="Serviço de interesse"><Select value={f.service_id} onChange={set('service_id')} placeholder="A definir" options={(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
          {can('financeiro') && (
            <Field label="Valor estimado (R$)" hint="Visível só para quem acessa o financeiro">
              <input type="text" inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: maskMoney(e.target.value) })} placeholder="0,00" disabled={!can('financeiro', 'write')} />
            </Field>
          )}
          <Field label="Responsável comercial"><Select value={f.owner_id} onChange={set('owner_id')} placeholder="Sem responsável" options={people.active.map((p) => ({ value: p.id, label: p.name }))} /></Field>
          <Field label="Etapa"><Select value={stageId} onChange={set('stage_id')} options={stages.list.map((s) => ({ value: s.id, label: s.label }))} /></Field>
          <Field label="Próxima ação"><input value={f.next_action} onChange={set('next_action')} placeholder="Ex.: Enviar proposta, agendar reunião" /></Field>
          <Field label="Data de retorno"><input type="date" value={f.follow_up} onChange={set('follow_up')} /></Field>
          <Field label="Observações" full><textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Contexto da conversa, necessidades, objeções…" /></Field>
        </div>
      </fieldset>
      {lead?.client_id && <p className="mu">Este lead já virou cliente</p>}
      {lead && <Comments entity="lead" id={lead.id} />}
    </Modal>
  )
}
