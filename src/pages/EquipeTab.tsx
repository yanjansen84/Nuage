import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { db, type NewUserResult } from '../data/db'
import { useRun, useTable } from '../data/hooks'
import type { ProfileRow } from '../data/types'
import { useAuth } from '../lib/auth'
import { useFeedback } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { Empty, Field, initials, Loading, maskEmail, maskInteger, maskPhone, maskSocial, nn, num, Select } from '../ui/kit'

/** Aba "Equipe e usuários" de Configurações: crachás, contatos, cargo e criação de usuários. */
export function EquipeTab() {
  const { can } = useAuth()
  const admin = can('configuracoes', 'write')
  const profiles = useTable('profiles', { order: { column: 'name' } })
  const roles = useTable('roles', { order: { column: 'sort' } })
  const tasks = useTable('tasks', { enabled: can('projetos') })
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showOff, setShowOff] = useState(false)
  const roleName = (k: string | null) => roles.data?.find((r) => r.key === k)?.name.split(' / ')[0] ?? 'Sem cargo'
  const L = [...(profiles.data ?? [])].filter((p) => showOff || p.active)
    .sort((a, b) => Number(b.role === 'ceo') - Number(a.role === 'ceo') || a.name.localeCompare(b.name))
  const openOf = (id: string) => (tasks.data ?? []).filter((t) => t.owner_id === id && !t.done_at)
  const open = profiles.data?.find((p) => p.id === openId)

  return (
    <>
      <div className="toolbar">
        <span className="mu">Cada pessoa tem seu crachá e conta própria. Toque no crachá para ver contatos{admin ? ', cargo e acesso' : ''}.</span>
        <span className="spacer" />
        <label className="mu" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> mostrar inativos
        </label>
        {admin && <button className="btn primary" onClick={() => setCreating(true)}>Novo usuário</button>}
      </div>
      {profiles.isLoading ? <Loading /> : !L.length ? <Empty>Nenhuma pessoa cadastrada</Empty> : (
        <div className="badges">
          {L.map((p) => (
            <button key={p.id} type="button" className={`badge ${p.role === 'ceo' ? 'ceo' : ''} ${p.link === 'Estagiário' ? 'est' : ''} ${p.active ? '' : 'off'}`} onClick={() => setOpenId(p.id)}>
              <i className="slot" />
              <div className="av">{initials(p.name)}</div>
              <b>{p.name}</b>
              <span className="rl">{roleName(p.role)}</span>
              {p.link === 'Estagiário' && <small>Estagiário</small>}
              {!p.active && <small>Inativo</small>}
              {can('projetos') && p.active && <small>{openOf(p.id).length} tarefas em aberto</small>}
            </button>
          ))}
        </div>
      )}
      {open && <PersonModal key={open.id} person={open} roleName={roleName(open.role)} openTasks={openOf(open.id)} onClose={() => setOpenId(null)} />}
      {creating && <NewUserModal onClose={() => setCreating(false)} />}
    </>
  )
}

function PersonModal({ person, roleName, openTasks, onClose }: {
  person: ProfileRow; roleName: string; openTasks: { effort_hours: number | null }[]; onClose: () => void
}) {
  const { can, profile, reload } = useAuth()
  const run = useRun()
  const { confirm } = useFeedback()
  const roles = useTable('roles', { order: { column: 'sort' } })
  const me = db.currentUserId() ?? profile?.id
  const isMe = person.id === me
  const admin = can('configuracoes', 'write')
  const canEdit = isMe || admin || can('equipe', 'write')
  const details = useTable('profile_details', { match: { id: person.id } })
  const d = details.data?.[0]
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState<Record<string, string>>({})
  const v = (k: string, fallback: string | null | undefined) => f[k] ?? fallback ?? ''
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const handle = (s: string | null) => (s ?? '').replace(/^@/, '')
  const hours = openTasks.reduce((a, t) => a + (t.effort_hours ?? 0), 0)
  const cap = person.weekly_capacity_hours

  async function save() {
    const name = v('name', person.name).trim()
    if (!name) return
    const ok = await run(async () => {
      const pp: Partial<ProfileRow> = { name, link: v('link', person.link) as ProfileRow['link'] }
      if (admin) pp.weekly_capacity_hours = num(v('cap', cap?.toString()))
      // nome/vínculo: a própria pessoa ou administrador; contatos: também quem gerencia a Equipe
      if (isMe || admin) await db.update('profiles', { id: person.id }, pp)
      await db.update('profile_details', { id: person.id }, {
        phone: nn(v('phone', d?.phone)), email: nn(v('email', d?.email)), insta: nn(v('insta', d?.insta)), x: nn(v('x', d?.x)),
      })
    }, 'Dados salvos')
    if (ok) { if (isMe) reload(); setEditing(false) }
  }
  async function setRole(role: string) {
    await run(() => db.update('profiles', { id: person.id }, { role: role || null }), 'Cargo atualizado')
  }
  async function toggleActive() {
    if (person.active && !(await confirm(`Desativar ${person.name}? A pessoa perde o acesso ao sistema.`, { danger: true, confirmLabel: 'Desativar' }))) return
    await run(() => db.update('profiles', { id: person.id }, { active: !person.active }), person.active ? 'Usuário desativado' : 'Usuário reativado')
  }

  return (
    <Modal open onClose={onClose} title={person.name}
      footer={editing
        ? <><button className="btn primary" onClick={save}>Salvar</button><button className="btn" onClick={() => setEditing(false)}>Cancelar</button></>
        : <>
          {canEdit && <button className="btn primary" onClick={() => setEditing(true)}>Editar dados</button>}
          <button className="btn" onClick={onClose}>Fechar</button>
          {admin && !isMe && <button className={`btn push ${person.active ? 'danger' : ''}`} onClick={toggleActive}>{person.active ? 'Desativar acesso' : 'Reativar acesso'}</button>}
        </>}>
      <p><span className="tag">{roleName}</span> <span className="tag soft">{person.link}</span> {!person.active && <span className="tag late">Inativo</span>}</p>

      {admin && !editing && (
        <Field label="Cargo" hint={isMe ? 'Você não pode alterar o próprio cargo, para não perder o acesso administrativo' : 'Define as permissões padrão (ajustes individuais em Permissões)'}>
          <Select value={person.role ?? ''} disabled={isMe} onChange={(e) => setRole(e.target.value)} placeholder="Sem cargo"
            options={(roles.data ?? []).map((r) => ({ value: r.key, label: r.name }))} />
        </Field>
      )}

      {!editing ? (
        <>
          {d ? (
            <dl className="kv" style={{ marginTop: 16 }}>
              <dt>Telefone</dt><dd>{d.phone ? <a href={`tel:${d.phone}`}>{d.phone}</a> : '—'}</dd>
              <dt>E-mail</dt><dd>{d.email ? <a href={`mailto:${d.email}`}>{d.email}</a> : '—'}</dd>
              <dt>Instagram</dt><dd>{d.insta ? <a href={`https://instagram.com/${handle(d.insta)}`} target="_blank" rel="noopener noreferrer">@{handle(d.insta)}</a> : '—'}</dd>
              <dt>X</dt><dd>{d.x ? <a href={`https://x.com/${handle(d.x)}`} target="_blank" rel="noopener noreferrer">@{handle(d.x)}</a> : '—'}</dd>
            </dl>
          ) : <p className="mu">Os contatos da equipe são visíveis para quem tem acesso ao módulo Equipe</p>}
          {can('projetos') && (
            <div className="panel" style={{ marginTop: 16 }}>
              <h3>Carga de trabalho</h3>
              <p style={{ margin: 0 }}>{openTasks.length} tarefas em aberto{hours ? ` · ${hours}h estimadas` : ''}{cap ? ` · capacidade de ${cap}h/semana` : ''}</p>
              {cap && hours > cap && <p style={{ margin: '8px 0 0', color: 'var(--er)', fontWeight: 500 }}>Acima da capacidade semanal</p>}
            </div>
          )}
        </>
      ) : (
        <div className="form-grid">
          <Field label="Nome *" full><input value={v('name', person.name)} onChange={set('name')} disabled={!isMe && !admin} placeholder="Nome completo" /></Field>
          <Field label="Vínculo"><Select value={v('link', person.link)} onChange={set('link')} disabled={!isMe && !admin} options={['Efetivo', 'Estagiário'].map((x) => ({ value: x, label: x }))} /></Field>
          {admin && <Field label="Capacidade (h/semana)"><input type="text" inputMode="numeric" value={v('cap', cap?.toString())} onChange={(e) => setF({ ...f, cap: maskInteger(e.target.value) })} placeholder="Ex.: 40" /></Field>}
          <Field label="Telefone"><input value={v('phone', d?.phone)} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} inputMode="tel" maxLength={15} placeholder="(00) 00000-0000" /></Field>
          <Field label="E-mail de contato"><input type="email" value={v('email', d?.email)} onChange={(e) => setF({ ...f, email: maskEmail(e.target.value) })} placeholder="nome@empresa.com.br" /></Field>
          <Field label="Instagram"><input value={v('insta', d?.insta)} onChange={(e) => setF({ ...f, insta: maskSocial(e.target.value) })} placeholder="@usuario" /></Field>
          <Field label="X (Twitter)"><input value={v('x', d?.x)} onChange={(e) => setF({ ...f, x: maskSocial(e.target.value) })} placeholder="@usuario" /></Field>
        </div>
      )}
    </Modal>
  )
}

function NewUserModal({ onClose }: { onClose: () => void }) {
  const run = useRun()
  const roles = useTable('roles', { order: { column: 'sort' } })
  const [f, setF] = useState({ name: '', email: '', role: '' })
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<(NewUserResult & { name: string }) | null>(null)
  const valid = f.name.trim() && /\S+@\S+\.\S+/.test(f.email) && f.role && !busy

  async function send() {
    if (!valid) return
    setBusy(true)
    const name = f.name.trim()
    const r = await run(() => db.createUser({ name, email: f.email.trim().toLowerCase(), role: f.role }))
    setBusy(false)
    if (r && r !== true) setCreated({ ...r, name })
  }

  if (created) return <UserCreatedModal user={created} onClose={onClose} />

  return (
    <Modal open onClose={onClose} title="Novo usuário" size="sm"
      footer={<><button className="btn primary" onClick={send} disabled={!valid}>{busy ? 'Criando…' : 'Criar usuário'}</button><button className="btn" onClick={onClose}>Cancelar</button></>}>
      <p className="mu" style={{ marginTop: 0 }}>O sistema gera uma senha provisória. A pessoa troca a senha no primeiro acesso.</p>
      <Field label="Nome *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus placeholder="Nome completo" maxLength={120} /></Field>
      <Field label="E-mail de acesso *"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: maskEmail(e.target.value) })} placeholder="nome@empresa.com.br" /></Field>
      <Field label="Cargo *"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Selecione o cargo" options={(roles.data ?? []).map((r) => ({ value: r.key, label: r.name }))} /></Field>
    </Modal>
  )
}

/** Confirmação com a senha provisória. Ela só aparece aqui: ao fechar, não há como vê-la de novo. */
function UserCreatedModal({ user, onClose }: { user: NewUserResult & { name: string }; onClose: () => void }) {
  const { toast } = useFeedback()
  const [copied, setCopied] = useState<'senha' | 'tudo' | null>(null)

  async function copy(text: string, what: 'senha' | 'tudo') {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // navegadores sem a API de área de transferência (ou sem permissão)
      const t = document.createElement('textarea')
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'
      // dentro do <dialog> aberto: fora dele o foco/seleção é bloqueado pelo modal
      ;(document.querySelector('dialog[open]') ?? document.body).appendChild(t)
      t.select()
      const ok = document.execCommand('copy')
      t.remove()
      if (!ok) return toast('Não foi possível copiar. Selecione a senha e copie manualmente.', true)
    }
    setCopied(what)
    toast(what === 'senha' ? 'Senha copiada' : 'Dados de acesso copiados')
  }

  const access = [
    'Acesso ao Na.Nu',
    `Endereço: ${window.location.origin}`,
    `E-mail: ${user.email}`,
    `Senha provisória: ${user.password}`,
    'No primeiro acesso você vai criar uma senha nova.',
  ].join('\n')

  return (
    <Modal open onClose={onClose} title="Usuário criado com sucesso" size="sm"
      footer={<><button className="btn primary" onClick={onClose}>Concluir</button></>}>
      <div className="user-created">
        <p style={{ marginTop: 0 }}><Check aria-hidden className="ok-ico" /> <b>{user.name}</b> já pode acessar o Na.Nu.</p>
        <dl className="kv">
          <dt>E-mail de acesso</dt><dd>{user.email}</dd>
          <dt>Senha provisória</dt>
          <dd className="pass-row">
            <code className="pass" aria-label="Senha provisória">{user.password}</code>
            <button type="button" className="btn" onClick={() => copy(user.password, 'senha')}>
              {copied === 'senha' ? <Check aria-hidden /> : <Copy aria-hidden />}{copied === 'senha' ? 'Copiada' : 'Copiar senha'}
            </button>
          </dd>
        </dl>
        <button type="button" className="btn ghost" onClick={() => copy(access, 'tudo')}>
          {copied === 'tudo' ? <Check aria-hidden /> : <KeyRound aria-hidden />}{copied === 'tudo' ? 'Dados copiados' : 'Copiar e-mail, senha e endereço'}
        </button>
        <p className="money-note">Envie a senha por um canal privado. Por segurança, ela não será exibida de novo e a pessoa terá que trocá-la no primeiro acesso.</p>
      </div>
    </Modal>
  )
}
