import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { useAuth } from './lib/auth'
import { accessOf, canAccess, type Access } from './routes'
import DefinirSenha from './pages/DefinirSenha'
import Login from './pages/Login'
import { EmConstrucao, Loading, Pending, SemAcesso, Unconfigured } from './pages/States'

// cada módulo é carregado só quando aberto
const Inicio = lazy(() => import('./pages/Inicio'))
const Comercial = lazy(() => import('./pages/Comercial'))
const Clientes = lazy(() => import('./pages/Clientes'))
const ClienteDetalhe = lazy(() => import('./pages/Clientes').then((m) => ({ default: m.ClienteDetalhe })))
const Contratos = lazy(() => import('./pages/Contratos'))
const ContratoEditor = lazy(() => import('./pages/Contratos').then((m) => ({ default: m.ContratoEditor })))
const Financeiro = lazy(() => import('./pages/Financeiro'))
const Projetos = lazy(() => import('./pages/Projetos'))
const Agenda = lazy(() => import('./pages/Agenda'))
const Conteudo = lazy(() => import('./pages/Conteudo'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))
const Equipe = lazy(() => import('./pages/Equipe'))

/** Bloqueia a rota com a mesma regra que decide se o item aparece no menu. */
function Guard({ to, children }: { to: string | Access; children: ReactNode }) {
  const { can } = useAuth()
  const access = typeof to === 'string' ? accessOf(to) : to
  return canAccess(access, can) ? <Suspense fallback={<Loading />}>{children}</Suspense> : <SemAcesso />
}

export default function App() {
  const { status, needsPassword } = useAuth()

  if (status === 'unconfigured') return <Unconfigured />
  if (status === 'loading') return <Loading />
  if (status === 'signed-out') return <Login />
  if (needsPassword) return <DefinirSenha />
  if (status === 'pending') return <Pending />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Guard to="/"><Inicio /></Guard>} />
        <Route path="comercial" element={<Guard to="/comercial"><Comercial /></Guard>} />
        <Route path="clientes" element={<Guard to="/clientes"><Clientes /></Guard>} />
        <Route path="clientes/:id" element={<Guard to="/clientes"><ClienteDetalhe /></Guard>} />
        <Route path="contratos" element={<Guard to="/contratos"><Contratos /></Guard>} />
        <Route path="contratos/novo" element={<Guard to="/contratos"><ContratoEditor /></Guard>} />
        <Route path="contratos/:id" element={<Guard to="/contratos"><ContratoEditor /></Guard>} />
        <Route path="financeiro" element={<Guard to="/financeiro"><Financeiro /></Guard>} />
        <Route path="projetos" element={<Guard to="/projetos"><Projetos /></Guard>} />
        <Route path="conteudo" element={<Guard to="/conteudo"><Conteudo /></Guard>} />
        <Route path="agenda" element={<Guard to="/agenda"><Agenda /></Guard>} />
        <Route path="equipe" element={<Guard to="/equipe"><Equipe /></Guard>} />
        <Route path="configuracoes" element={<Guard to="/configuracoes"><Configuracoes /></Guard>} />
        <Route path="*" element={<EmConstrucao title="Página não encontrada" />} />
      </Route>
    </Routes>
  )
}
