import { Check, Copy, ExternalLink, Link2, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { db } from '../data/db'
import { useOpenFromUrl, useOptions, usePeople, useRun, useTable } from '../data/hooks'
import type { Content } from '../data/types'
import { useAuth } from '../lib/auth'
import { Comments } from '../components/Comments'
import { Kanban } from '../components/Kanban'
import { MonthGrid } from '../components/MonthGrid'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { Empty, Field, fd, fdt, Loading, nn, PageHead, Seg, Select, Tag, today } from '../ui/kit'
import { contentLate, useContentFlow } from './conteudoUtil'

export default function Conteudo() {
  const { can, scope } = useAuth()
  const run = useRun()
  const contents = useTable('contents', { order: { column: 'publish_date' } })
  const clients = useTable('clients', { order: { column: 'name' }, enabled: can('clientes') })
  const formats = useOptions('content_format')
  const people = usePeople()
  const { status, posted, beforePosted } = useContentFlow()
  const [mode, setMode] = useState<'kb' | 'list' | 'mes'>('kb')
  const [f, setF] = useState({ c: '', s: '', w: '', q: '' })
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [editing, setEditing] = useState<Content | { date?: string } | null>(null)
  useOpenFromUrl('conteudo', contents.data, setEditing)

  const all = contents.data ?? []
  const L = all.filter((c) => (!f.c || c.client_id === f.c) && (!f.s || c.status_id === f.s) && (!f.w || c.owner_id === f.w)
    && (!f.q || c.title.toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => (a.publish_date ?? '9').localeCompare(b.publish_date ?? '9'))
  const cname = (id: string | null) => clients.data?.find((c) => c.id === id)?.name ?? 'Sem cliente'
  const fname = (id: string | null) => formats.byId(id)?.label
  const canWrite = can('producao', 'write')
  const lateCount = all.filter(contentLate).length
  const toPost = all.filter((c) => !c.posted_at && c.publish_date && c.publish_date <= today()).length

  async function togglePosted(c: Content) {
    if (!posted) return
    const to = c.posted_at ? (beforePosted?.id ?? null) : posted.id
    await run(() => db.update('contents', { id: c.id }, { status_id: to }), c.posted_at ? 'Marcado como não postado' : 'Marcado como postado')
  }
  const move = (c: Content, statusId: string) =>
    run(() => db.update('contents', { id: c.id }, { status_id: statusId }), `Movido para ${status.byId(statusId)?.label ?? ''}`)

  const meta = (c: Content) => [cname(c.client_id), fname(c.format_id), people.name(c.owner_id) || 'sem responsável'].filter(Boolean).join(' · ')
  const when = (c: Content) => c.publish_date ? `publica ${fd(c.publish_date)}${c.publish_time ? ` ${c.publish_time.slice(0, 5)}` : ''}` : 'sem data de publicação'

  const row = (c: Content) => {
    const st = status.byId(c.status_id)
    const late = contentLate(c)
    const color = c.posted_at ? '#2e9e6a' : late ? '#c0392b' : st?.color ?? '#999'
    return (
      <div key={c.id} className={`row tk ${c.posted_at ? 'dn' : ''}`} style={{ borderLeft: `5px solid ${color}` }}>
        <button className={`ck ${c.posted_at ? 'on' : ''}`} onClick={() => togglePosted(c)} disabled={!canWrite}
          aria-label={c.posted_at ? `Desmarcar ${c.title} como postado` : `Marcar ${c.title} como postado`} title={c.posted_at ? 'Postado' : 'Marcar como postado'}>
          {c.posted_at && <Check aria-hidden />}
        </button>
        <div role="button" tabIndex={0} onClick={() => setEditing(c)} onKeyDown={(e) => e.key === 'Enter' && setEditing(c)} style={{ cursor: 'pointer' }}>
          <b>{c.title}</b><br />
          <small>{meta(c)} · {when(c)}{c.due_date && !c.posted_at ? ` · prazo ${fd(c.due_date)}` : ''}</small>
        </div>
        <div className="meta">
          <Tag color={late ? '#c0392b' : st?.color}>{late ? 'Atrasado' : st?.label ?? '—'}</Tag>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHead title="Calendário editorial"
        sub={<>{all.filter((c) => !c.posted_at).length} em aberto · {toPost} para postar até hoje{lateCount ? <> · <span style={{ color: 'var(--er)' }}>{lateCount} atrasados</span></> : ''}{scope('producao') === 'own' && ' · você vê os conteúdos atribuídos a você'}</>}
        actions={canWrite && <button className="btn primary" onClick={() => setEditing({})}>Novo conteúdo</button>} />

      <div className="toolbar">
        <Seg value={mode} onChange={setMode} items={[['kb', 'Kanban'], ['list', 'Lista'], ['mes', 'Mês']]} />
        <input type="search" placeholder="Buscar conteúdo" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar conteúdo" />
        {can('clientes') && <Select value={f.c} onChange={(e) => setF({ ...f, c: e.target.value })} placeholder="Todos os clientes" aria-label="Cliente" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />}
        {mode !== 'kb' && <Select value={f.s} onChange={(e) => setF({ ...f, s: e.target.value })} placeholder="Todos os status" aria-label="Status" options={status.list.map((s) => ({ value: s.id, label: s.label }))} />}
        <Select value={f.w} onChange={(e) => setF({ ...f, w: e.target.value })} placeholder="Todos os responsáveis" aria-label="Responsável" options={people.active.map((p) => ({ value: p.id, label: p.name }))} />
      </div>

      {contents.isLoading ? <Loading /> : mode === 'list' ? (
        L.length ? L.map(row) : <Empty action={canWrite && <button className="btn primary" onClick={() => setEditing({})}>Novo conteúdo</button>}>{all.length ? 'Nenhum conteúdo com esses filtros' : 'Nenhum conteúdo ainda'}</Empty>
      ) : mode === 'kb' ? (
        <Kanban columns={status.list} items={L} columnOf={(c) => c.status_id} onOpen={setEditing}
          onMove={canWrite ? move : undefined}
          renderCard={(c) => (
            <>
              <b>{c.title}</b>
              <small>{cname(c.client_id)}{fname(c.format_id) ? ` · ${fname(c.format_id)}` : ''}</small>
              <small style={contentLate(c) ? { color: 'var(--er)', fontWeight: 600 } : undefined}>{people.name(c.owner_id) || 'sem responsável'} · {c.publish_date ? fd(c.publish_date) : 'sem data'}</small>
            </>
          )} />
      ) : (
        <MonthGrid month={month} onMonth={setMonth}
          onDay={(d) => canWrite && setEditing({ date: d })}
          dayLabel={(d) => `${d}: ${L.filter((c) => c.publish_date === d).length} conteúdos`}
          renderDay={(d) => {
            const list = L.filter((c) => c.publish_date === d)
            return (
              <>
                {list.slice(0, 3).map((c) => (
                  <em key={c.id} role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setEditing(c) }}
                    style={{ background: c.posted_at ? '#2e9e6a' : contentLate(c) ? '#c0392b' : status.byId(c.status_id)?.color ?? '#55555f' }}>
                    {c.posted_at ? '✓ ' : ''}{c.title}
                  </em>
                ))}
                {list.length > 3 && <small>+{list.length - 3}</small>}
              </>
            )
          }} />
      )}

      {editing && <ContentForm key={'id' in editing ? editing.id : 'new'} content={'id' in editing ? editing as Content : null}
        date={'date' in editing ? editing.date : undefined} defaultClient={f.c} onClose={() => setEditing(null)} />}
    </>
  )
}

export function ContentForm({ content, date, defaultClient, onClose }: { content: Content | null; date?: string; defaultClient?: string; onClose: () => void }) {
  const { can, scope, profile } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const people = usePeople()
  const clients = useTable('clients', { order: { column: 'name' }, enabled: can('clientes') })
  const formats = useOptions('content_format')
  const { status, posted, next, beforePosted } = useContentFlow()
  const history = useTable('content_history', { match: { content_id: content?.id ?? '' }, order: { column: 'at' }, enabled: !!content })
  const approvalLinks = useTable('content_approval_links', { match: { content_id: content?.id ?? '' }, order: { column: 'created_at', ascending: false }, enabled: !!content })
  const approvals = useTable('content_approvals', { match: { content_id: content?.id ?? '' }, order: { column: 'created_at', ascending: false }, enabled: !!content })
  const { toast } = useFeedback()
  const me = db.currentUserId() ?? profile?.id ?? ''
  const own = scope('producao') === 'own'
  const canEdit = can('producao', 'write')
  // conteúdo existente abre só para leitura; "Editar" libera os campos
  const [editing, setEditing] = useState(!content)
  const initial = () => ({
    title: content?.title ?? '', client_id: content?.client_id ?? defaultClient ?? '', format_id: content?.format_id ?? '',
    status_id: content?.status_id ?? '', owner_id: content?.owner_id ?? (own ? me : ''), reviewer_id: content?.reviewer_id ?? '',
    due_date: content?.due_date ?? '', publish_date: content?.publish_date ?? date ?? '', publish_time: content?.publish_time?.slice(0, 5) ?? '',
    channel: content?.channel ?? 'Instagram', objective: content?.objective ?? '', briefing: content?.briefing ?? '',
    caption: content?.caption ?? '', links: content?.links ?? '', posted_url: content?.posted_url ?? '',
  })
  const [f, setF] = useState(initial)
  const cancelEdit = () => { setF(initial()); setEditing(false) }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const statusId = f.status_id || status.list[0]?.id || ''
  const formatId = f.format_id || formats.list[0]?.id || ''
  const nx = content ? next(statusId) : undefined
  const isPosted = !!posted && statusId === posted.id
  const valid = f.title.trim() && (f.client_id || !can('clientes'))

  const payload = (overrideStatus?: string) => ({
    title: f.title.trim(), client_id: f.client_id || null, format_id: formatId || null, status_id: overrideStatus ?? (statusId || null),
    owner_id: f.owner_id || null, reviewer_id: f.reviewer_id || null, due_date: f.due_date || null,
    publish_date: f.publish_date || null, publish_time: f.publish_time || null, channel: nn(f.channel), objective: nn(f.objective),
    briefing: nn(f.briefing), caption: nn(f.caption), links: nn(f.links), posted_url: nn(f.posted_url),
  })

  async function save(overrideStatus?: string, msg = 'Conteúdo salvo') {
    if (!valid) return
    const p = payload(overrideStatus)
    const ok = await run(async () => { if (content) await db.update('contents', { id: content.id }, p); else await db.insert('contents', p) }, msg)
    if (ok) onClose()
  }
  async function remove() {
    if (!content || !(await confirm('Excluir este conteúdo?', { danger: true, confirmLabel: 'Excluir' }))) return
    if (await run(() => db.remove('contents', { id: content.id }), 'Conteúdo excluído')) onClose()
  }
  const links = (f.links || '').split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l))
  const nowIso = new Date().toISOString()
  const activeLink = (approvalLinks.data ?? []).find((l) => !l.revoked_at && l.expires_at > nowIso && !(approvals.data ?? []).some((a) => a.link_id === l.id))
  const activeUrl = activeLink ? `${window.location.origin}/aprovar/${activeLink.token}` : null

  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(url); toast('Link copiado') }
    catch { toast('Copie o link exibido no campo', true) }
  }
  async function createApprovalLink() {
    if (!content) return
    const res = await run(() => db.insert('content_approval_links', { content_id: content.id }), 'Link de aprovação gerado')
    if (res && res !== true) void copyLink(`${window.location.origin}/aprovar/${res.token}`)
  }
  async function revokeApprovalLink(linkId: string) {
    await run(() => db.update('content_approval_links', { id: linkId }, { revoked_at: new Date().toISOString() }), 'Link revogado')
  }

  return (
    <Modal open onClose={onClose} size="lg" title={!content ? 'Novo conteúdo' : editing ? 'Editar conteúdo' : 'Conteúdo'}
      footer={<>
        {canEdit && !editing && <button className="btn primary" onClick={() => setEditing(true)}><Pencil aria-hidden />Editar</button>}
        {canEdit && editing && <button className="btn primary" onClick={() => save()} disabled={!valid}>Salvar</button>}
        {canEdit && content && nx && !nx.is_final && <button className="btn" onClick={() => save(nx.id, `Passou para ${nx.label}`)} disabled={!valid}>Passar para {nx.label}</button>}
        {canEdit && posted && !isPosted && <button className="btn" onClick={() => save(posted.id, 'Marcado como postado')} disabled={!valid}><Check aria-hidden />Marcar como postado</button>}
        {canEdit && isPosted && content && <button className="btn" onClick={() => save(beforePosted?.id, 'Marcado como não postado')}>Desmarcar postado</button>}
        {content && editing
          ? <button className="btn" onClick={cancelEdit}>Cancelar edição</button>
          : <button className="btn" onClick={onClose}>{content ? 'Fechar' : 'Cancelar'}</button>}
        {content && editing && can('producao', 'delete') && <button className="btn danger push" onClick={remove}>Excluir</button>}
      </>}>
      {content?.posted_at && (
        <p className="posted-note"><Check aria-hidden />Postado em {fdt(content.posted_at)}
          {content.posted_url && /^https?:\/\//i.test(content.posted_url) && <> · <a href={content.posted_url} target="_blank" rel="noopener noreferrer">ver publicação <ExternalLink aria-hidden /></a></>}</p>
      )}
      <fieldset disabled={!canEdit || !editing} className={editing ? undefined : 'readonly'} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Título *" full><input value={f.title} onChange={set('title')} placeholder="Ex.: Reels de bastidores da cozinha" /></Field>
          {can('clientes') && <Field label="Cliente *"><Select value={f.client_id} onChange={set('client_id')} placeholder="Selecione" options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>}
          <Field label="Formato"><Select value={formatId} onChange={set('format_id')} options={formats.list.map((o) => ({ value: o.id, label: o.label }))} /></Field>
          <Field label="Status"><Select value={statusId} onChange={set('status_id')} options={status.list.map((s) => ({ value: s.id, label: s.label }))} /></Field>
          <Field label="Canal"><input value={f.channel} onChange={set('channel')} placeholder="Ex.: Instagram, TikTok, LinkedIn" /></Field>
          <Field label="Responsável pela criação">
            <Select value={f.owner_id} onChange={set('owner_id')} disabled={own} placeholder="Sem responsável" options={people.active.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Responsável pela revisão"><Select value={f.reviewer_id} onChange={set('reviewer_id')} placeholder="Sem revisor" options={people.active.map((p) => ({ value: p.id, label: p.name }))} /></Field>
          <Field label="Prazo de produção"><input type="date" value={f.due_date} onChange={set('due_date')} /></Field>
          <Field label="Data de publicação" hint="Aparece na Agenda e no calendário do Início"><input type="date" value={f.publish_date} onChange={set('publish_date')} /></Field>
          <Field label="Horário de publicação"><input type="time" value={f.publish_time} onChange={set('publish_time')} /></Field>
          <Field label="Objetivo"><input value={f.objective} onChange={set('objective')} placeholder="Ex.: engajamento, divulgar lançamento" /></Field>
          <Field label="Briefing" full><textarea rows={3} value={f.briefing} onChange={set('briefing')} placeholder="O que o cliente pediu, público, tom, referências de marca" /></Field>
          <Field label="Legenda e roteiro" full><textarea rows={5} value={f.caption} onChange={set('caption')} placeholder="Texto da legenda, roteiro do vídeo, hashtags" /></Field>
          <Field label="Referências e links de visualização" full hint="Um link por linha: pasta do Drive, arquivo do vídeo, referências">
            <textarea rows={2} value={f.links} onChange={set('links')} placeholder="https://…" />
          </Field>
          {(isPosted || content?.posted_at) && <Field label="Link da publicação" full><input value={f.posted_url} onChange={set('posted_url')} placeholder="https://instagram.com/p/…" /></Field>}
        </div>
      </fieldset>
      {links.length > 0 && (
        <div className="link-list">{links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden />{l.replace(/^https?:\/\//, '').slice(0, 60)}</a>)}</div>
      )}
      {content && (
        <fieldset className="box">
          <legend>Aprovação externa (link para o cliente)</legend>
          {activeUrl ? (
            <div className="toolbar" style={{ margin: 0 }}>
              <input readOnly value={activeUrl} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 200 }} aria-label="Link de aprovação" />
              <button type="button" className="btn" onClick={() => copyLink(activeUrl)}><Copy aria-hidden />Copiar</button>
              {canEdit && <button type="button" className="btn danger" onClick={() => revokeApprovalLink(activeLink!.id)}><Trash2 aria-hidden />Revogar</button>}
            </div>
          ) : canEdit ? (
            <button type="button" className="btn" onClick={createApprovalLink}><Link2 aria-hidden />Gerar link de aprovação</button>
          ) : <p className="mu" style={{ margin: 0 }}>Nenhum link de aprovação ativo</p>}
          {(approvals.data ?? []).length > 0 && (
            <div className="hist" style={{ marginTop: 12 }}>
              {approvals.data!.map((a) => (
                <span key={a.id}>
                  {fdt(a.created_at)} · <b>{a.decision === 'aprovado' ? 'Aprovado' : 'Ajustes solicitados'}</b> por {a.reviewer_name}{a.comment ? ` — "${a.comment}"` : ''}
                </span>
              ))}
            </div>
          )}
        </fieldset>
      )}
      {content && (history.data?.length ?? 0) > 0 && (
        <div className="hist">
          {history.data!.slice(-6).map((h) => (
            <span key={h.id}>{fdt(h.at)} · {h.from_label ? `${h.from_label} → ${h.to_label}` : `criado como ${h.to_label}`}{h.actor ? ` por ${people.name(h.actor)}` : ''}</span>
          ))}
        </div>
      )}
      {content ? <Comments entity="content" id={content.id} /> : <p className="mu" style={{ fontSize: 13 }}>Salve o conteúdo para adicionar comentários</p>}
    </Modal>
  )
}
