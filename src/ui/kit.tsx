/* eslint-disable react-refresh/only-export-components -- utilitários de formatação junto dos componentes base */
import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
export * from './formatters'

// ---------- formatação ----------
export const today = () => new Date().toLocaleDateString('sv-SE')
export const fd = (d: string | null | undefined, fallback = 'sem data') =>
  d ? d.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : fallback
export const fdFull = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')
export const fdt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const money = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE') }
export const addMonths = (d: string, n: number) => { const x = new Date(d + 'T12:00'); x.setMonth(x.getMonth() + n); return x.toLocaleDateString('sv-SE') }
export const initials = (n: string) =>
  n.split(/\s+/).map((w) => w.match(/\p{L}/u)?.[0] ?? '').filter(Boolean).slice(0, 2).join('').toUpperCase()
export const PRIORITY: Record<string, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: '#55555f' }, media: { label: 'Média', color: '#2f80ed' },
  alta: { label: 'Alta', color: '#b97d00' }, urgente: { label: 'Urgente', color: '#c0392b' },
}
/** Converte "" em null para campos opcionais. */
export const nn = (v: string) => (v.trim() === '' ? null : v.trim())
export const num = (v: string) => (v.trim() === '' ? null : Number(v))

// ---------- campos ----------
export function Field({ label, children, hint, full }: { label: string; children: ReactNode; hint?: ReactNode; full?: boolean }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  )
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} />
export function Select({ options, placeholder, ...p }: SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[]; placeholder?: string
}) {
  return (
    <select {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ---------- blocos ----------
export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="mu">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Tag({ color, children, solid = true }: { color?: string | null; children: ReactNode; solid?: boolean }) {
  if (!color) return <span className="tag">{children}</span>
  return <span className="tag" style={solid ? { background: color, color: '#fff' } : { borderColor: color, color }}>{children}</span>
}

export function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="seg" role="group">
      {items.map(([k, l]) => (
        <button key={k} type="button" className={`btn ${value === k ? 'on' : ''}`} aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string; hidden?: boolean; badge?: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.filter((i) => !i.hidden).map((i) => (
        <button key={i.key} role="tab" type="button" aria-selected={value === i.key} className={value === i.key ? 'on' : ''} onClick={() => onChange(i.key)}>
          {i.label}{i.badge !== undefined && <span className="badge-n">{i.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><p className="mu">{children}</p>{action}</div>
}

export function Loading() {
  return <p className="mu" role="status">Carregando…</p>
}

export function Kpi({ value, label, onClick, hint }: { value: ReactNode; label: string; onClick?: () => void; hint?: string }) {
  const C = onClick ? 'button' : 'div'
  return (
    <C className="kpi" onClick={onClick} type={onClick ? 'button' : undefined} title={hint}>
      <strong>{value}</strong>{label}
    </C>
  )
}

export function Progress({ value }: { value: number }) {
  return <div className="prog" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${value}%` }} /></div>
}
