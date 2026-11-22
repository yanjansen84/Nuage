import { useState, type FormEvent } from 'react'
import logoBranco from '../assets/logo-nanu-branco.png'
import { getRemember, setRemember, supabase } from '../lib/supabase'
import { IconEye, IconEyeOff, IconLock, IconMail } from '../components/icons'
import { useAuth } from '../lib/auth'
import { maskEmail } from '../ui/kit'
import '../styles/login.css'

const traduz = (m: string) =>
  /invalid login credentials/i.test(m) ? 'E-mail ou senha incorretos'
  : /email not confirmed/i.test(m) ? 'Confirme seu e-mail pelo link enviado antes de entrar'
  : /rate limit|too many/i.test(m) ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  : 'Não foi possível entrar. Verifique a conexão e tente de novo.'

export default function Login() {
  const { demo } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRem] = useState(getRemember)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (demo) return demo.signIn()
    if (!email.trim() || !password) return setMsg({ text: 'Informe e-mail e senha', err: true })
    setBusy(true); setMsg(null)
    setRemember(remember)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setMsg({ text: traduz(error.message), err: true })
  }

  async function forgot() {
    if (!email.trim()) return setMsg({ text: 'Digite seu e-mail acima para receber o link', err: true })
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    })
    setBusy(false)
    setMsg(error
      ? { text: 'Não foi possível enviar o link agora. Tente de novo em instantes.', err: true }
      : { text: 'Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha' })
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <img className="auth-logo" src={logoBranco} alt="Na.Nu" width={1200} height={309} />
        <h1>Bem-vindo<em>(a)</em>!</h1>
        <p className="sub">Acesse sua conta para continuar</p>
        {demo && <p className="demo-hint">Modo demonstração · toque em Entrar para ver o sistema</p>}

        <form onSubmit={submit} noValidate>
          <label className="pill">
            <IconMail />
            <span className="sr-only">E-mail</span>
            <input type="email" placeholder="E-mail" autoComplete="username" inputMode="email"
              value={email} onChange={(e) => setEmail(maskEmail(e.target.value))} required />
          </label>
          <label className="pill">
            <IconLock />
            <span className="sr-only">Senha</span>
            <input type={show ? 'text' : 'password'} placeholder="Senha" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="eye" onClick={() => setShow(!show)}
              aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
              {show ? <IconEye /> : <IconEyeOff />}
            </button>
          </label>

          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRem(e.target.checked)} />
            Lembrar meu acesso
          </label>

          <button className="go" type="submit" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <button type="button" className="link" onClick={forgot} disabled={busy}>Esqueci minha senha</button>
          <p className={`msg ${msg?.err ? 'err' : ''}`} role="status" aria-live="polite">{msg?.text}</p>
        </form>
      </div>
    </div>
  )
}
