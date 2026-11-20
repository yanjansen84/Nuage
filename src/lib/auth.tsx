import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, isDemo, supabase } from './supabase'
import { useQueryClient } from '@tanstack/react-query'
import { demoProfile } from './demo'
import { demoPermissionsList, demoRoles, setDemoRole as demoDbSetRole } from '../data/demoDb'
import type { ModuleKey, Permission, Profile } from './types'

interface DemoControls {
  role: string
  setRole: (role: string) => void
  signIn: () => void
}

type Status = 'loading' | 'unconfigured' | 'signed-out' | 'pending' | 'ready'

interface AuthState {
  status: Status
  session: Session | null
  profile: Profile | null
  roleName: string | null
  /** true quando a pessoa chegou por link de convite/recuperação e precisa definir senha */
  needsPassword: boolean
  can: (module: ModuleKey, action?: 'read' | 'write' | 'delete') => boolean
  scope: (module: ModuleKey) => Permission['scope']
  signOut: () => Promise<void>
  reload: () => Promise<void>
  clearNeedsPassword: () => void
  /** só existe no modo demonstração */
  demo: DemoControls | null
}

const AuthContext = createContext<AuthState | null>(null)

const linkType = () => {
  const h = new URLSearchParams(window.location.hash.slice(1))
  return h.get('type')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(isDemo ? 'signed-out' : isConfigured ? 'loading' : 'unconfigured')
  const [demoRole, setDemoRole] = useState('ceo')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roleName, setRoleName] = useState<string | null>(null)
  const [perms, setPerms] = useState<Permission[]>([])
  const qc = useQueryClient()
  const [needsPassword, setNeedsPassword] = useState(() => ['invite', 'recovery'].includes(linkType() ?? ''))

  const load = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) { setProfile(null); setPerms([]); setStatus('signed-out'); return }
    const [{ data: p }, { data: pm }] = await Promise.all([
      supabase.from('profiles').select('id,name,role,link,active').eq('id', s.user.id).maybeSingle(),
      supabase.rpc('my_permissions'),
    ])
    setProfile(p as Profile | null)
    setPerms((pm ?? []) as Permission[])
    if (p?.role) {
      const { data: r } = await supabase.from('roles').select('name').eq('key', p.role).maybeSingle()
      setRoleName(r?.name ?? p.role)
    }
    setStatus(p && p.active && p.role ? 'ready' : 'pending')
  }, [])

  const applyDemo = useCallback((role: string) => {
    setDemoRole(role)
    setProfile(demoProfile(role))
    demoDbSetRole(role)
    setPerms(demoPermissionsList() as Permission[])
    setRoleName(demoRoles().find((r) => r.key === role)?.name ?? role)
    setStatus('ready')
    try { sessionStorage.setItem('nanu.demo', role) } catch { /* ignora */ }
    qc.invalidateQueries()
  }, [qc])

  // demo: continua logado após recarregar a página (só nesta aba)
  useEffect(() => {
    if (!isDemo) return
    let saved: string | null = null
    try { saved = sessionStorage.getItem('nanu.demo') } catch { /* ignora */ }
    if (saved) applyDemo(saved)
  }, [applyDemo])

  useEffect(() => {
    if (isDemo || !isConfigured) return
    supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // adia para fora do callback (recomendação do supabase-js)
        setTimeout(() => load(s), 0)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const byModule = useMemo(() => new Map(perms.map((p) => [p.module, p])), [perms])

  const value = useMemo<AuthState>(() => ({
    status, session, profile, roleName, needsPassword,
    can: (m, action = 'read') => {
      const p = byModule.get(m)
      if (!p || p.scope === 'none') return false
      if (action === 'write') return p.can_write
      if (action === 'delete') return p.can_delete
      return true
    },
    scope: (m) => byModule.get(m)?.scope ?? 'none',
    signOut: async () => {
      if (isDemo) {
        try { sessionStorage.removeItem('nanu.demo') } catch { /* ignora */ }
        setProfile(null); setPerms([]); setStatus('signed-out'); return
      }
      await supabase.auth.signOut()
    },
    reload: async () => {
      if (isDemo) { applyDemo(demoRole); return }
      const { data } = await supabase.auth.getSession(); await load(data.session)
    },
    clearNeedsPassword: () => setNeedsPassword(false),
    demo: isDemo ? { role: demoRole, setRole: applyDemo, signIn: () => applyDemo(demoRole) } : null,
  }), [status, session, profile, roleName, needsPassword, byModule, load, demoRole, applyDemo])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}
