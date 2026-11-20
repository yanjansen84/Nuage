import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

/** Janela modal nativa (<dialog>): foco preso, Esc fecha. No celular vira folha de baixo. */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // o showModal() foca o primeiro botão (o "fechar"); em formulário, o foco vai para o primeiro campo editável
      const field = d.querySelector<HTMLElement>('.modal-body :is(input:not([type="checkbox"]):not([type="hidden"]), textarea, select):not(:disabled)')
      field?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal ${size}`}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {open && (
        <div className="modal-body">
          {title && (
            <div className="modal-head">
              <h2>{title}</h2>
              <button type="button" className="btn ghost icon x" onClick={onClose} aria-label="Fechar"><X aria-hidden /></button>
            </div>
          )}
          {children}
          {footer && <div className="bar modal-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
