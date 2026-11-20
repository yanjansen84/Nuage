import { useState } from 'react'
import { db } from '../data/db'
import { usePeople, useRun, useTable } from '../data/hooks'
import type { Comment } from '../data/types'
import { useAuth } from '../lib/auth'
import { fdt } from '../ui/kit'

/** Comentários de qualquer registro (tarefa, projeto, lead, cliente). */
export function Comments({ entity, id }: { entity: Comment['entity']; id: string }) {
  const { profile } = useAuth()
  const people = usePeople()
  const run = useRun()
  const q = useTable('comments', { match: { entity, entity_id: id }, order: { column: 'created_at' } })
  const [text, setText] = useState('')
  const me = db.currentUserId() ?? profile?.id

  async function send() {
    const body = text.trim()
    if (!body) return
    const ok = await run(() => db.insert('comments', { entity, entity_id: id, body, author_id: me ?? undefined }))
    if (ok) setText('')
  }

  return (
    <div className="comments">
      <h3>Comentários{q.data?.length ? ` (${q.data.length})` : ''}</h3>
      {(q.data ?? []).map((c) => (
        <div key={c.id} className={`comment ${c.resolved ? 'resolved' : ''}`}>
          <small>{people.name(c.author_id) || 'Alguém'} · {fdt(c.created_at)}{c.resolved ? ' · resolvido' : ''}</small>
          <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
          {(c.author_id === me) && (
            <button type="button" className="btn ghost sm" onClick={() => run(() => db.update('comments', { id: c.id }, { resolved: !c.resolved }))}>
              {c.resolved ? 'Reabrir' : 'Marcar como resolvido'}
            </button>
          )}
        </div>
      ))}
      <div className="comment-form">
        <textarea rows={2} placeholder="Escreva um comentário…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }} aria-label="Novo comentário" />
        <button type="button" className="btn" onClick={send} disabled={!text.trim()}>Enviar</button>
      </div>
    </div>
  )
}
