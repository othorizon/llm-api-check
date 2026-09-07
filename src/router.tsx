import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export const ROUTES = ['/', '/models', '/run', '/results', '/docs', '/privacy'] as const
export type RoutePath = (typeof ROUTES)[number]

interface RouterValue {
  path: string
  query: URLSearchParams
  navigate: (to: string, opts?: { replace?: boolean }) => void
}

const Ctx = createContext<RouterValue>({ path: '/', query: new URLSearchParams(), navigate: () => {} })

export const useRouter = () => useContext(Ctx)

function normalize(p: string): string {
  if (!p) return '/'
  const clean = p.replace(/\/+$/, '')
  return clean === '' ? '/' : clean
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({
    path: normalize(window.location.pathname),
    search: window.location.search,
  }))

  useEffect(() => {
    const onPop = () => setLoc({ path: normalize(window.location.pathname), search: window.location.search })
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const url = new URL(to, window.location.origin)
    if (opts?.replace) window.history.replaceState({}, '', url)
    else window.history.pushState({}, '', url)
    setLoc({ path: normalize(url.pathname), search: url.search })
    window.scrollTo({ top: 0 })
  }, [])

  const value = useMemo<RouterValue>(
    () => ({ path: loc.path, query: new URLSearchParams(loc.search), navigate }),
    [loc, navigate],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function Link({
  to, children, className, onClick,
}: { to: string; children: ReactNode; className?: string; onClick?: () => void }) {
  const { navigate } = useRouter()
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        onClick?.()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
