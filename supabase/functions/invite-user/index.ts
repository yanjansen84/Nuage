// Na.Nu · Convite de usuário
// Só administradores (Configurações com edição total) podem convidar.
// O cargo é gravado em app_metadata, que apenas o servidor consegue escrever;
// o trigger handle_new_user lê esse cargo ao criar o perfil.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. Quem está chamando é administrador?
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: isAdmin, error: permErr } = await asCaller.rpc('is_admin')
  if (permErr || !isAdmin) return json({ error: 'Apenas administradores podem convidar usuários' }, 403)

  // 2. Dados do convite
  let body: { email?: string; name?: string; role?: string; redirectTo?: string }
  try { body = await req.json() } catch { return json({ error: 'Corpo inválido' }, 400) }
  const email = body.email?.trim().toLowerCase()
  const name = body.name?.trim()
  const role = body.role?.trim()
  if (!email || !name || !role) return json({ error: 'Informe nome, e-mail e cargo' }, 400)

  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: roleRow } = await admin.from('roles').select('key').eq('key', role).maybeSingle()
  if (!roleRow) return json({ error: 'Cargo inexistente' }, 400)

  // 3. Convida (o Supabase envia o e-mail com o link para definir senha)
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: body.redirectTo,
  })
  if (error) return json({ error: error.message }, 400)

  // 4. Cargo em app_metadata + garante o perfil com o cargo certo
  await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { role } })
  await admin.from('profiles').update({ role, name, active: true }).eq('id', data.user.id)

  return json({ id: data.user.id })
})
