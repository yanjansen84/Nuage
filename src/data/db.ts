// Camada de dados única. As páginas usam só `db`; por trás, ou é o Supabase
// (com RLS no banco) ou o modo demonstração (memória, imitando a RLS).
import { isDemo, supabase } from '../lib/supabase'
import type { ClientService, Table, Tables } from './types'
import { demoDb } from './demoDb'

export type Match<T extends Table> = Partial<Tables[T]>
export type Order = { column: string; ascending?: boolean }

export interface NewUserInput { email: string; name: string; role: string }
/** Resultado da criação: a senha provisória só existe aqui (não fica salva em lugar nenhum). */
export interface NewUserResult { id: string; email: string; password: string }

export interface Db {
  list<T extends Table>(table: T, match?: Match<T>, order?: Order, limit?: number): Promise<Tables[T][]>
  /** Uma página de resultados com o total, para tabelas grandes (ex.: auditoria). */
  page<T extends Table>(table: T, opts: { match?: Match<T>; order: Order; from: number; to: number }): Promise<{ rows: Tables[T][]; total: number }>
  insert<T extends Table>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]>
  insertMany<T extends Table>(table: T, rows: Partial<Tables[T]>[]): Promise<void>
  update<T extends Table>(table: T, match: Match<T>, patch: Partial<Tables[T]>): Promise<void>
  upsert<T extends Table>(table: T, row: Partial<Tables[T]>, onConflict: string): Promise<void>
  remove<T extends Table>(table: T, match: Match<T>): Promise<void>
  activateContract(contractId: string, ownerId: string | null): Promise<string>
  clientServices(): Promise<ClientService[]>
  createUser(input: NewUserInput): Promise<NewUserResult>
  /** Gera os lembretes do dia do usuário logado (idempotente). Retorna quantos avisos novos surgiram. */
  refreshNotifications(): Promise<number>
  markAllNotificationsRead(): Promise<void>
  /** Avisa quando chega/muda uma notificação do usuário (tempo real). Retorna a função que cancela. */
  subscribeNotifications(userId: string, onChange: (n: Tables['notifications'] | null) => void): () => void
  currentUserId(): string | null
}

const fail = (e: { message: string } | null) => { if (e) throw new Error(traduzErro(e.message)) }

export function traduzErro(m: string): string {
  if (/row-level security|permission denied|42501/i.test(m)) return 'Você não tem permissão para esta ação.'
  if (/violates foreign key/i.test(m)) return 'Este registro está em uso por outro cadastro e não pode ser removido.'
  if (/duplicate key/i.test(m)) return 'Já existe um registro com esses dados.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Tente de novo.'
  return m
}

let uid: string | null = null
supabase.auth.onAuthStateChange((_e, s) => { uid = s?.user.id ?? null })

const supabaseDb: Db = {
  async list(table, match, order, limit) {
    let q = supabase.from(table).select('*')
    if (match) q = q.match(match as Record<string, unknown>)
    if (order) q = q.order(order.column, { ascending: order.ascending ?? true })
    if (limit) q = q.limit(limit)
    const { data, error } = await q
    fail(error)
    return (data ?? []) as never
  },
  async page(table, { match, order, from, to }) {
    let q = supabase.from(table).select('*', { count: 'exact' })
    if (match) q = q.match(match as Record<string, unknown>)
    const { data, error, count } = await q.order(order.column, { ascending: order.ascending ?? true }).range(from, to)
    fail(error)
    return { rows: (data ?? []) as never, total: count ?? 0 }
  },
  async insert(table, row) {
    const { data, error } = await supabase.from(table).insert(row as never).select().single()
    fail(error)
    return data as never
  },
  async insertMany(table, rows) {
    if (!rows.length) return
    const { error } = await supabase.from(table).insert(rows as never)
    fail(error)
  },
  async update(table, match, patch) {
    const { error } = await supabase.from(table).update(patch as never).match(match as Record<string, unknown>)
    fail(error)
  },
  async upsert(table, row, onConflict) {
    const { error } = await supabase.from(table).upsert(row as never, { onConflict })
    fail(error)
  },
  async remove(table, match) {
    const { error } = await supabase.from(table).delete().match(match as Record<string, unknown>)
    fail(error)
  },
  async activateContract(contractId, ownerId) {
    const { data, error } = await supabase.rpc('activate_contract', { p_contract: contractId, p_owner: ownerId })
    fail(error)
    return data as string
  },
  async clientServices() {
    const { data, error } = await supabase.rpc('client_services')
    fail(error)
    return (data ?? []) as ClientService[]
  },
  async createUser(input) {
    const { data, error } = await supabase.functions.invoke('create-user', { body: input })
    if (error) {
      const ctx = (error as { context?: Response }).context
      const body = ctx ? await ctx.json().catch(() => null) : null
      throw new Error(body?.error ?? 'Não foi possível criar o usuário.')
    }
    if (data?.error) throw new Error(data.error)
    return data as NewUserResult
  },
  async refreshNotifications() {
    const { data, error } = await supabase.rpc('generate_my_notifications')
    fail(error)
    return (data as number | null) ?? 0
  },
  async markAllNotificationsRead() {
    const { error } = await supabase.rpc('mark_all_notifications_read')
    fail(error)
  },
  subscribeNotifications(userId, onChange) {
    const ch = supabase
      .channel(`notificacoes:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (p) => onChange(p.eventType === 'INSERT' ? (p.new as Tables['notifications']) : null))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  },
  currentUserId: () => uid,
}

export const db: Db = isDemo ? demoDb : supabaseDb
