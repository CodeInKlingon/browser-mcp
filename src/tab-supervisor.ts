import type { Page } from 'puppeteer-core'
import { acquirePage, releasePage } from './launch.js'
import { createTabApi, type TabApi } from './tab-api.js'

const STATEMENT_START = /^(const|let|var|if|for|while|function|class|return|throw|try|switch|do|import|export|debugger)\b/

function isSingleExpression(code: string): boolean {
  const trimmed = code.trim()
  if (trimmed.includes('\n') || trimmed.includes(';')) return false
  return !STATEMENT_START.test(trimmed)
}

interface TabSession {
  page: Page
  api: TabApi
  name: string
}

const tabs = new Map<string, TabSession>()

export async function openTab(
  name: string,
  opts?: { url?: string; viewport?: { width: number; height: number } },
): Promise<TabApi> {
  const existing = tabs.get(name)
  if (existing) {
    if (opts?.url) {
      await existing.api.goto(opts.url)
    }
    return existing.api
  }

  const page = await acquirePage(opts?.viewport)
  const api = createTabApi(page, name)

  if (opts?.url) {
    await api.goto(opts.url)
  }

  tabs.set(name, { page, api, name })
  return api
}

export async function runInTab(
  name: string,
  code: string,
): Promise<{ displays: unknown[]; returnValue: unknown }> {
  const session = tabs.get(name)
  if (!session) throw new Error(`Tab "${name}" is not open. Call browser_tab_open first.`)

  const displays: unknown[] = []
  const display = (v: unknown) => { displays.push(v) }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const assert = (cond: boolean, msg?: string) => { if (!cond) throw new Error(msg || 'Assertion failed') }

  const body = isSingleExpression(code) ? `return (${code})` : code
  const fn = new Function('tab', 'display', 'wait', 'assert', `return (async () => { ${body} })()`)
  const returnValue = await fn(session.api, display, wait, assert)

  return { displays, returnValue }
}

export async function closeTab(name: string): Promise<boolean> {
  const session = tabs.get(name)
  if (!session) return false

  await session.page.close().catch(() => {})
  tabs.delete(name)
  releasePage()
  return true
}

export async function closeAllTabs(): Promise<void> {
  for (const [name] of tabs) {
    await closeTab(name)
  }
}
