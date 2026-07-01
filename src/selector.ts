import type { Page, ElementHandle } from 'puppeteer-core'
import { resolveAriaRefHandle } from './aria/aria-snapshot.js'

export type SelectorKind = 'css' | 'text' | 'xpath' | 'aria'

export interface ParsedSelector {
  kind: SelectorKind
  value: string
}

export function parseSelector(raw: string): ParsedSelector {
  const textMatch = raw.match(/^text\/(.+)/)
  if (textMatch) return { kind: 'text', value: textMatch[1] }

  const xpathMatch = raw.match(/^xpath\/(.+)/)
  if (xpathMatch) return { kind: 'xpath', value: xpathMatch[1] }

  const ariaMatch = raw.match(/^aria-ref=(.+)/)
  if (ariaMatch) return { kind: 'aria', value: ariaMatch[1] }

  return { kind: 'css', value: raw }
}

export async function findElement(
  page: Page,
  raw: string,
): Promise<ElementHandle<Node> | null> {
  const sel = parseSelector(raw)

  if (sel.kind === 'css') {
    return page.$(sel.value)
  }

  if (sel.kind === 'aria') {
    return await resolveAriaRefHandle(page, sel.value)
  }

  if (sel.kind === 'text') {
    return findElementByText(page, sel.value)
  }

  if (sel.kind === 'xpath') {
    return page.$(`xpath/${sel.value}`)
  }

  return null
}

async function findElementByText(
  page: Page,
  text: string,
): Promise<ElementHandle<Node> | null> {
  const handle = await page.evaluateHandle((targetText) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent?.trim() === targetText) {
        const parent = node.parentElement
        if (parent && (parent as HTMLElement).click) return parent
        return node.parentNode
      }
    }
    return null
  }, text)

  if (handle.asElement()) return handle.asElement()!
  await handle.dispose()
  return null
}
