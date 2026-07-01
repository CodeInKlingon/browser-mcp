import type { ElementHandle, JSHandle, Page } from 'puppeteer-core'
import { ariaBundle } from './aria-bundle.js'

export interface AriaSnapshotOptions {
  depth?: number
  boxes?: boolean
}

function buildEvaluator(params: string, call: string): (...args: unknown[]) => unknown {
  return new Function(
    ...params.split(',').map(p => p.trim()),
    `var module = { exports: {} };\n${ariaBundle}\nreturn module.exports.${call};`,
  ) as unknown as (...args: unknown[]) => unknown
}

const evaluateAriaSnapshot = buildEvaluator('root, request', 'ariaSnapshot(root, request)')
const evaluateResolveRef = buildEvaluator('ref', 'resolveAriaRef(ref)')

export async function captureAriaSnapshot(
  page: Page,
  root: ElementHandle | null,
  options: AriaSnapshotOptions = {},
): Promise<string> {
  const request = { depth: options.depth, boxes: options.boxes }
  return (await page.evaluate(evaluateAriaSnapshot as never, root as never, request as never)) as string
}

export async function resolveAriaRefHandle(page: Page, ref: string): Promise<ElementHandle | null> {
  const handle = (await page.evaluateHandle(evaluateResolveRef as never, ref as never)) as JSHandle
  const element = handle.asElement()
  if (!element) {
    await handle.dispose().catch(() => undefined)
    return null
  }
  return element as ElementHandle
}

export function buildAriaSnapshotScript(selector: string | undefined, options: AriaSnapshotOptions = {}): string {
  const request = { depth: options.depth, boxes: options.boxes }
  const sel = selector ? JSON.stringify(selector) : 'null'
  return `(function(){var module={exports:{}};\n${ariaBundle}\nvar __sel=${sel};var __root=__sel?document.querySelector(__sel):null;if(__sel&&!__root)throw new Error("tab.ariaSnapshot: selector "+__sel+" matched no element");return module.exports.ariaSnapshot(__root,${JSON.stringify(request)});})()`
}
