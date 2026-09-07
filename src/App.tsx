import { useEffect } from 'react'
import { Link, RouterProvider, useRouter } from './router'
import { RunProvider, useRun } from './RunContext'
import { ToastHost } from './components/ui'
import { Icon, type IconName } from './components/icons'
import { actions, useStore } from './lib/store'
import { classNames } from './lib/util'
import Overview from './pages/Overview'
import Models from './pages/Models'
import RunPage from './pages/Run'
import Results from './pages/Results'
import Docs from './pages/Docs'
import Privacy from './pages/Privacy'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '概览', icon: 'gauge' },
  { to: '/models', label: '模型与服务商', icon: 'cpu' },
  { to: '/run', label: '发起测试', icon: 'play' },
  { to: '/results', label: '测试结果', icon: 'chart' },
  { to: '/docs', label: '测试项说明', icon: 'book' },
  { to: '/privacy', label: '隐私与安全', icon: 'shield' },
]

function useTheme() {
  const { settings } = useStore()
  useEffect(() => {
    const apply = () => {
      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    }
    apply()
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])
}

function Shell() {
  const { path } = useRouter()
  const { settings, models } = useStore()
  const { running, live } = useRun()
  useTheme()

  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'LLM 能力与性能测试台｜浏览器直连、数据本地',
      '/models': '模型与服务商配置｜LLM 测试台',
      '/run': '发起测试｜LLM 测试台',
      '/results': '测试结果｜LLM 测试台',
      '/docs': '测试项说明与术语表｜LLM 测试台',
      '/privacy': '隐私与数据安全说明｜LLM 测试台',
    }
    document.title = titles[path] ?? 'LLM 能力与性能测试台'
  }, [path])

  const page =
    path === '/models' ? <Models />
      : path === '/run' ? <RunPage />
        : path === '/results' ? <Results />
          : path === '/docs' ? <Docs />
            : path === '/privacy' ? <Privacy />
              : <Overview />

  const nextTheme = settings.theme === 'dark' ? 'light' : 'dark'
  const doneCount = live ? Object.values(live.results).filter((r) => r.status === 'done').length : 0

  return (
    <div className="min-h-screen lg:flex">
      {/* 侧边导航 */}
      <header className="lg:sticky lg:top-0 lg:h-screen lg:w-[228px] shrink-0 border-b lg:border-b-0 lg:border-r border-line bg-surface/80 backdrop-blur z-30">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-4">
            <Link to="/" className="flex min-w-0 items-center gap-2.5 text-ink no-underline">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-ink shrink-0">
                <Icon name="gauge" size={17} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold leading-tight">LLM 测试台</span>
                <span className="block text-[10.5px] text-faint leading-tight tracking-wide">WHICH LLM I CAN USE</span>
              </span>
            </Link>
            <button
              onClick={() => actions.setSettings({ theme: nextTheme })}
              className="btn btn-subtle btn-sm lg:hidden"
              aria-label="切换深色模式"
            >
              <Icon name={settings.theme === 'dark' ? 'sun' : 'moon'} size={15} />
            </button>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 scrollbar-none lg:flex-col lg:overflow-visible lg:px-2.5">
            {NAV.map((n) => {
              const active = path === n.to
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={classNames(
                    'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13.5px] font-medium no-underline transition-colors',
                    active ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-raised hover:text-ink',
                  )}
                >
                  <Icon name={n.icon} size={15} />
                  {n.label}
                  {n.to === '/run' && running && (
                    <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto hidden lg:block px-3 pb-3">
            {running && live && (
              <Link to="/run" className="mb-2 block rounded-lg border border-brand/30 bg-brand/5 px-2.5 py-2 text-[12px] no-underline">
                <span className="flex items-center gap-1.5 font-medium text-brand">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
                  测试进行中
                </span>
                <span className="mt-0.5 block text-faint">
                  {doneCount}/{live.modelIds.length} 个模型已完成
                </span>
              </Link>
            )}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2">
              <span className="text-[12px] text-faint">
                {models.length} 个模型
              </span>
              <button
                onClick={() => actions.setSettings({ theme: nextTheme })}
                className="btn btn-subtle btn-sm -mr-1"
                aria-label="切换深色模式"
                title="切换深色 / 浅色"
              >
                <Icon name={settings.theme === 'dark' ? 'sun' : 'moon'} size={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{page}</div>
        <SiteFooter />
      </main>
    </div>
  )
}

function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-line px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 text-[12.5px] text-faint sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl leading-relaxed">
          所有测试请求均由你的浏览器直接发往模型服务商，API Key 与测试结果只保存在本机。
          本站不设后端接口，不收集任何数据。
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link to="/docs" className="text-muted no-underline hover:text-ink">测试项说明</Link>
          <Link to="/privacy" className="text-muted no-underline hover:text-ink">隐私与安全</Link>
          <a
            href="https://github.com/othorizon/which-llm-i-can-use"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted no-underline hover:text-ink"
          >
            <Icon name="github" size={13} /> 源码
          </a>
        </nav>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <RouterProvider>
      <RunProvider>
        <ToastHost>
          <Shell />
        </ToastHost>
      </RunProvider>
    </RouterProvider>
  )
}
