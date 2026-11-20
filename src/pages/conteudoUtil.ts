import { useOptions } from '../data/hooks'
import type { Content } from '../data/types'
import { today } from '../ui/kit'

/** Status do fluxo editorial + atalhos (próximo, postado). */
export function useContentFlow() {
  const status = useOptions('content_status')
  const posted = status.list.find((s) => s.is_final)
  const next = (id: string | null) => {
    const i = status.list.findIndex((s) => s.id === id)
    return i >= 0 ? status.list[i + 1] : status.list[0]
  }
  const open = status.list.filter((s) => !s.is_final)
  const beforePosted = open[open.length - 1]
  return { status, posted, next, beforePosted }
}

/** Atrasado: não postado e com prazo de produção ou publicação vencidos. */
export const contentLate = (c: Content) => !c.posted_at && (
  (!!c.publish_date && c.publish_date < today()) || (!!c.due_date && c.due_date < today()))
