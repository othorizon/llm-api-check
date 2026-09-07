import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ModelEntry, Provider, RunOptions, RunSession, SuiteId } from './lib/types'
import { startRun, type RunHandle } from './lib/engine'
import { actions } from './lib/store'

interface StartArgs {
  models: ModelEntry[]
  providers: Record<string, Provider>
  checkIds: string[]
  suites: SuiteId[]
  options: RunOptions
  label?: string
}

interface RunContextValue {
  live: RunSession | null
  running: boolean
  start: (args: StartArgs) => Promise<RunSession>
  abort: () => void
}

const Ctx = createContext<RunContextValue>({ live: null, running: false, start: async () => ({} as RunSession), abort: () => {} })

export const useRun = () => useContext(Ctx)

export function RunProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<RunSession | null>(null)
  const [running, setRunning] = useState(false)
  const handleRef = useRef<RunHandle | null>(null)
  const lastPersist = useRef(0)

  const start = useCallback(async (args: StartArgs) => {
    if (handleRef.current) handleRef.current.abort()
    setRunning(true)
    const handle = startRun({
      ...args,
      onUpdate: (s) => {
        setLive(s)
        // 运行中低频落盘，避免频繁写入 localStorage
        const now = Date.now()
        if (now - lastPersist.current > 4000) {
          lastPersist.current = now
          actions.upsertSession(s)
        }
      },
    })
    handleRef.current = handle
    const finished = await handle.done
    actions.upsertSession(finished)
    setLive(finished)
    setRunning(false)
    handleRef.current = null
    return finished
  }, [])

  const abort = useCallback(() => {
    handleRef.current?.abort()
  }, [])

  const value = useMemo(() => ({ live, running, start, abort }), [live, running, start, abort])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
