import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isDemo = import.meta.env.VITE_DEMO === '1'
export const isConfigured = Boolean(url && key)

// "Lembrar meu acesso": ligado → sessão no localStorage (sobrevive ao fechar
// o navegador); desligado → sessionStorage (encerra ao fechar a aba).
const REMEMBER_KEY = 'nanu.remember'
export const getRemember = () => {
  try { return localStorage.getItem(REMEMBER_KEY) !== '0' } catch { return true }
}
export const setRemember = (v: boolean) => {
  try { localStorage.setItem(REMEMBER_KEY, v ? '1' : '0') } catch { /* navegação privada */ }
}

const storage = {
  getItem(k: string) {
    try { return localStorage.getItem(k) ?? sessionStorage.getItem(k) } catch { return null }
  },
  setItem(k: string, v: string) {
    try {
      if (getRemember()) { localStorage.setItem(k, v); sessionStorage.removeItem(k) }
      else { sessionStorage.setItem(k, v); localStorage.removeItem(k) }
    } catch { /* ignora */ }
  },
  removeItem(k: string) {
    try { localStorage.removeItem(k); sessionStorage.removeItem(k) } catch { /* ignora */ }
  },
}

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost', key ?? 'anon', {
  auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
