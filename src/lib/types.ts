export type ModuleKey =
  | 'dashboard' | 'crm' | 'clientes' | 'contratos' | 'financeiro'
  | 'projetos' | 'producao' | 'estrategia' | 'equipe' | 'configuracoes'

export type Scope = 'none' | 'own' | 'all'

export interface Permission {
  module: ModuleKey
  scope: Scope
  can_write: boolean
  can_delete: boolean
}

export interface Profile {
  id: string
  name: string
  role: string | null
  link: 'Efetivo' | 'Estagiário'
  active: boolean
}

export interface Option {
  id: string
  set_key: string
  label: string
  color: string | null
  sort: number
  is_final: boolean
  active: boolean
}
