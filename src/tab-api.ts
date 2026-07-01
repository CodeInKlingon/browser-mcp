import type { Page, ElementHandle } from 'puppeteer-core'
import { findElement, parseSelector } from './selector.js'
import { captureAriaSnapshot, resolveAriaRefHandle } from './aria/aria-snapshot.js'

export interface ObserveElement {
  id: number
  role: string
  name: string
  value?: string
  focused: boolean
  states?: string[]
}

export interface ObserveResult {
  url: string
  title: string
  viewport: { width: number; height: number }
  scroll: { x: number; y: number }
  elements: ObserveElement[]
}

export interface TabApi {
  name: string
  url(): string
  title(): Promise<string>
  goto(url: string, opts?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void>
  click(selector: string): Promise<void>
  type(selector: string, text: string): Promise<void>
  fill(selector: string, value: string): Promise<void>
  press(key: string, opts?: { selector?: string }): Promise<void>
  hover(selector: string): Promise<void>
  scroll(deltaX: number, deltaY: number): Promise<void>
  scrollIntoView(selector: string): Promise<void>
  screenshot(opts?: { fullPage?: boolean; selector?: string }): Promise<string>
  evaluate<R>(fn: (...args: unknown[]) => R, ...args: unknown[]): Promise<R>
  observe(): Promise<ObserveResult>
  ariaSnapshot(): Promise<string>
  id(n: number): ElementHandleActions
  ref(refId: string): ElementHandleActions
  waitForSelector(selector: string, opts?: { timeout?: number; visible?: boolean; hidden?: boolean }): Promise<void>
  waitForUrl(pattern: string | RegExp, opts?: { timeout?: number }): Promise<string>
  waitForResponse(pattern: string | RegExp | ((res: { url: string; status: number }) => boolean), opts?: { timeout?: number }): Promise<{ url: string; status: number }>
  waitForNavigation(opts?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }): Promise<void>
  select(selector: string, ...values: string[]): Promise<string[]>
  drag(from: string | { x: number; y: number }, to: string | { x: number; y: number }): Promise<void>
  extract(format?: 'markdown' | 'text'): Promise<string | null>
  uploadFile(selector: string, ...filePaths: string[]): Promise<void>
}

interface ElementHandleActions {
  click(): Promise<void>
  type(text: string): Promise<void>
  fill(value: string): Promise<void>
  hover(): Promise<void>
  focus(): Promise<void>
  screenshot(): Promise<string>
  evaluate<R>(fn: (...args: unknown[]) => R, ...args: unknown[]): Promise<R>
  scrollIntoView(): Promise<void>
}

export function createTabApi(page: Page, name: string): TabApi {
  let observeCache = new Map<number, ElementHandle<Node>>()

  async function resolveHandle(selector: string): Promise<ElementHandle<Node>> {
    const el = await findElement(page, selector)
    if (!el) throw new Error(`Element not found: "${selector}"`)
    return el
  }

  function createActions(el: () => Promise<ElementHandle<Node>>): ElementHandleActions {
    return {
      click: async () => { const h = await el(); await h.click() },
      type: async (text) => { const h = await el(); await h.type(text) },
      fill: async (value) => {
        const h = await el() as ElementHandle<HTMLInputElement | HTMLTextAreaElement>
        await page.evaluate((e) => { e.value = '' }, h)
        await h.type(value)
      },
      hover: async () => { const h = await el(); await h.hover() },
      focus: async () => { const h = await el(); await h.focus() },
      screenshot: async () => {
        const h = await el()
        return await h.screenshot({ encoding: 'base64' }) as string
      },
      evaluate: (fn, ...args) => page.evaluate(fn as (...args: unknown[]) => unknown, ...args) as Promise<never>,
      scrollIntoView: async () => {
        const h = await el()
        await page.evaluate((e) => e.scrollIntoView({ block: 'center' }), h)
      },
    }
  }

  async function retryClick(sel: import('./selector.js').ParsedSelector): Promise<void> {
    for (let i = 0; i < 10; i++) {
      const el = await findElement(page, sel.value)
      if (el) {
        const visible = await page.evaluate(
          (e) => e instanceof HTMLElement && e.offsetParent !== null,
          el,
        )
        if (visible) {
          await el.click()
          return
        }
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`Element not found/visible: "${sel.value}"`)
  }

  async function resolvePoint(
    target: string | { x: number; y: number },
  ): Promise<{ x: number; y: number }> {
    if (typeof target === 'object') return target
    const el = await resolveHandle(target)
    const box = await el.boundingBox()
    if (!box) throw new Error(`Element has no bounding box: "${target}"`)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  return {
    name,
    url: () => page.url(),
    title: () => page.title(),

    async goto(url, opts) {
      observeCache.clear()
      await page.goto(url, { waitUntil: opts?.waitUntil ?? 'load' })
    },

    async click(raw) {
      const sel = parseSelector(raw)
      if (sel.kind === 'text') {
        await retryClick(sel)
      } else {
        const el = await resolveHandle(raw)
        await el.click()
      }
    },

    async type(raw, text) {
      const el = await resolveHandle(raw)
      await el.type(text)
    },

    async fill(raw, value) {
      const el = await resolveHandle(raw) as ElementHandle<HTMLInputElement | HTMLTextAreaElement>
      await page.evaluate((e) => { e.value = '' }, el)
      await el.type(value)
    },

    async press(key, opts) {
      if (opts?.selector) {
        const el = await resolveHandle(opts.selector)
        await el.press(key)
      } else {
        await page.keyboard.press(key)
      }
    },

    async hover(raw) {
      const el = await resolveHandle(raw)
      await el.hover()
    },

    async scroll(deltaX, deltaY) {
      await page.evaluate((x, y) => window.scrollBy(x, y), deltaX, deltaY)
    },

    async scrollIntoView(raw) {
      const el = await resolveHandle(raw)
      await page.evaluate((e) => e.scrollIntoView({ block: 'center' }), el)
    },

    async screenshot(opts) {
      if (opts?.selector) {
        const el = await resolveHandle(opts.selector)
        return await el.screenshot({ encoding: 'base64' }) as string
      }
      return await page.screenshot({ encoding: 'base64', fullPage: opts?.fullPage })
    },

    evaluate: (fn, ...args) => page.evaluate(fn as (...args: unknown[]) => unknown, ...args) as Promise<never>,

    async observe() {
      observeCache.clear()
      const snapshot = await page.accessibility.snapshot()
      const url = page.url()
      const title = await page.title()
      const vp = page.viewport() ?? { width: 1366, height: 768 }

      const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
      const elements: ObserveElement[] = []
      let idCounter = 0

      const walk = async (node: typeof snapshot, depth = 0) => {
        if (!node || depth > 15) return
        if (node.role && node.role !== 'RootWebArea' && node.role !== 'WebArea') {
          idCounter++
          const handle = await node.elementHandle()
          if (handle) {
            observeCache.set(idCounter, handle)
          }
          elements.push({
            id: idCounter,
            role: node.role ?? '',
            name: (node as { name?: string }).name ?? '',
            value: (node as { value?: string }).value,
            focused: !!(node as { focused?: boolean }).focused,
            states: (node as { states?: string[] }).states,
          })
        }
        if (node.children) {
          for (const child of node.children) {
            await walk(child, depth + 1)
          }
        }
      }
      await walk(snapshot)

      return { url, title, viewport: { width: vp.width, height: vp.height }, scroll, elements }
    },

    async ariaSnapshot() {
      return await captureAriaSnapshot(page, null)
    },

    id(n: number) {
      return createActions(async () => {
        let cached = observeCache.get(n)
        if (cached) {
          const connected = await page.evaluate((el) => el.isConnected, cached)
          if (connected) return cached
          observeCache.delete(n)
        }
        throw new Error(`Element id ${n} is stale or not found. Re-run tab.observe() first.`)
      })
    },

    ref(refId: string) {
      return createActions(async () => {
        const handle = await resolveAriaRefHandle(page, refId)
        if (handle) return handle
        throw new Error(`No element with ref "${refId}". Re-run tab.ariaSnapshot() first.`)
      })
    },

    async waitForSelector(raw, opts) {
      const sel = parseSelector(raw)
      await page.waitForSelector(sel.value, {
        timeout: opts?.timeout ?? 5000,
        visible: opts?.visible,
        hidden: opts?.hidden,
      })
    },

    async waitForUrl(pattern, opts) {
      const timeout = opts?.timeout ?? 5000
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const url = page.url()
        if (typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url)) {
          return url
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      throw new Error(`URL did not match pattern "${pattern}" within ${timeout}ms`)
    },

    async waitForResponse(pattern, opts) {
      const timeout = opts?.timeout ?? 5000
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Response did not match pattern "${pattern}" within ${timeout}ms`))
        }, timeout)

        const handler = (response: { url(): string; status(): number }) => {
          let matched = false
          if (typeof pattern === 'function') {
            matched = pattern({ url: response.url(), status: response.status() })
          } else if (typeof pattern === 'string') {
            matched = response.url().includes(pattern)
          } else {
            matched = pattern.test(response.url())
          }
          if (matched) {
            clearTimeout(timer)
            page.off('response', handler)
            resolve({ url: response.url(), status: response.status() })
          }
        }

        page.on('response', handler)
      })
    },

    async waitForNavigation(opts) {
      await page.waitForNavigation({
        waitUntil: opts?.waitUntil ?? 'load',
        timeout: opts?.timeout ?? 30000,
      })
    },

    async select(raw, ...values) {
      const el = await resolveHandle(raw) as ElementHandle<HTMLSelectElement>
      return await el.select(...values)
    },

    async drag(from, to) {
      const fromPt = await resolvePoint(from)
      const toPt = await resolvePoint(to)
      const steps = 12
      await page.mouse.move(fromPt.x, fromPt.y)
      await page.mouse.down()
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
          fromPt.x + (toPt.x - fromPt.x) * (i / steps),
          fromPt.y + (toPt.y - fromPt.y) * (i / steps),
        )
      }
      await page.mouse.up()
    },

    async extract(format) {
      const html = await page.content()
      if (!html) return null

      if (format === 'text' || format === 'markdown') {
        const text = await page.evaluate(() => {
          const article = document.querySelector('article') ||
            document.querySelector('[role="main"]') ||
            document.querySelector('main') ||
            document.body
          return (article as HTMLElement).innerText || ''
        })
        return text
      }

      return html
    },

    async uploadFile(raw, ...filePaths) {
      const el = await resolveHandle(raw) as ElementHandle<HTMLInputElement>
      await el.uploadFile(...filePaths)
    },
  }
}
