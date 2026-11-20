import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page: number            // começa em 1
  pageSize: number
  total: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
  sizes?: number[]
}

/** Paginação com seletor de itens por página ao lado. */
export function Pagination({ page, pageSize, total, onPage, onPageSize, sizes = [10, 25, 50, 100] }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(total, page * pageSize)

  // até 5 números visíveis, centrados na página atual
  const start = Math.max(1, Math.min(page - 2, pages - 4))
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i)

  return (
    <nav className="pager" aria-label="Paginação">
      <span className="pager-info">{from}–{to} de {total}</span>
      <div className="pager-pages">
        <button className="btn sm icon" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior"><ChevronLeft aria-hidden /></button>
        {nums.map((n) => (
          <button key={n} className={`btn sm ${n === page ? 'on' : 'ghost'}`} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} aria-label={`Página ${n}`}>{n}</button>
        ))}
        <button className="btn sm icon" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Próxima página"><ChevronRight aria-hidden /></button>
      </div>
      <label className="pager-size">
        Itens por página
        <select value={pageSize} onChange={(e) => { onPageSize(Number(e.target.value)); onPage(1) }}>
          {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
    </nav>
  )
}
