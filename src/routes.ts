import type { LucideIcon } from 'lucide-react'
import { Briefcase, CalendarDays, Clapperboard, Compass, Contact, FileText, House, KanbanSquare, Settings, Users, Wallet } from 'lucide-react'
import type { ModuleKey } from './lib/types'

type Action = 'read' | 'write' | 'delete'
export type Can = (module: ModuleKey, action?: Action) => boolean

/** Quem pode abrir uma tela: o módulo principal ou, opcionalmente, outro módulo com uma ação específica. */
export interface Access {
  module: ModuleKey
  /** módulo alternativo que também dá acesso */
  or?: ModuleKey
  /** ação exigida no módulo alternativo (padrão: leitura) */
  orAction?: Action
}

export interface NavItem extends Access {
  path: string
  label: string
  icon: LucideIcon
  section: string
}

/**
 * Regra única de acesso a uma tela. O menu usa para decidir o que mostrar e as
 * rotas usam para bloquear: assim um item nunca aparece para quem cairia em "sem acesso".
 */
export function canAccess(a: Access, can: Can) {
  return can(a.module) || (!!a.or && can(a.or, a.orAction ?? 'read'))
}

/** Ordem das seções do menu. */
export const SECTIONS = ['Visão geral', 'Relacionamento', 'Operação', 'Gestão'] as const

export const NAV: NavItem[] = [
  { path: '/', label: 'Início', icon: House, module: 'dashboard', section: 'Visão geral' },
  { path: '/agenda', label: 'Agenda', icon: CalendarDays, module: 'dashboard', section: 'Visão geral' },
  { path: '/comercial', label: 'Comercial', icon: Briefcase, module: 'crm', section: 'Relacionamento' },
  { path: '/clientes', label: 'Clientes', icon: Users, module: 'clientes', section: 'Relacionamento' },
  { path: '/contratos', label: 'Contratos', icon: FileText, module: 'contratos', section: 'Relacionamento' },
  { path: '/projetos', label: 'Projetos', icon: KanbanSquare, module: 'projetos', section: 'Operação' },
  { path: '/conteudo', label: 'Conteúdo', icon: Clapperboard, module: 'producao', section: 'Operação' },
  { path: '/estrategia', label: 'Estratégia', icon: Compass, module: 'estrategia', section: 'Operação' },
  { path: '/financeiro', label: 'Financeiro', icon: Wallet, module: 'financeiro', section: 'Gestão' },
  // administradores também entram, para criar usuários mesmo sem o módulo Equipe
  { path: '/equipe', label: 'Equipe', icon: Contact, module: 'equipe', or: 'configuracoes', orAction: 'write', section: 'Gestão' },
  { path: '/configuracoes', label: 'Configurações', icon: Settings, module: 'configuracoes', section: 'Gestão' },
]

/** Acesso de uma rota pelo caminho do menu (para o bloqueio usar exatamente a mesma regra). */
export const accessOf = (path: string): Access => {
  const n = NAV.find((x) => x.path === path)
  if (!n) throw new Error(`Rota sem item de menu: ${path}`)
  return n
}
