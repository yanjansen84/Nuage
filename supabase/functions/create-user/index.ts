// Na.Nu · Criação de usuário com senha provisória
// Só administradores (Configurações com edição total) podem criar usuários.
// A senha provisória é gerada AQUI, no servidor, e devolvida uma única vez ao
// administrador. No primeiro acesso a pessoa é obrigada a trocá-la
// (user_metadata.must_change_password → tela DefinirSenha).
// O cargo vai em app_metadata, que apenas o servidor escreve; o trigger
// handle_new_user lê esse cargo ao criar o perfil.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

// Origens permitidas: secret ALLOWED_ORIGIN com uma ou mais origens separadas
// por vírgula (ex.: "https://nanu.exemplo.com.br"). Endereços locais
// (localhost/127.0.0.1) são aceitos para desenvolvimento. Sem curingas.
function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGIN') ?? '')
    .split(',')
    .map((s: string) => s.trim().replace(/\/+$/, ''))
    .filter((s: string) => s && s !== '*')
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

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    // a resposta carrega a senha provisória: nada de cache em lugar nenhum
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

// Senha provisória: 14 caracteres aleatórios (crypto), sem caracteres
// ambíguos (0/O, 1/l/I), com ao menos uma maiúscula, minúscula, número e símbolo.
const SETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!?']
function randomIndex(max: number): number {
  // rejeição para não enviesar a distribuição
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf); while (buf[0] >= limit)
  return buf[0] % max
}
function temporaryPassword(length = 14): string {
  const all = SETS.join('')
  const chars = SETS.map((s) => s[randomIndex(s.length)])
  while (chars.length < length) chars.push(all[randomIndex(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. Quem está chamando é administrador?
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: isAdmin, error: permErr } = await asCaller.rpc('is_admin')
  if (permErr || !isAdmin) return json(req, { error: 'Apenas administradores podem criar usuários' }, 403)

  // 2. Dados do novo usuário
  let body: { email?: string; name?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Corpo da requisição inválido' }, 400)
  }
  const email = body.email?.trim().toLowerCase()
  const name = body.name?.trim()
  const role = body.role?.trim()
  if (!email || !name || !role) return json(req, { error: 'Informe nome, e-mail e cargo' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(req, { error: 'E-mail inválido' }, 400)
  if (name.length > 120) return json(req, { error: 'Nome muito longo' }, 400)

  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: roleRow } = await admin.from('roles').select('key').eq('key', role).maybeSingle()
  if (!roleRow) return json(req, { error: 'Cargo informado não existe no sistema' }, 400)

  // 3. Cria o usuário já confirmado, com cargo e senha provisória
  const password = temporaryPassword()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, must_change_password: true },
    app_metadata: { role },
  })
  if (error || !data?.user) {
    console.error('Falha no createUser:', error?.message)
    const already = /already|exists|registered/i.test(error?.message ?? '')
    return json(req, {
      error: already ? 'Já existe um usuário com este e-mail.' : 'Não foi possível criar o usuário. Verifique os dados informados.',
    }, already ? 409 : 400)
  }

  // 4. O trigger handle_new_user já cria o perfil com o cargo; garante nome/cargo/ativo
  const { error: profErr } = await admin.from('profiles').update({ role, name, active: true }).eq('id', data.user.id)
  if (profErr) {
    console.error('Falha ao atualizar profiles:', profErr.message)
    // não deixa um login órfão sem perfil válido
    await admin.auth.admin.deleteUser(data.user.id)
    return json(req, { error: 'Erro ao inicializar o perfil do usuário' }, 500)
  }

  // A senha vai só nesta resposta (HTTPS) e nunca é registrada em log
  return json(req, { id: data.user.id, email, password })
})
