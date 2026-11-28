// Na.Nu · Envio de Web Push em segundo plano (PWA)
// Chamada via Database Webhook (INSERT em public.notifications) ou manualmente
// usando o cabeçalho Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// (ou x-webhook-secret com PUSH_WEBHOOK_SECRET).
// Requer secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  const hookHeader = req.headers.get('x-webhook-secret') ?? ''

  const authorized = (service && authHeader === `Bearer ${service}`) || (webhookSecret && hookHeader === webhookSecret)
  if (!authorized) return new Response('Unauthorized', { status: 401 })

  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@nuage.app'
  if (!pub || !priv) return new Response(JSON.stringify({ skipped: 'VAPID keys not configured' }), { status: 200 })

  webpush.setVapidDetails(subject, pub, priv)

  let body: { record?: { id?: string; user_id?: string; title?: string; body?: string | null; link?: string | null }; user_id?: string; title?: string; body?: string | null; link?: string | null }
  try { body = await req.json() } catch { return new Response('Bad Request', { status: 400 }) }

  const n = body.record ?? body
  if (!n.user_id || !n.title) return new Response(JSON.stringify({ skipped: 'missing user_id or title' }), { status: 200 })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, service, { auth: { persistSession: false } })
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id)
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

  const payload = JSON.stringify({ title: n.title, body: n.body ?? null, link: n.link ?? '/', tag: n.id ?? undefined })
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})
