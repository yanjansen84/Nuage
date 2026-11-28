import { Check, ExternalLink, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import logoBranco from '../assets/logo-nanu-branco.png'
import { db } from '../data/db'
import type { PublicApprovalInfo } from '../data/types'
import { fdFull, Field, Loading, Tag } from '../ui/kit'

export default function AprovacaoPublica() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<PublicApprovalInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true); setNotFound(false); setErr('')
    db.getContentForApproval(token)
      .then((res) => {
        if (!alive) return
        if (!res) setNotFound(true)
        else setInfo(res)
      })
      .catch(() => { if (alive) setNotFound(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [token])

  async function submit(decision: 'aprovado' | 'ajustes') {
    if (busy || !info) return
    if (!name.trim()) return setErr('Informe seu nome antes de enviar.')
    if (decision === 'ajustes' && !comment.trim()) return setErr('Descreva quais ajustes são necessários.')
    setBusy(true); setErr('')
    try {
      await db.submitContentApproval({ token, decision, reviewer_name: name.trim(), comment: comment.trim() || null })
      const updated = await db.getContentForApproval(token)
      if (updated) setInfo(updated)
    } catch (e) {
      setErr((e as Error).message || 'Não foi possível registrar sua resposta.')
    } finally {
      setBusy(false)
    }
  }

  const links = (info?.links ?? '').split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l))

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--ink)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img src={logoBranco} alt="Na.Nu" width={1200} height={309} style={{ height: 24, width: 'auto' }} />
        <span style={{ color: 'rgba(255,255,255,.72)', fontSize: 13 }}>Aprovação de conteúdo</span>
      </header>
      <div className="strip" />

      <main style={{ maxWidth: 740, margin: '32px auto', padding: '0 16px 64px' }}>
        {loading ? <Loading /> : notFound || !info ? (
          <div className="panel" style={{ textAlign: 'center', padding: 32 }}>
            <h1>Link inválido ou expirado</h1>
            <p className="mu">Este link de aprovação foi revogado, expirou ou não existe. Solicite um novo link à equipe da Nuage.</p>
          </div>
        ) : (
          <div className="panel" style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                {info.client_name && <small className="mu">{info.client_name}</small>}
                <h1 style={{ margin: '2px 0 0', fontSize: 26 }}>{info.title}</h1>
              </div>
              <Tag color={info.status_color}>{info.status_label ?? 'Em revisão'}</Tag>
            </div>

            <dl className="kv">
              <dt>Formato</dt><dd>{info.format_label || '—'}</dd>
              <dt>Canal</dt><dd>{info.channel || '—'}</dd>
              <dt>Publicação prevista</dt>
              <dd>{info.publish_date ? `${fdFull(info.publish_date)}${info.publish_time ? ` às ${info.publish_time.slice(0, 5)}` : ''}` : 'A definir'}</dd>
              {info.objective && <><dt>Objetivo</dt><dd>{info.objective}</dd></>}
            </dl>

            {info.caption && (
              <div className="box" style={{ margin: 0 }}>
                <small className="mu" style={{ display: 'block', marginBottom: 6 }}>Legenda e roteiro</small>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{info.caption}</div>
              </div>
            )}

            {links.length > 0 && (
              <div>
                <small className="mu" style={{ display: 'block', marginBottom: 6 }}>Arquivos e visualização</small>
                <div className="link-list">
                  {links.map((l) => (
                    <a key={l} href={l} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden />{l.replace(/^https?:\/\//, '').slice(0, 64)}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {info.decision ? (
              <div className="panel" style={{ background: 'var(--raise)', borderColor: info.decision === 'aprovado' ? 'var(--ok)' : 'var(--ac)' }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {info.decision === 'aprovado' ? '✓ Conteúdo aprovado' : 'Ajustes solicitados'} por {info.reviewer_name}
                </p>
                {info.feedback && <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{info.feedback}</p>}
                {info.decided_at && <small className="mu" style={{ display: 'block', marginTop: 8 }}>Registrado em {fdFull(info.decided_at)}</small>}
              </div>
            ) : (
              <div style={{ borderTop: '1px solid var(--ln)', paddingTop: 16, display: 'grid', gap: 12 }}>
                <h3 style={{ margin: 0 }}>Sua avaliação</h3>
                <Field label="Seu nome *">
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Como você gostaria de ser identificado" />
                </Field>
                <Field label="Comentários ou ajustes" hint="Obrigatório caso solicite ajustes">
                  <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Observações sobre arte, vídeo ou legenda…" />
                </Field>
                {err && <p style={{ color: 'var(--er)', margin: 0, fontSize: 14 }} role="alert">{err}</p>}
                <div className="bar" style={{ margin: 0 }}>
                  <button type="button" className="btn primary" disabled={busy} onClick={() => submit('aprovado')}>
                    <Check aria-hidden />{busy ? 'Enviando…' : 'Aprovar conteúdo'}
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => submit('ajustes')}>
                    <MessageSquare aria-hidden />Solicitar ajustes
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
