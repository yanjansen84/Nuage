import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db, type Match, type Order } from './db'
import type { OptionRow, Table, Tables } from './types'
import { useFeedback } from '../ui/Feedback'

/** Lê uma tabela (respeitando as permissões do usuário). */
export function useTable<T extends Table>(table: T, opts: { match?: Match<T>; order?: Order; enabled?: boolean; limit?: number } = {}) {
  return useQuery({
    queryKey: ['t', table, opts.match ?? null, opts.order ?? null, opts.limit ?? null],
    queryFn: () => db.list(table, opts.match, opts.order, opts.limit),
    enabled: opts.enabled ?? true,
  })
}

/**
 * Executa uma escrita, mostra o resultado e atualiza as telas.
 * Uso: const run = useRun(); await run(() => db.insert(...), 'Salvo')
 */
export function useRun() {
  const qc = useQueryClient()
  const { toast } = useFeedback()
  const m = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn() })
  // Retorna o resultado, `true` quando a operação não devolve nada, ou `undefined` se falhou.
  return useCallback(async <R,>(fn: () => Promise<R>, ok?: string): Promise<NonNullable<R> | true | undefined> => {
    try {
      const r = await m.mutateAsync(fn) as R
      await qc.invalidateQueries()
      if (ok) toast(ok)
      return r ?? true
    } catch (e) {
      toast((e as Error).message || 'Não foi possível concluir.', true)
      return undefined
    }
  }, [m, qc, toast])
}

/** Opções editáveis (etapas, status...) de um conjunto, já ordenadas. */
export function useOptions(setKey: string, includeInactive = false) {
  const q = useTable('options', { match: { set_key: setKey }, order: { column: 'sort' } })
  const list = (q.data ?? []).filter((o) => includeInactive || o.active)
  const byId = (id: string | null | undefined): OptionRow | undefined => q.data?.find((o) => o.id === id)
  const byLabel = (label: string) => q.data?.find((o) => o.label === label)
  return { ...q, list, byId, byLabel }
}

/** Pessoas ativas da equipe (nome visível a todos). */
export function usePeople() {
  const q = useTable('profiles', { order: { column: 'name' } })
  const active = (q.data ?? []).filter((p) => p.active)
  const name = (id: string | null | undefined) => q.data?.find((p) => p.id === id)?.name ?? ''
  return { ...q, active, name }
}

export function useLookup<T extends Table>(table: T) {
  const q = useTable(table)
  const get = (id: string | null | undefined) => (q.data as (Tables[T] & { id?: string })[] | undefined)?.find((r) => r.id === id)
  return { ...q, get }
}

/** Serviços ativos de cada cliente (sem valores). */
export function useClientServices() {
  return useQuery({ queryKey: ['t', 'client_services'], queryFn: () => db.clientServices() })
}

/**
 * Abre um registro vindo de link (ex.: notificação → /projetos?tarefa=<id>).
 * Quando a lista carrega, chama `open` com o item e tira o parâmetro da URL,
 * para não reabrir ao navegar. Se o item não existir ou não for visível, só limpa.
 */
export function useOpenFromUrl<T extends { id: string }>(param: string, rows: T[] | undefined, open: (row: T) => void) {
  const [sp, setSp] = useSearchParams()
  const id = sp.get(param)
  useEffect(() => {
    if (!id || !rows) return
    const row = rows.find((r) => r.id === id)
    if (row) open(row)
    const next = new URLSearchParams(sp)
    next.delete(param)
    setSp(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rows])
}
