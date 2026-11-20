import { useState, type FormEvent } from 'react'
import logoBranco from '../assets/logo-nanu-branco.png'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { IconLock } from '../components/icons'
import '../styles/login.css'

/** Primeiro acesso por convite ou recuperação de senha. */
export default function DefinirSenha() {
  const { profile, clearNeedsPassword } = useAuth()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (a.length < 8) return setErr('A senha precisa ter pelo menos 8 caracteres')
    if (a !== b) return setErr('As senhas não conferem')
    setBusy(true); setErr('')
    const { error } = await supabase.auth.updateUser({ password: a })
    setBusy(false)
    if (error) return setErr('Não foi possível salvar a senha. O link pode ter expirado; peça um novo.')
    history.replaceState(null, '', window.location.pathname)
    clearNeedsPassword()
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <img className="auth-logo" src={logoBranco} alt="Na.Nu" width={1200} height={309} />
        <h1>Olá{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}!</h1>
        <p className="sub">Crie sua senha para acessar o Na.Nu</p>
        <form onSubmit={submit} noValidate>
          <label className="pill">
            <IconLock /><span className="sr-only">Nova senha</span>
            <input type="password" placeholder="Nova senha" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} />
          </label>
          <label className="pill">
            <IconLock /><span className="sr-only">Repita a senha</span>
            <input type="password" placeholder="Repita a senha" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} />
          </label>
          <button className="go" type="submit" disabled={busy || !a || !b}>{busy ? 'Salvando…' : 'Salvar e entrar'}</button>
          <p className={`msg ${err ? 'err' : ''}`} role="status" aria-live="polite">{err}</p>
        </form>
      </div>
    </div>
  )
}
