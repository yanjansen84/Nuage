import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { today } from '../ui/kit'

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

interface Props {
  month: Date
  onMonth: (d: Date) => void
  /** Conteúdo de cada dia (etiquetas). Recebe a data AAAA-MM-DD. */
  renderDay: (date: string) => ReactNode
  dayLabel?: (date: string) => string
  onDay: (date: string) => void
  actions?: ReactNode
}

/** Calendário mensal no estilo do protótipo (grade de 7 colunas). */
export function MonthGrid({ month, onMonth, renderDay, dayLabel, onDay, actions }: Props) {
  const y = month.getFullYear(), m = month.getMonth()
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate()
  const td = today()
  const label = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return (
    <>
      <div className="toolbar month-nav">
        <button className="btn icon" aria-label="Mês anterior" onClick={() => onMonth(new Date(y, m - 1, 1))}><ChevronLeft aria-hidden /></button>
        <b className="label">{label.charAt(0).toUpperCase() + label.slice(1)}</b>
        <button className="btn icon" aria-label="Próximo mês" onClick={() => onMonth(new Date(y, m + 1, 1))}><ChevronRight aria-hidden /></button>
        <button className="btn" onClick={() => { const d = new Date(); onMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Hoje</button>
        {actions && <><span className="spacer" />{actions}</>}
      </div>
      <div className="mg" role="grid" aria-label={`Calendário de ${label}`}>
        {WEEK.map((w) => <div key={w} className="h" role="columnheader">{w}</div>)}
        {Array.from({ length: first }, (_, i) => <div key={`b${i}`} className="blank" />)}
        {Array.from({ length: days }, (_, i) => {
          const d = ymd(y, m, i + 1)
          return (
            <button key={d} type="button" className={`day ${d === td ? 'today' : ''} ${d < td ? 'past' : ''}`}
              onClick={() => onDay(d)} aria-label={dayLabel?.(d) ?? d}>
              <b>{i + 1}</b>
              {renderDay(d)}
            </button>
          )
        })}
      </div>
    </>
  )
}
