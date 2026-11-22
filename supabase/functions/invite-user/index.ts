// Na.Nu · Convite de usuário
// Só administradores (Configurações com edição total) podem convidar.
// O cargo é gravado em app_metadata, que apenas o servidor consegue escrever;
// o trigger handle_new_user lê esse cargo ao criar o perfil.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

// Origens permitidas: secret ALLOWED_ORIGIN com uma ou mais origens separadas
// por vírgula (ex.: "https://nanu.exemplo.com.br,https://nanu-git-main-equipe.vercel.app").
// Endereços locais (localhost/127.0.0.1) são aceitos para desenvolvimento.
// Sem curingas: "*.vercel.app" aceitaria o app Vercel de qualquer pessoa.
function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s && s !== '*')
}

function isAllowedOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true
    return allowedOrigins().includes(u.origin)
  } catch {
    return false
  }
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  // Origem não permitida: nenhum Access-Control-Allow-Origin (o navegador bloqueia)
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return json(req, { error: 'Método não permitido' }, 405)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. Quem está chamando é administrador?
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: isAdmin, error: permErr } = await asCaller.rpc('is_admin')
  if (permErr || !isAdmin) {
    return json(req, { error: 'Apenas administradores podem convidar usuários' }, 403)
  }

  // 2. Dados do convite
  let body: { email?: string; name?: string; role?: string; redirectTo?: string }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Corpo da requisição inválido' }, 400)
  }

  const email = body.email?.trim().toLowerCase()
  const name = body.name?.trim()
  const role = body.role?.trim()
  if (!email || !name || !role) {
    return json(req, { error: 'Informe nome, e-mail e cargo' }, 400)
  }

  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: roleRow } = await admin.from('roles').select('key').eq('key', role).maybeSingle()
  if (!roleRow) {
    return json(req, { error: 'Cargo informado não existe no sistema' }, 400)
  }

  // Validação segura do redirectTo para evitar Open Redirect
  let safeRedirectTo: string | undefined = undefined
  if (body.redirectTo) {
    try {
      // Mesma lista do CORS. O cabeçalho Origin é definido por quem chama,
      // por isso não serve, sozinho, como prova de que o destino é confiável.
      const parsed = new URL(body.redirectTo)
      if (isAllowedOrigin(parsed.origin)) safeRedirectTo = parsed.toString()
    } catch {
      // Ignora URL inválida e deixa fallback do Supabase
    }
  }

  // 3. Convite por e-mail
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name },
    ...(safeRedirectTo ? { redirectTo: safeRedirectTo } : {}),
  })

  if (error) {
    console.error('Falha no inviteUserByEmail:', error.message)
    const clientMsg = error.message.toLowerCase().includes('already')
      ? 'Este e-mail já está registrado no sistema.'
      : 'Não foi possível enviar o convite. Verifique o e-mail informado.'
    return json(req, { error: clientMsg }, 400)
  }

  // 4. Cargo em app_metadata + sincronização do perfil
  const { error: appErr } = await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { role } })
  if (appErr) {
    console.error('Falha no updateUserById:', appErr.message)
    return json(req, { error: 'Erro ao configurar credenciais do novo usuário' }, 500)
  }

  const { error: profErr } = await admin.from('profiles').update({ role, name, active: true }).eq('id', data.user.id)
  if (profErr) {
    console.error('Falha ao atualizar profiles:', profErr.message)
    return json(req, { error: 'Erro ao inicializar perfil do usuário' }, 500)
  }

  return json(req, { id: data.user.id })
})
