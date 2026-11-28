import { CalendarDays, ChevronLeft, Download, ExternalLink, Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../data/db'
import { useClientServices, useOptions, usePeople, useRun, useTable } from '../data/hooks'
import type { Campaign, Client, ClientBriefing, Content, EventRow, Strategy } from '../data/types'
import { useAuth } from '../lib/auth'
import { downloadCsv } from '../lib/csv'
import { Comments } from '../components/Comments'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { Empty, Field, fd, fdFull, Loading, maskCpf, maskDocument, maskEmail, maskMoney, maskPhone, money, nn, PageHead, parseMoney, Select, Tabs, Tag, today } from '../ui/kit'
import { EventForm } from './Agenda'
import { ContentForm } from './Conteudo'
import { contractMonthly, CONTRACT_STATUS } from './contratosUtil'
import { StrategyForm } from './Estrategia'
import { STRATEGY_STATUS } from './estrategiaUtil'

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
        actions={<>
          {L.length > 0 && (
            <button className="btn" onClick={() => downloadCsv(
              `clientes-${today()}.csv`,
              ['Nome', 'Segmento', 'Status', 'Contato', 'Telefone', 'E-mail', 'Serviços ativos'],
              L.map((c) => [
                c.name, c.segment, status.byId(c.status_id)?.label, c.contact_name, c.phone, c.email,
                (services.data ?? []).filter((s) => s.client_id === c.id).map((s) => s.service_name).join(' | '),
              ]),
            )}><Download aria-hidden />Exportar CSV</button>
          )}
          {can('clientes', 'write') && <button className="btn primary" onClick={() => setEditing(true)}>Novo cliente</button>}
        </>} />
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
    phone: maskPhone(client?.phone ?? ''), email: client?.email ?? '',
    legal_name: client?.legal_name ?? '', document: maskDocument(client?.document ?? ''),
    address: client?.address ?? '', legal_rep_name: client?.legal_rep_name ?? '',
    legal_rep_cpf: maskCpf(client?.legal_rep_cpf ?? ''),
    status_id: client?.status_id ?? '', notes: client?.notes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const statusId = f.status_id || status.byLabel('Em negociação')?.id || ''

  async function save() {
    const p = {
      name: f.name.trim(), segment: nn(f.segment), contact_name: nn(f.contact_name), phone: nn(f.phone),
      email: nn(f.email), legal_name: nn(f.legal_name), document: nn(f.document), address: nn(f.address),
      legal_rep_name: nn(f.legal_rep_name), legal_rep_cpf: nn(f.legal_rep_cpf),
      status_id: statusId || null, notes: nn(f.notes),
    }
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
        <Field label="Telefone / WhatsApp"><input value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" inputMode="tel" maxLength={15} /></Field>
        <Field label="E-mail" full><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: maskEmail(e.target.value) })} placeholder="contato@empresa.com.br" /></Field>
        <Field label="Razão social / nome completo (contrato)"><input value={f.legal_name} onChange={set('legal_name')} placeholder="Se vazio, usa o nome do cliente" /></Field>
        <Field label="CPF ou CNPJ"><input value={f.document} onChange={(e) => setF({ ...f, document: maskDocument(e.target.value) })} placeholder="000.000.000-00 ou 00.000.000/0000-00" inputMode="numeric" maxLength={18} /></Field>
        <Field label="Endereço completo (contrato)" full><input value={f.address} onChange={set('address')} placeholder="Rua, nº, bairro, cidade - UF, CEP" /></Field>
        <Field label="Representante legal (PJ)"><input value={f.legal_rep_name} onChange={set('legal_rep_name')} placeholder="Nome completo de quem assina" /></Field>
        <Field label="CPF do representante"><input value={f.legal_rep_cpf} onChange={(e) => setF({ ...f, legal_rep_cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} /></Field>
        <Field label="Observações" full><textarea value={f.notes} onChange={set('notes')} placeholder="Informações importantes sobre o cliente" /></Field>
      </div>
    </Modal>
  )
}

type TabKey = 'geral' | 'briefing' | 'estrategia' | 'contratos' | 'projetos' | 'producoes' | 'campanhas' | 'reunioes' | 'historico'

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
  const contents = useTable('contents', { match: { client_id: id }, order: { column: 'publish_date' }, enabled: can('producao') })
  const contentStatus = useOptions('content_status')
  const campaigns = useTable('campaigns', { match: { client_id: id }, order: { column: 'created_at', ascending: false } })
  const strategies = useTable('strategies', { match: { client_id: id }, order: { column: 'created_at', ascending: false }, enabled: can('estrategia') })
  const events = useTable('events', { match: { client_id: id }, order: { column: 'date', ascending: false } })
  const people = usePeople()
  const [tab, setTab] = useState<TabKey>('geral')
  const [editing, setEditing] = useState(false)
  const [contentModal, setContentModal] = useState<Content | 'new' | null>(null)
  const [strategyModal, setStrategyModal] = useState<Strategy | 'new' | null>(null)
  const [eventModal, setEventModal] = useState<EventRow | { date: string } | null>(null)

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
          {can('dashboard') && <Link className="btn" to={`/agenda?cliente=${c.id}`}><CalendarDays aria-hidden />Ver agenda</Link>}
          {can('clientes', 'write') && <button className="btn" onClick={() => setEditing(true)}>Editar</button>}
          {can('contratos', 'write') && <Link className="btn primary" to={`/contratos/novo?cliente=${c.id}`}>Novo contrato</Link>}
          {can('clientes', 'delete') && <button className="btn danger" onClick={remove}>Excluir</button>}
        </>} />

      <Tabs value={tab} onChange={setTab} items={[
        { key: 'geral', label: 'Visão geral' },
        { key: 'briefing', label: 'Briefing' },
        { key: 'estrategia', label: 'Estratégia', hidden: !can('estrategia'), badge: strategies.data?.length },
        { key: 'contratos', label: 'Contratos', hidden: !can('contratos'), badge: contracts.data?.length },
        { key: 'projetos', label: 'Projetos e tarefas', hidden: !can('projetos'), badge: projects.data?.length },
        { key: 'producoes', label: 'Produções', hidden: !can('producao'), badge: contents.data?.length },
        { key: 'campanhas', label: 'Campanhas', badge: campaigns.data?.length },
        { key: 'reunioes', label: 'Reuniões', badge: events.data?.length },
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
              <dt>Razão social</dt><dd>{c.legal_name || c.name}</dd>
              <dt>CPF / CNPJ</dt><dd>{c.document || '—'}</dd>
              <dt>Endereço</dt><dd>{c.address || '—'}</dd>
              <dt>Representante legal</dt><dd>{c.legal_rep_name ? `${c.legal_rep_name}${c.legal_rep_cpf ? ` · CPF ${c.legal_rep_cpf}` : ''}` : '—'}</dd>
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

      {tab === 'briefing' && <BriefingTab clientId={c.id} />}

      {tab === 'estrategia' && (
        <>
          {can('estrategia', 'write') && (
            <div className="toolbar"><span className="spacer" /><button className="btn primary" onClick={() => setStrategyModal('new')}><Plus aria-hidden />Nova estratégia</button></div>
          )}
          {(strategies.data ?? []).length ? (strategies.data ?? []).map((st) => {
            const meta = STRATEGY_STATUS[st.status]
            return (
              <button key={st.id} type="button" className="row" onClick={() => setStrategyModal(st)}>
                <div><b>{st.title}</b><br /><small>{people.name(st.owner_id) || 'sem responsável'}{st.start_date ? ` · ${fdFull(st.start_date)}` : ''}</small></div>
                <Tag color={meta.color}>{meta.label}</Tag>
              </button>
            )
          }) : <Empty action={can('estrategia', 'write') && <button className="btn primary" onClick={() => setStrategyModal('new')}>Criar estratégia</button>}>Nenhuma estratégia para este cliente</Empty>}
        </>
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

      {tab === 'producoes' && (
        <>
          {can('producao', 'write') && (
            <div className="toolbar"><span className="spacer" /><button className="btn primary" onClick={() => setContentModal('new')}><Plus aria-hidden />Novo conteúdo</button></div>
          )}
          {(contents.data ?? []).length ? (contents.data ?? []).map((ct) => {
            const st = contentStatus.byId(ct.status_id)
            return (
              <button key={ct.id} type="button" className="row" onClick={() => setContentModal(ct)}>
                <div><b>{ct.title}</b><br /><small>{ct.channel ?? '—'} · {ct.publish_date ? `publica ${fd(ct.publish_date)}` : 'sem data'} · {people.name(ct.owner_id) || 'sem responsável'}</small></div>
                <Tag color={ct.posted_at ? '#2e9e6a' : st?.color}>{ct.posted_at ? 'Publicado' : st?.label ?? '—'}</Tag>
              </button>
            )
          }) : <Empty action={can('producao', 'write') && <button className="btn primary" onClick={() => setContentModal('new')}>Novo conteúdo</button>}>Nenhuma produção cadastrada para este cliente</Empty>}
        </>
      )}

      {tab === 'campanhas' && <CampanhasTab clientId={c.id} campaigns={campaigns.data ?? []} loading={campaigns.isLoading} />}

      {tab === 'reunioes' && (
        <>
          <div className="toolbar"><span className="spacer" /><button className="btn primary" onClick={() => setEventModal({ date: today() })}><Plus aria-hidden />Novo compromisso</button></div>
          {(events.data ?? []).length ? (events.data ?? []).map((ev) => (
            <button key={ev.id} type="button" className="row" onClick={() => setEventModal(ev)}>
              <div><b>{ev.title}</b><br /><small>{fdFull(ev.date)}{ev.time ? ` às ${ev.time.slice(0, 5)}` : ''} · {ev.profile_id ? people.name(ev.profile_id) : 'Toda a agência'}</small></div>
            </button>
          )) : <Empty action={<button className="btn primary" onClick={() => setEventModal({ date: today() })}>Agendar compromisso</button>}>Nenhuma reunião ou compromisso para este cliente</Empty>}
        </>
      )}

      {tab === 'historico' && <Comments entity="client" id={c.id} />}

      {editing && <ClientForm client={c} onClose={() => setEditing(false)} />}
      {contentModal && <ContentForm key={contentModal === 'new' ? 'new' : contentModal.id} content={contentModal === 'new' ? null : contentModal} defaultClient={c.id} onClose={() => setContentModal(null)} />}
      {strategyModal && <StrategyForm key={strategyModal === 'new' ? 'new' : strategyModal.id} strategy={strategyModal === 'new' ? null : strategyModal} defaultClient={c.id} onClose={() => setStrategyModal(null)} />}
      {eventModal && <EventForm event={'id' in eventModal ? eventModal : null} date={'id' in eventModal ? eventModal.date : eventModal.date} defaultClient={c.id} onClose={() => setEventModal(null)} />}
    </>
  )
}

function BriefingTab({ clientId }: { clientId: string }) {
  const { can } = useAuth()
  const run = useRun()
  const q = useTable('client_briefings', { match: { client_id: clientId } })
  const b = q.data?.[0]
  const canEdit = can('clientes', 'write')
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({
    audience: '', tone_of_voice: '', differentials: '', competitors: '', references_links: '', restrictions: '', notes: '',
  })

  useEffect(() => {
    setF({
      audience: b?.audience ?? '', tone_of_voice: b?.tone_of_voice ?? '', differentials: b?.differentials ?? '',
      competitors: b?.competitors ?? '', references_links: b?.references_links ?? '', restrictions: b?.restrictions ?? '', notes: b?.notes ?? '',
    })
  }, [b])

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function save() {
    const row: Partial<ClientBriefing> = {
      client_id: clientId, audience: nn(f.audience), tone_of_voice: nn(f.tone_of_voice),
      differentials: nn(f.differentials), competitors: nn(f.competitors),
      references_links: nn(f.references_links), restrictions: nn(f.restrictions), notes: nn(f.notes),
    }
    if (await run(() => db.upsert('client_briefings', row, 'client_id'), 'Briefing salvo')) setEditing(false)
  }

  if (q.isLoading) return <Loading />
  const links = (f.references_links || '').split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l))

  return (
    <div className="panel">
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Briefing do cliente</h3>
        <span className="spacer" />
        {canEdit && !editing && <button className="btn primary" onClick={() => setEditing(true)}><Pencil aria-hidden />{b ? 'Editar briefing' : 'Preencher briefing'}</button>}
        {canEdit && editing && <>
          <button className="btn primary" onClick={save}>Salvar</button>
          <button className="btn" onClick={() => setEditing(false)}>Cancelar</button>
        </>}
      </div>
      <fieldset disabled={!editing} className={editing ? undefined : 'readonly'} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Público-alvo" full><textarea rows={2} value={f.audience} onChange={set('audience')} placeholder="Quem o cliente quer atingir" /></Field>
          <Field label="Tom de voz" full><textarea rows={2} value={f.tone_of_voice} onChange={set('tone_of_voice')} placeholder="Personalidade, linguagem e postura da marca" /></Field>
          <Field label="Diferenciais" full><textarea rows={2} value={f.differentials} onChange={set('differentials')} placeholder="Pontos fortes da oferta/serviço" /></Field>
          <Field label="Concorrentes e referências"><textarea rows={2} value={f.competitors} onChange={set('competitors')} placeholder="Principais concorrentes" /></Field>
          <Field label="Restrições / o que evitar"><textarea rows={2} value={f.restrictions} onChange={set('restrictions')} placeholder="Termos, cores, formatos ou abordagens proibidas" /></Field>
          <Field label="Links de identidade visual / Drive" full hint="Um link por linha"><textarea rows={2} value={f.references_links} onChange={set('references_links')} placeholder="https://…" /></Field>
          <Field label="Observações gerais" full><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        </div>
      </fieldset>
      {links.length > 0 && (
        <div className="link-list">{links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />{l.replace(/^https?:\/\//, '').slice(0, 60)}</a>)}</div>
      )}
    </div>
  )
}

function CampanhasTab({ clientId, campaigns, loading }: { clientId: string; campaigns: Campaign[]; loading: boolean }) {
  const { can } = useAuth()
  const status = useOptions('campaign_status')
  const budgets = useTable('campaign_budgets', { enabled: can('financeiro') })
  const people = usePeople()
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null)
  const budgetOf = (id: string) => budgets.data?.find((b) => b.campaign_id === id)

  return (
    <>
      {can('clientes', 'write') && (
        <div className="toolbar"><span className="spacer" /><button className="btn primary" onClick={() => setEditing('new')}><Plus aria-hidden />Nova campanha</button></div>
      )}
      {loading ? <Loading /> : !campaigns.length ? (
        <Empty action={can('clientes', 'write') && <button className="btn primary" onClick={() => setEditing('new')}>Criar primeira campanha</button>}>
          Nenhuma campanha cadastrada para este cliente.
        </Empty>
      ) : campaigns.map((cp) => {
        const st = status.byId(cp.status_id)
        const b = budgetOf(cp.id)
        return (
          <button key={cp.id} type="button" className="row" onClick={() => setEditing(cp)}>
            <div>
              <b>{cp.name}</b><br />
              <small>{[cp.channel, cp.objective, people.name(cp.owner_id) || 'sem responsável', cp.start_date ? fd(cp.start_date) : null].filter(Boolean).join(' · ')}</small>
            </div>
            <div className="meta">
              {can('financeiro') && b?.monthly_budget != null && <span className="mu">verba {money(b.monthly_budget)}</span>}
              <Tag color={st?.color}>{st?.label ?? '—'}</Tag>
            </div>
          </button>
        )
      })}
      {editing && (
        <CampaignForm
          key={editing === 'new' ? 'new' : editing.id}
          clientId={clientId}
          campaign={editing === 'new' ? null : editing}
          budget={editing === 'new' ? undefined : budgetOf(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function CampaignForm({ clientId, campaign, budget, onClose }: {
  clientId: string; campaign: Campaign | null; budget?: { monthly_budget: number | null; spent_amount: number | null }; onClose: () => void
}) {
  const { can } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const status = useOptions('campaign_status')
  const people = usePeople()
  const canEdit = can('clientes', 'write')
  const canFin = can('financeiro', 'write')

  const [f, setF] = useState({
    name: campaign?.name ?? '', channel: campaign?.channel ?? 'Meta Ads', objective: campaign?.objective ?? '',
    status_id: campaign?.status_id ?? '', start_date: campaign?.start_date ?? today(), end_date: campaign?.end_date ?? '',
    owner_id: campaign?.owner_id ?? '', links: campaign?.links ?? '', notes: campaign?.notes ?? '',
    monthly_budget: budget?.monthly_budget != null ? maskMoney(budget.monthly_budget) : '',
    spent_amount: budget?.spent_amount != null ? maskMoney(budget.spent_amount) : '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const statusId = f.status_id || status.list[0]?.id || ''

  async function save() {
    if (!f.name.trim()) return
    const payload = {
      client_id: clientId, name: f.name.trim(), channel: nn(f.channel), objective: nn(f.objective),
      status_id: statusId || null, start_date: f.start_date || null, end_date: f.end_date || null,
      owner_id: f.owner_id || null, links: nn(f.links), notes: nn(f.notes),
    }
    const ok = await run(async () => {
      const saved = campaign ? (await db.update('campaigns', { id: campaign.id }, payload), campaign) : await db.insert('campaigns', payload)
      if (canFin) {
        const mb = parseMoney(f.monthly_budget), sp = parseMoney(f.spent_amount)
        if (mb != null || sp != null) await db.upsert('campaign_budgets', { campaign_id: saved.id, monthly_budget: mb, spent_amount: sp }, 'campaign_id')
      }
      return saved
    }, 'Campanha salva')
    if (ok) onClose()
  }

  async function remove() {
    if (!campaign || !(await confirm('Excluir esta campanha?', { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('campaigns', { id: campaign.id }), 'Campanha excluída')) onClose()
  }

  return (
    <Modal open onClose={onClose} size="lg" title={campaign ? 'Campanha' : 'Nova campanha'}
      footer={<>
        {canEdit && <button className="btn primary" onClick={save} disabled={!f.name.trim()}>Salvar</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        {campaign && can('clientes', 'delete') && <button className="btn danger push" onClick={remove}>Excluir</button>}
      </>}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Nome da campanha *" full><input value={f.name} onChange={set('name')} maxLength={200} autoFocus placeholder="Ex.: Captação de leads · Meta Ads" /></Field>
          <Field label="Canal"><input value={f.channel} onChange={set('channel')} placeholder="Ex.: Meta Ads, Google Ads, TikTok" /></Field>
          <Field label="Status"><Select value={statusId} onChange={set('status_id')} options={status.list.map((s) => ({ value: s.id, label: s.label }))} /></Field>
          <Field label="Objetivo" full><input value={f.objective} onChange={set('objective')} placeholder="Ex.: Geração de leads no WhatsApp" /></Field>
          <Field label="Responsável"><Select value={f.owner_id} onChange={set('owner_id')} placeholder="Sem responsável" options={people.active.map((p) => ({ value: p.id, label: p.name }))} /></Field>
          <Field label="Início"><input type="date" value={f.start_date} onChange={set('start_date')} /></Field>
          <Field label="Fim"><input type="date" value={f.end_date} onChange={set('end_date')} /></Field>
          {can('financeiro') && <>
            <Field label="Verba mensal (R$)" hint="Visível só para o Financeiro">
              <input type="text" inputMode="numeric" value={f.monthly_budget} disabled={!canFin} onChange={(e) => setF({ ...f, monthly_budget: maskMoney(e.target.value) })} placeholder="0,00" />
            </Field>
            <Field label="Investido (R$)" hint="Visível só para o Financeiro">
              <input type="text" inputMode="numeric" value={f.spent_amount} disabled={!canFin} onChange={(e) => setF({ ...f, spent_amount: maskMoney(e.target.value) })} placeholder="0,00" />
            </Field>
          </>}
          <Field label="Links e criativos" full><textarea rows={2} value={f.links} onChange={set('links')} placeholder="https://…" /></Field>
          <Field label="Observações" full><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        </div>
      </fieldset>
    </Modal>
  )
}
