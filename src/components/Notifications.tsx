// Sino de notificações: contador, painel com a lista, tempo real e alertas do dispositivo.
// As notificações são criadas pelo banco (triggers e lembretes); aqui só lemos,
// marcamos como lidas, dispensamos e levamos a pessoa até o assunto.
import type { LucideIcon } from 'lucide-react'
import {
  AlarmClock, Bell, BellRing, Briefcase, CalendarDays, CheckCheck, CircleCheck, Clapperboard, ClipboardList,
  Compass, KanbanSquare, MessageSquare, UserPlus, Wallet, X,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { useTable } from '../data/hooks'
import type { NotificationRow } from '../data/types'
import { useAuth } from '../lib/auth'
import { isDemo } from '../lib/supabase'
import { useFeedback } from '../ui/Feedback'

const KINDS: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  task_assigned: { icon: ClipboardList, tone: 'var(--k3)', label: 'Tarefa' },
  task_shared: { icon: UserPlus, tone: 'var(--k3)', label: 'Tarefa' },
  task_done: { icon: CircleCheck, tone: 'var(--ok)', label: 'Tarefa concluída' },
  task_due: { icon: AlarmClock, tone: 'var(--k5)', label: 'Prazo' },
  task_late: { icon: AlarmClock, tone: 'var(--er)', label: 'Atraso' },
  project_assigned: { icon: KanbanSquare, tone: 'var(--k4)', label: 'Projeto' },
  project_member: { icon: KanbanSquare, tone: 'var(--k4)', label: 'Projeto' },
  content_assigned: { icon: Clapperboard, tone: 'var(--k2)', label: 'Conteúdo' },
  content_review: { icon: Clapperboard, tone: 'var(--k2)', label: 'Revisão' },
  content_status: { icon: Clapperboard, tone: 'var(--k2)', label: 'Conteúdo' },
  content_publish: { icon: Clapperboard, tone: 'var(--k1)', label: 'Publicação' },
  content_approved: { icon: CircleCheck, tone: 'var(--ok)', label: 'Aprovado' },
  content_changes: { icon: Clapperboard, tone: 'var(--er)', label: 'Ajustes' },
  strategy_assigned: { icon: Compass, tone: 'var(--k4)', label: 'Estratégia' },
  lead_assigned: { icon: Briefcase, tone: 'var(--k1)', label: 'Comercial' },
  lead_followup: { icon: Briefcase, tone: 'var(--k5)', label: 'Retorno' },
  event: { icon: CalendarDays, tone: 'var(--k4)', label: 'Agenda' },
  comment: { icon: MessageSquare, tone: 'var(--k3)', label: 'Comentário' },
  pay_late: { icon: Wallet, tone: 'var(--er)', label: 'Financeiro' },
  bills_due: { icon: Wallet, tone: 'var(--k5)', label: 'Contas a pagar' },
  contract_ending: { icon: Briefcase, tone: 'var(--k5)', label: 'Contrato' },
}
const kindOf = (k: string) => KINDS[k] ?? { icon: Bell, tone: 'var(--mu)', label: 'Aviso' }

const REFRESH_MS = 10 * 60 * 1000 // lembretes (prazos do dia) a cada 10 minutos com o app aberto

function when(iso: string) {
  const d = new Date(iso), now = new Date()
  const min = Math.round((now.getTime() - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return `há ${Math.round(min / 60)} h`
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `ontem, ${time}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') + `, ${time}`
}
function groupOf(iso: string) {
  const d = new Date(iso), now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Hoje'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Ontem'
  return 'Anteriores'
}
const safeLink = (l: string | null) => (l && /^\/([^/]|$)/.test(l) ? l : null) // só caminhos internos

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
function urlBase64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
async function syncPushSubscription(userId: string) {
  if (isDemo || !VAPID_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
    })
    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return
    await db.upsert('push_subscriptions', {
      user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
    }, 'user_id,endpoint')
  } catch { /* navegador sem suporte ou VAPID não configurado */ }
}

/** Alerta do sistema (fora da página): só com permissão e com o app em segundo plano. */
async function systemAlert(n: NotificationRow) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker?.getRegistration()
  const opts: NotificationOptions = { body: n.body ?? undefined, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: n.id, data: { link: safeLink(n.link) ?? '/' } }
  if (reg) await reg.showNotification(n.title, opts)
  else new Notification(n.title, opts)
}

export function NotificationBell() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const q = useTable('notifications', { order: { column: 'created_at', ascending: false }, limit: 80 })
  const [open, setOpen] = useState(false)
  const [only, setOnly] = useState<'unread' | 'all'>('all')
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'))
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const list = q.data ?? []
  const unread = list.filter((n) => !n.read_at).length
  const shown = only === 'unread' ? list.filter((n) => !n.read_at) : list
  const reload = useCallback(() => qc.invalidateQueries({ queryKey: ['t', 'notifications'] }), [qc])

  // lembretes do dia: ao abrir o app, ao voltar para a aba e periodicamente
  useEffect(() => {
    if (!profile?.id) return
    const refresh = () => { db.refreshNotifications().then((n) => { if (n) void reload() }).catch(() => { /* sem rede: tenta depois */ }) }
    refresh()
    const t = window.setInterval(refresh, REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [profile?.id, reload])

  // tempo real: chegou aviso novo + sincroniza assinatura Web Push quando permitido
  useEffect(() => {
    if (!profile?.id) return
    void syncPushSubscription(profile.id)
    return db.subscribeNotifications(profile.id, (n) => {
      void reload()
      if (!n) return
      if (document.visibilityState === 'visible') toast(n.title)
      else void systemAlert(n)
    })
  }, [profile?.id, reload, toast])

  // contador no título da aba e no ícone do app instalado (PWA)
  useEffect(() => {
    document.title = unread ? `(${unread}) Na.Nu` : 'Na.Nu'
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (unread) nav.setAppBadge?.(unread).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  }, [unread])

  // painel aberto: Esc e clique fora fecham
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    const onDown = (e: MouseEvent | TouchEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown) }
  }, [open])

  async function openItem(n: NotificationRow) {
    setOpen(false)
    if (!n.read_at) { await db.update('notifications', { id: n.id }, { read_at: new Date().toISOString() }).catch(() => {}); void reload() }
    const link = safeLink(n.link)
    if (link) navigate(link)
  }
  async function dismiss(n: NotificationRow) {
    await db.remove('notifications', { id: n.id }).catch(() => toast('Não foi possível dispensar. Tente de novo', true))
    void reload()
  }
  async function readAll() {
    await db.markAllNotificationsRead().catch(() => toast('Não foi possível marcar como lidas. Tente de novo', true))
    void reload()
  }
  async function enableAlerts() {
    if (!('Notification' in window)) return
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') {
      if (profile?.id) void syncPushSubscription(profile.id)
      toast('Alertas ativados neste dispositivo')
    }
  }

  let lastGroup = ''
  return (
    <div className="notif" ref={wrapRef}>
      <button ref={btnRef} type="button" className="notif-btn" onClick={() => setOpen(!open)}
        aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog"
        aria-label={unread ? `Notificações, ${unread} não lida${unread > 1 ? 's' : ''}` : 'Notificações'}>
        {unread ? <BellRing aria-hidden /> : <Bell aria-hidden />}
        {unread > 0 && <span className="notif-count" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" id={panelId} role="dialog" aria-label="Notificações">
          <div className="notif-head">
            <h2>Notificações</h2>
            {unread > 0 && <button type="button" className="btn ghost sm" onClick={readAll}><CheckCheck aria-hidden />Marcar todas como lidas</button>}
          </div>
          <div className="notif-tabs" role="tablist" aria-label="Filtro">
            <button type="button" role="tab" aria-selected={only === 'all'} className={only === 'all' ? 'on' : ''} onClick={() => setOnly('all')}>Todas</button>
            <button type="button" role="tab" aria-selected={only === 'unread'} className={only === 'unread' ? 'on' : ''} onClick={() => setOnly('unread')}>
              Não lidas{unread > 0 && <span className="notif-pill">{unread}</span>}
            </button>
          </div>

          <div className="notif-list">
            {q.isLoading ? <p className="notif-empty">Carregando…</p> : !shown.length ? (
              <div className="notif-empty">
                <Bell aria-hidden />
                <b>{only === 'unread' ? 'Tudo em dia' : 'Nenhuma notificação'}</b>
                <span>{only === 'unread' ? 'Você não tem avisos pendentes.' : 'Tarefas, comentários e prazos aparecem aqui.'}</span>
              </div>
            ) : shown.map((n) => {
              const k = kindOf(n.kind)
              const g = groupOf(n.created_at)
              const header = g !== lastGroup ? <div className="notif-group" key={`g-${g}`}>{g}</div> : null
              lastGroup = g
              return [header, (
                <div key={n.id} className={`notif-item ${n.read_at ? '' : 'unread'}`}>
                  <button type="button" className="notif-main" onClick={() => openItem(n)}>
                    <span className="notif-ico" style={{ color: k.tone, background: `color-mix(in srgb, ${k.tone} 14%, transparent)` }}><k.icon aria-hidden /></span>
                    <span className="notif-text">
                      <span className="notif-title">{n.title}</span>
                      {n.body && <span className="notif-body">{n.body}</span>}
                      <span className="notif-meta">{k.label} · <time dateTime={n.created_at}>{when(n.created_at)}</time></span>
                    </span>
                    {!n.read_at && <span className="notif-dot" aria-label="Não lida" />}
                  </button>
                  <button type="button" className="notif-x" onClick={() => dismiss(n)} aria-label={`Dispensar: ${n.title}`} title="Dispensar"><X aria-hidden /></button>
                </div>
              )]
            })}
          </div>

          {perm === 'default' && (
            <div className="notif-foot">
              <span>Receba alertas mesmo com o Na.Nu em segundo plano</span>
              <button type="button" className="btn sm" onClick={enableAlerts}><BellRing aria-hidden />Ativar</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
