import { LogOut, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import logoBranco from '../assets/logo-nanu-branco.png'
import { useAuth } from '../lib/auth'
import { NAV, SECTIONS } from '../routes'
import { resetDemo } from '../data/demoDb'
import { useTheme } from '../lib/theme'
import { useTable } from '../data/hooks'

/**
 * Layout responsivo (definido no CSS):
 *  - desktop (≥ 1024px): menu lateral fixo
 *  - tablet (640–1023px): menu no topo, em linha própria
 *  - celular (< 640px): botão hambúrguer que abre uma gaveta
 */
export default function AppShell() {
  const { profile, roleName, can, signOut, demo } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const demoRolesQ = useTable('roles', { order: { column: 'sort' }, enabled: !!demo })
  const items = NAV.filter((n) => can(n.module) || (n.or && can(n.or)))
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // troca de página: volta ao topo e fecha a gaveta
  useEffect(() => { window.scrollTo(0, 0); setOpen(false) }, [pathname])

  // gaveta aberta: trava o scroll, Esc fecha, foco no primeiro item
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerRef.current?.querySelector<HTMLElement>('a, button, select')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus() }
    }
    const mq = window.matchMedia('(min-width: 640px)')
    const onResize = () => { if (mq.matches) setOpen(false) }
    document.addEventListener('keydown', onKey)
    mq.addEventListener('change', onResize)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onResize)
    }
  }, [open])

  const firstName = profile?.name ?? ''
  const role = roleName ? roleName.split(' / ')[0] : ''

  return (
    <div className={`shell ${open ? 'menu-open' : ''}`}>
      <header className="top">
        <NavLink to="/" className="brand" aria-label="Na.Nu · Início">
          <img src={logoBranco} alt="Na.Nu" width={1200} height={309} />
        </NavLink>

        <button
          ref={toggleRef}
          type="button"
          className="burger"
          aria-expanded={open}
          aria-controls="menu-principal"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setOpen(!open)}
        >
          <span /><span /><span />
        </button>

        <div className="drawer" id="menu-principal" ref={drawerRef}>
          <nav aria-label="Principal">
            {SECTIONS.map((sec) => {
              const list = items.filter((n) => n.section === sec)
              if (!list.length) return null
              const id = `nav-${sec.normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase()}`
              return (
                <div key={sec} className="nav-group" role="group" aria-labelledby={id}>
                  <span className="nav-label" id={id}>{sec}</span>
                  {list.map((n) => (
                    <NavLink key={n.path} to={n.path} end={n.path === '/'}><n.icon aria-hidden />{n.label}</NavLink>
                  ))}
                </div>
              )
            })}
          </nav>
          <div className="me">
            <span className="who">
              <b>{firstName}</b>
              {role && <small>{role}</small>}
            </span>
            <span className="me-actions">
              <button type="button" className="theme-btn" onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
                title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
                {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
              </button>
              <button type="button" onClick={signOut}><LogOut aria-hidden />Sair</button>
            </span>
          </div>
        </div>
      </header>

      <div className="backdrop" aria-hidden="true" onClick={() => setOpen(false)} />

      <div className="content">
        <div className="strip" />
        {demo && (
          <div className="demo-bar" role="note">
            <span><b>Modo demonstração</b> · dados de exemplo, nada é salvo</span>
            <button type="button" className="btn sm" onClick={() => { resetDemo(); demo.setRole(demo.role) }}>Restaurar dados de exemplo</button>
            <label>
              Ver como
              <select value={demo.role} onChange={(e) => demo.setRole(e.target.value)}>
                {(demoRolesQ.data ?? []).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
