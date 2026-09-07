import { useSyncExternalStore } from 'react'
import type { ModelEntry, Provider, RunOptions, RunSession } from './types'
import { DEFAULT_OPTIONS } from './engine'
import { uid } from './util'

const K = {
  providers: 'wliu.providers.v1',
  models: 'wliu.models.v1',
  sessions: 'wliu.sessions.v1',
  options: 'wliu.options.v1',
  settings: 'wliu.settings.v1',
  keys: 'wliu.keys.v1',
}

export type ThemeSetting = 'light' | 'dark' | 'system'

export interface Settings {
  theme: ThemeSetting
  /** true：API Key 存 localStorage（跨会话保留）；false：只存 sessionStorage（关闭标签页即清除） */
  persistKeys: boolean
  /** 是否已确认隐私说明 */
  privacyAck: boolean
  /** 结果详情默认展开原始报文 */
  expandRaw: boolean
}

export interface AppState {
  providers: Provider[]
  models: ModelEntry[]
  sessions: RunSession[]
  options: RunOptions
  settings: Settings
}

const DEFAULT_SETTINGS: Settings = { theme: 'system', persistKeys: true, privacyAck: false, expandRaw: false }

const MAX_SESSIONS = 25

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) } as T
  } catch {
    return fallback
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

function keyStore(persist: boolean): Storage | null {
  try {
    return persist ? localStorage : sessionStorage
  } catch {
    return null
  }
}

function readKeys(persist: boolean): Record<string, string> {
  try {
    const raw = keyStore(persist)?.getItem(K.keys)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeKeys(persist: boolean, map: Record<string, string>) {
  try {
    keyStore(persist)?.setItem(K.keys, JSON.stringify(map))
    // 切换存储位置时清掉另一侧的残留
    const other = persist ? sessionStorage : localStorage
    other.removeItem(K.keys)
  } catch { /* 隐私模式下可能不可写 */ }
}

function load(): AppState {
  const settings = read<Settings>(K.settings, DEFAULT_SETTINGS)
  const keys = readKeys(settings.persistKeys)
  const providers = readArray<Provider>(K.providers).map((p) => ({ ...p, apiKey: keys[p.id] ?? '' }))
  return {
    providers,
    models: readArray<ModelEntry>(K.models),
    sessions: readArray<RunSession>(K.sessions),
    options: read<RunOptions>(K.options, DEFAULT_OPTIONS),
    settings,
  }
}

let state: AppState = typeof window === 'undefined'
  ? { providers: [], models: [], sessions: [], options: DEFAULT_OPTIONS, settings: DEFAULT_SETTINGS }
  : load()

const listeners = new Set<() => void>()

function commit(next: Partial<AppState>, persist: (keyof AppState)[]) {
  state = { ...state, ...next }
  try {
    for (const k of persist) {
      if (k === 'providers') {
        const keys: Record<string, string> = {}
        const stripped = state.providers.map((p) => {
          if (p.apiKey) keys[p.id] = p.apiKey
          return { ...p, apiKey: '' }
        })
        localStorage.setItem(K.providers, JSON.stringify(stripped))
        writeKeys(state.settings.persistKeys, keys)
      } else if (k === 'models') localStorage.setItem(K.models, JSON.stringify(state.models))
      else if (k === 'sessions') localStorage.setItem(K.sessions, JSON.stringify(state.sessions.slice(0, MAX_SESSIONS)))
      else if (k === 'options') localStorage.setItem(K.options, JSON.stringify(state.options))
      else if (k === 'settings') localStorage.setItem(K.settings, JSON.stringify(state.settings))
    }
  } catch (err) {
    console.warn('本地存储写入失败（可能是隐私模式或容量已满）', err)
  }
  listeners.forEach((l) => l())
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getState(): AppState {
  return state
}

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState)
}

/* ------------------------------- 操作 ------------------------------- */

export const actions = {
  addProvider(p: Omit<Provider, 'id' | 'createdAt'>): Provider {
    const provider: Provider = { ...p, id: uid('prv'), createdAt: Date.now() }
    commit({ providers: [...state.providers, provider] }, ['providers'])
    return provider
  },
  updateProvider(id: string, patch: Partial<Provider>) {
    commit({ providers: state.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, ['providers'])
  },
  removeProvider(id: string) {
    commit(
      {
        providers: state.providers.filter((p) => p.id !== id),
        models: state.models.filter((m) => m.providerId !== id),
      },
      ['providers', 'models'],
    )
  },
  addModel(m: Omit<ModelEntry, 'id' | 'createdAt'>): ModelEntry {
    const model: ModelEntry = { ...m, id: uid('mdl'), createdAt: Date.now() }
    commit({ models: [...state.models, model] }, ['models'])
    return model
  },
  addModels(list: Omit<ModelEntry, 'id' | 'createdAt'>[]): ModelEntry[] {
    const created = list.map((m) => ({ ...m, id: uid('mdl'), createdAt: Date.now() }))
    commit({ models: [...state.models, ...created] }, ['models'])
    return created
  },
  updateModel(id: string, patch: Partial<ModelEntry>) {
    commit({ models: state.models.map((m) => (m.id === id ? { ...m, ...patch } : m)) }, ['models'])
  },
  removeModel(id: string) {
    commit({ models: state.models.filter((m) => m.id !== id) }, ['models'])
  },
  setOptions(patch: Partial<RunOptions>) {
    commit({ options: { ...state.options, ...patch } }, ['options'])
  },
  setSettings(patch: Partial<Settings>) {
    const next = { ...state.settings, ...patch }
    if (patch.persistKeys !== undefined && patch.persistKeys !== state.settings.persistKeys) {
      const keys: Record<string, string> = {}
      state.providers.forEach((p) => { if (p.apiKey) keys[p.id] = p.apiKey })
      state = { ...state, settings: next }
      writeKeys(next.persistKeys, keys)
    }
    commit({ settings: next }, ['settings'])
  },
  upsertSession(session: RunSession) {
    const rest = state.sessions.filter((s) => s.id !== session.id)
    commit({ sessions: [session, ...rest].slice(0, MAX_SESSIONS) }, ['sessions'])
  },
  removeSession(id: string) {
    commit({ sessions: state.sessions.filter((s) => s.id !== id) }, ['sessions'])
  },
  clearSessions() {
    commit({ sessions: [] }, ['sessions'])
  },
  /** 一键清空所有本地数据 */
  wipeAll() {
    try {
      // 清掉本站写入的所有键（含测试项勾选等辅助状态）
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith('wliu.')) keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
      sessionStorage.removeItem(K.keys)
    } catch { /* ignore */ }
    state = { providers: [], models: [], sessions: [], options: DEFAULT_OPTIONS, settings: { ...DEFAULT_SETTINGS, privacyAck: true } }
    listeners.forEach((l) => l())
  },
  importData(payload: { providers?: Provider[]; models?: ModelEntry[]; sessions?: RunSession[]; options?: RunOptions }) {
    commit(
      {
        providers: payload.providers?.length ? dedupeById([...state.providers, ...payload.providers]) : state.providers,
        models: payload.models?.length ? dedupeById([...state.models, ...payload.models]) : state.models,
        sessions: payload.sessions?.length ? dedupeById([...payload.sessions, ...state.sessions]).slice(0, MAX_SESSIONS) : state.sessions,
        options: payload.options ?? state.options,
      },
      ['providers', 'models', 'sessions', 'options'],
    )
  },
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of list) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

export function providerMap(s: AppState = state): Record<string, Provider> {
  return Object.fromEntries(s.providers.map((p) => [p.id, p]))
}

/** 导出（默认不含 API Key） */
export function exportPayload(opts: { includeKeys: boolean; includeSessions: boolean }) {
  return {
    _meta: { app: 'which-llm-i-can-use', version: 1, exportedAt: new Date().toISOString() },
    providers: state.providers.map((p) => ({ ...p, apiKey: opts.includeKeys ? p.apiKey : '' })),
    models: state.models,
    options: state.options,
    sessions: opts.includeSessions ? state.sessions : [],
  }
}
