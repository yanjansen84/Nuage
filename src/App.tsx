import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { useAuth } from './lib/auth'
import type { ModuleKey } from './lib/types'
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

function Guard({ module, or, children }: { module: ModuleKey; or?: ModuleKey; children: ReactNode }) {
  const { can } = useAuth()
  return can(module) || (or && can(or)) ? <Suspense fallback={<Loading />}>{children}</Suspense> : <SemAcesso />
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
        <Route index element={<Guard module="dashboard"><Inicio /></Guard>} />
        <Route path="comercial" element={<Guard module="crm"><Comercial /></Guard>} />
        <Route path="clientes" element={<Guard module="clientes"><Clientes /></Guard>} />
        <Route path="clientes/:id" element={<Guard module="clientes"><ClienteDetalhe /></Guard>} />
        <Route path="contratos" element={<Guard module="contratos"><Contratos /></Guard>} />
        <Route path="contratos/novo" element={<Guard module="contratos"><ContratoEditor /></Guard>} />
        <Route path="contratos/:id" element={<Guard module="contratos"><ContratoEditor /></Guard>} />
        <Route path="financeiro" element={<Guard module="financeiro"><Financeiro /></Guard>} />
        <Route path="projetos" element={<Guard module="projetos"><Projetos /></Guard>} />
        <Route path="conteudo" element={<Guard module="producao"><Conteudo /></Guard>} />
        <Route path="agenda" element={<Guard module="dashboard"><Agenda /></Guard>} />
        <Route path="equipe" element={<Navigate to="/configuracoes?aba=equipe" replace />} />
        <Route path="configuracoes" element={<Guard module="configuracoes" or="equipe"><Configuracoes /></Guard>} />
        <Route path="*" element={<EmConstrucao title="Página não encontrada" />} />
      </Route>
    </Routes>
  )
}
