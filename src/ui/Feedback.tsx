import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Modal } from './Modal'

interface FeedbackApi {
  toast: (msg: string, error?: boolean) => void
  confirm: (msg: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>
}
const Ctx = createContext<FeedbackApi | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; error: boolean; key: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const [ask, setAsk] = useState<{ msg: string; label: string; danger: boolean; resolve: (v: boolean) => void } | null>(null)

  const toast = useCallback((msg: string, error = false) => {
    window.clearTimeout(timer.current)
    setT({ msg, error, key: Date.now() })
    timer.current = window.setTimeout(() => setT(null), error ? 5000 : 2600)
  }, [])
  const confirm = useCallback((msg: string, opts?: { confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setAsk({ msg, label: opts?.confirmLabel ?? 'Confirmar', danger: !!opts?.danger, resolve })), [])

  const close = (v: boolean) => { ask?.resolve(v); setAsk(null) }

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      {t && <div key={t.key} className={`toast ${t.error ? 'err' : ''}`} role={t.error ? 'alert' : 'status'}>{t.msg}</div>}
      <Modal open={!!ask} onClose={() => close(false)} size="sm"
        footer={<>
          <button className={`btn ${ask?.danger ? 'danger-fill' : 'primary'}`} onClick={() => close(true)}>{ask?.label}</button>
          <button className="btn" onClick={() => close(false)}>Cancelar</button>
        </>}>
        <p style={{ margin: 0, fontWeight: 600 }}>{ask?.msg}</p>
      </Modal>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeedback() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useFeedback fora do FeedbackProvider')
  return c
}
