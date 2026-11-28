// Espelho das tabelas do Supabase (supabase/migrations).
export type Priority = 'baixa' | 'media' | 'alta' | 'urgente'
export type BillingType = 'recorrente' | 'pacote' | 'avulso'

export interface Row { id: string }

export interface ProfileRow extends Row {
  name: string
  role: string | null
  link: 'Efetivo' | 'Estagiário'
  active: boolean
  weekly_capacity_hours: number | null
}
export interface ProfileDetails extends Row {
  phone: string | null; email: string | null; insta: string | null; x: string | null
}
export interface RoleRow { key: string; name: string; sort: number }
export interface ModuleRow { key: string; name: string; sort: number }
export interface RolePermission { role: string; module: string; scope: 'none' | 'own' | 'all'; can_write: boolean; can_delete: boolean }
export interface UserPermission { user_id: string; module: string; scope: 'none' | 'own' | 'all' | null; can_write: boolean | null; can_delete: boolean | null }

export interface OptionRow extends Row {
  set_key: string; label: string; color: string | null; sort: number; is_final: boolean; active: boolean
}

export interface Service extends Row {
  code: string | null; name: string; description: string | null; category: string | null
  billing_type: BillingType; delivery_days: number | null; delivery_note: string | null
  min_months: number | null; deliverables: string[]; notes: string | null; active: boolean; sort: number
}
export interface ServiceOffer extends Row { service_id: string; label: string; quantity: number | null; active: boolean; sort: number }
export interface OfferPrice { offer_id: string; price: number }
export interface ChecklistTemplate extends Row { service_id: string | null; name: string; active: boolean }
export interface ChecklistTemplateItem extends Row { template_id: string; title: string; due_offset_days: number | null; sort: number }

export interface Client extends Row {
  name: string; segment: string | null; contact_name: string | null; phone: string | null; email: string | null
  legal_name: string | null; document: string | null; address: string | null
  legal_rep_name: string | null; legal_rep_cpf: string | null
  status_id: string | null; notes: string | null; created_by: string | null; created_at: string
}
export interface Lead extends Row {
  name: string; company: string | null; phone: string | null; email: string | null; segment: string | null
  origin: string | null; service_id: string | null; owner_id: string | null; stage_id: string | null
  next_action: string | null; follow_up: string | null; notes: string | null; client_id: string | null
  created_by: string | null; created_at: string
}
export interface LeadValue { lead_id: string; estimated_value: number | null }

export type ContractTemplateKey = 'agencia' | 'social_media' | 'studio'
export type ContractStatus = 'rascunho' | 'ativo' | 'encerrado' | 'cancelado'
export interface Contract extends Row {
  client_id: string; lead_id: string | null; status: ContractStatus
  start_date: string | null; end_date: string | null; min_months: number | null
  renewal: 'automatica' | 'manual'; notice_days: number | null; due_day: number | null
  payment_method: 'pix' | 'boleto' | 'cartao' | null; installments: number | null
  payment_terms: string | null; notes: string | null
  templates: ContractTemplateKey[]; platforms: string | null
  publisher: 'contratada' | 'contratante' | null; video_quantity: number | null
  shooting_location: string | null; first_payment_date: string | null
  billing_periodicity: string | null; portfolio_authorized: boolean; forum_city: string
  activated_at: string | null; created_at: string
}
export interface ContractItem extends Row {
  contract_id: string; service_id: string; offer_id: string | null; description: string | null
  quantity: number; list_price: number | null; negotiated_price: number; billing_type: BillingType
}
export type PaymentStatus = 'previsto' | 'pago' | 'atrasado' | 'cancelado'
export interface Payment extends Row {
  contract_id: string; due_date: string; amount: number; status: PaymentStatus
  paid_at: string | null; method: 'pix' | 'boleto' | 'cartao' | null; notes: string | null
}

export type BillStatus = 'aberto' | 'pago' | 'cancelado'
export type BillMethod = 'pix' | 'boleto' | 'cartao' | 'transferencia' | 'debito' | 'dinheiro'
/** Conta a pagar (despesa da agência). "Atrasada" = aberta com vencimento passado (não é gravado). */
export interface Bill extends Row {
  description: string; supplier: string | null; category_id: string | null; amount: number; due_date: string
  status: BillStatus; paid_at: string | null; method: BillMethod | null; notes: string | null
  series_id: string | null; installment: number | null; installments: number | null
  created_by: string | null; created_at: string
}

export interface Project extends Row {
  client_id: string | null; service_id: string | null; contract_id: string | null; name: string
  description: string | null; objective: string | null; owner_id: string | null; status_id: string | null
  priority: Priority; start_date: string | null; due_date: string | null; created_by: string | null
}
export interface ProjectMember { project_id: string; profile_id: string }
export interface Task extends Row {
  project_id: string | null; client_id: string | null; parent_id: string | null; title: string
  description: string | null; owner_id: string | null; status_id: string | null; priority: Priority
  start_date: string | null; due_date: string | null; effort_hours: number | null
  recurrence: { freq: 'daily' | 'weekly' | 'monthly' } | null; recurrence_source_id: string | null
  done_at: string | null; created_by: string | null; created_at: string
}
export interface TaskCollaborator { task_id: string; profile_id: string }
export interface TaskDependency { task_id: string; depends_on: string }
export interface TaskChecklistItem extends Row { task_id: string; title: string; done: boolean; sort: number }
export interface Comment extends Row {
  entity: 'task' | 'project' | 'lead' | 'client' | 'content' | 'strategy'; entity_id: string; author_id: string; body: string
  resolved: boolean; created_at: string
}
export interface EventRow extends Row {
  title: string; date: string; time: string | null; profile_id: string | null; client_id: string | null
  notes: string | null; created_by: string | null; created_at: string
}
export interface Content extends Row {
  title: string; client_id: string | null; project_id: string | null; format_id: string | null; status_id: string | null
  channel: string | null; objective: string | null; briefing: string | null; caption: string | null; links: string | null
  owner_id: string | null; reviewer_id: string | null; due_date: string | null; publish_date: string | null; publish_time: string | null
  posted_at: string | null; posted_url: string | null; created_by: string | null; created_at: string
}
export interface ContentHistory { id: number; content_id: string; at: string; actor: string | null; from_label: string | null; to_label: string | null }
export interface ContentApprovalLink extends Row {
  content_id: string; token: string; expires_at: string; revoked_at: string | null; created_by: string | null; created_at: string
}
export interface ContentApproval extends Row {
  link_id: string; content_id: string; decision: 'aprovado' | 'ajustes'; reviewer_name: string; comment: string | null; created_at: string
}
export interface PublicApprovalInfo {
  content_id: string; title: string; client_name: string | null; format_label: string | null
  status_label: string | null; status_color: string | null; channel: string | null; objective: string | null
  caption: string | null; links: string | null; publish_date: string | null; publish_time: string | null
  expires_at: string; decision: 'aprovado' | 'ajustes' | null; reviewer_name: string | null
  feedback: string | null; decided_at: string | null
}
export interface ClientBriefing {
  client_id: string; audience: string | null; tone_of_voice: string | null; differentials: string | null
  competitors: string | null; references_links: string | null; restrictions: string | null; notes: string | null
  updated_by: string | null; updated_at: string
}
export interface Campaign extends Row {
  client_id: string; name: string; channel: string | null; objective: string | null; status_id: string | null
  start_date: string | null; end_date: string | null; owner_id: string | null; links: string | null
  notes: string | null; created_by: string | null; created_at: string
}
export interface CampaignBudget { campaign_id: string; monthly_budget: number | null; spent_amount: number | null }
export type StrategyStatus = 'rascunho' | 'ativo' | 'arquivado'
export interface Strategy extends Row {
  client_id: string | null; title: string; status: StrategyStatus; start_date: string | null; end_date: string | null
  positioning: string | null; personas: string | null; pillars: string[]; channels: string | null
  goals: string | null; kpis: string | null; notes: string | null; owner_id: string | null
  created_by: string | null; created_at: string
}
export interface PushSubscriptionRow extends Row {
  user_id: string; endpoint: string; p256dh: string; auth: string; created_at: string
}
/** Aviso para uma pessoa. Criado só pelo banco (triggers e lembretes); o app lê, marca como lida e dispensa. */
export interface NotificationRow extends Row {
  user_id: string; kind: string; title: string; body: string | null; link: string | null
  source: string | null; read_at: string | null; created_at: string
}
export interface AuditEntry {
  id: number; at: string; actor: string | null; action: string; table_name: string
  record_id: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null
}
export interface ClientService { client_id: string; service_id: string; service_name: string; offer_label: string | null; contract_status: string }

export interface Tables {
  profiles: ProfileRow
  profile_details: ProfileDetails
  roles: RoleRow
  modules: ModuleRow
  role_permissions: RolePermission
  user_permissions: UserPermission
  options: OptionRow
  services: Service
  service_offers: ServiceOffer
  offer_prices: OfferPrice
  checklist_templates: ChecklistTemplate
  checklist_template_items: ChecklistTemplateItem
  clients: Client
  client_briefings: ClientBriefing
  campaigns: Campaign
  campaign_budgets: CampaignBudget
  strategies: Strategy
  leads: Lead
  lead_values: LeadValue
  contracts: Contract
  contract_items: ContractItem
  payments: Payment
  bills: Bill
  projects: Project
  project_members: ProjectMember
  tasks: Task
  task_collaborators: TaskCollaborator
  task_dependencies: TaskDependency
  task_checklist: TaskChecklistItem
  comments: Comment
  events: EventRow
  contents: Content
  content_history: ContentHistory
  content_approval_links: ContentApprovalLink
  content_approvals: ContentApproval
  push_subscriptions: PushSubscriptionRow
  audit_log: AuditEntry
  notifications: NotificationRow
}
export type Table = keyof Tables
