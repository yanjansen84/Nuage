import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export const Loading = () => <div className="spinner" role="status" aria-label="Carregando" />

export function Unconfigured() {
  return (
    <div className="state">
      <h1>Configuração pendente</h1>
      <p className="mu">
        Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo <code>.env.local</code>{' '}
        (ou nas variáveis de ambiente da Vercel) e reinicie o app.
      </p>
    </div>
  )
}

export function Pending() {
  const { profile, signOut } = useAuth()
  return (
    <div className="state">
      <h1>Acesso pendente</h1>
      <p className="mu">
        {profile && !profile.active
          ? 'Seu usuário está desativado ou ainda sem cargo definido.'
          : 'Seu usuário ainda não tem perfil.'}{' '}
        Fale com o administrador da Nuage.
      </p>
      <div className="bar" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={signOut}>Sair</button>
      </div>
    </div>
  )
}

export function EmConstrucao({ title }: { title: string }) {
  return (
    <div className="state">
      <h1>{title}</h1>
      <p className="mu">O endereço acessado não existe ou foi movido</p>
      <div className="bar" style={{ justifyContent: 'center' }}><Link className="btn" to="/">Voltar ao início</Link></div>
    </div>
  )
}

export function SemAcesso() {
  return (
    <div className="state">
      <h1>Sem acesso</h1>
      <p className="mu">Seu cargo não tem permissão para este módulo. Se precisar, peça ao administrador.</p>
      <div className="bar" style={{ justifyContent: 'center' }}><Link className="btn" to="/">Voltar ao início</Link></div>
    </div>
  )
}
