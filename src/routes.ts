import type { LucideIcon } from 'lucide-react'
import { Briefcase, CalendarDays, Clapperboard, FileText, House, KanbanSquare, Settings, Users, Wallet } from 'lucide-react'
import type { ModuleKey } from './lib/types'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  module: ModuleKey
  /** módulo alternativo que também dá acesso ao item */
  or?: ModuleKey
  section: string
}

/** Ordem das seções do menu. */
export const SECTIONS = ['Visão geral', 'Relacionamento', 'Operação', 'Gestão'] as const

// Módulos da Fase 1. Produção e Estratégia entram na Fase 2.
export const NAV: NavItem[] = [
  { path: '/', label: 'Início', icon: House, module: 'dashboard', section: 'Visão geral' },
  { path: '/comercial', label: 'Comercial', icon: Briefcase, module: 'crm', section: 'Relacionamento' },
  { path: '/clientes', label: 'Clientes', icon: Users, module: 'clientes', section: 'Relacionamento' },
  { path: '/contratos', label: 'Contratos', icon: FileText, module: 'contratos', section: 'Relacionamento' },
  { path: '/financeiro', label: 'Financeiro', icon: Wallet, module: 'financeiro', section: 'Gestão' },
  { path: '/projetos', label: 'Projetos', icon: KanbanSquare, module: 'projetos', section: 'Operação' },
  { path: '/conteudo', label: 'Conteúdo', icon: Clapperboard, module: 'producao', section: 'Operação' },
  { path: '/agenda', label: 'Agenda', icon: CalendarDays, module: 'dashboard', section: 'Visão geral' },
  { path: '/configuracoes', label: 'Configurações', icon: Settings, module: 'configuracoes', or: 'equipe', section: 'Gestão' },
]
