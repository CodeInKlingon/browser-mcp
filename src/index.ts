import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { openTab, runInTab, closeTab, closeAllTabs } from './tab-supervisor.js'

const TAB_NAME = 'main'

const server = new Server(
  { name: 'browser-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'browser_tab_open',
      description: 'Open a browser tab, optionally navigating to a URL. Reuses existing tab by name.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
          viewport: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' },
            },
          },
        },
      },
    },
    {
      name: 'browser_tab_run',
      description: `Execute JavaScript code in the browser tab. The code runs as an async function body.

CRITICAL RULES:
- MUST call browser_tab_open before browser_tab_run
- ALWAYS await async tab methods
- tab.observe() and tab.goto() invalidate previous element refs
- Default to tab.observe() for page state; screenshot only when appearance matters
- For reading static content (articles, docs, JSON, PDFs), prefer webfetch — browser is for JS execution, auth, interactive actions

Available variables in scope:
  - tab — TabApi object:
      tab.url(): string                                         (sync)
      tab.title(): Promise<string>
      tab.goto(url, { waitUntil? })                             waitUntil: 'load' | 'domcontentloaded' | 'networkidle'
      tab.click(selector)                                       CSS, "text/...", "xpath/...", "aria-ref=..."
      tab.type(selector, text)
      tab.fill(selector, value)                                 clear + type into input
      tab.press(key, { selector? })                             e.g. 'Enter', 'Escape'
      tab.hover(selector)
      tab.scroll(deltaX, deltaY)
      tab.scrollIntoView(selector)
      tab.screenshot({ fullPage?, selector? })                  returns base64 PNG
      tab.evaluate(fn, ...args)                                 raw JS in page context
      tab.observe()                                              accessibility tree: { elements: [{ id, role, name, value, focused }] }
      tab.ariaSnapshot()                                         Playwright-format YAML tree with [ref=eN] ids, [cursor=pointer] for clickables
      tab.id(n)                                                  ElementHandleActions from observe() id
      tab.ref("e5")                                              ElementHandleActions from ariaSnapshot() ref
      tab.waitForSelector(selector, { timeout?, visible?, hidden? })
      tab.waitForUrl(pattern, { timeout? })                     string substring or RegExp
      tab.waitForResponse(pattern, { timeout? })                 string, RegExp, or (res) => boolean
      tab.waitForNavigation({ waitUntil?, timeout? })
      tab.select(selector, ...values)                            <select> option(s)
      tab.drag(from, to)                                         selector or { x, y } point
      tab.extract(format?)                                        'markdown' | 'text' | omitted (returns HTML)
      tab.uploadFile(selector, ...filePaths)                      file input

  ElementHandleActions: { click, type, fill, hover, focus, screenshot, evaluate, scrollIntoView }

  - display(value) — emit structured output (NOT a tab.* method)
  - wait(ms) — delay (NOT a tab.* method; use bare wait(2000), not tab.wait(...))
  - assert(cond, msg?) — guard (NOT a tab.* method)

Selectors: CSS by default, "text/Sign in" for visible text, "xpath/...", "aria-ref=e5" from ariaSnapshot.

Single-expression code auto-returns its value (no explicit 'return' needed).
Use display() for intermediate values.`,
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript code body to execute' },
        },
        required: ['code'],
      },
    },
    {
      name: 'browser_tab_close',
      description: 'Close the browser tab and release resources.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    case 'browser_tab_open': {
      const url = args?.url as string | undefined
      const viewport = args?.viewport as { width: number; height: number } | undefined
      const tab = await openTab(TAB_NAME, { url, viewport })
      return {
        content: [{ type: 'text', text: `Opened tab. URL: ${tab.url()}` }],
      }
    }

    case 'browser_tab_run': {
      const code = args?.code as string
      if (!code) throw new Error('Missing required parameter "code"')

      const { displays, returnValue } = await runInTab(TAB_NAME, code)
      const content: Array<{ type: string; text?: string }> = []

      for (const d of displays) {
        if (typeof d === 'string') {
          content.push({ type: 'text', text: d })
        } else {
          content.push({ type: 'text', text: JSON.stringify(d, null, 2) })
        }
      }

      if (returnValue !== undefined) {
        const text = typeof returnValue === 'string'
          ? returnValue
          : JSON.stringify(returnValue, null, 2)
        content.push({ type: 'text', text })
      }

      return { content }
    }

    case 'browser_tab_close': {
      await closeTab(TAB_NAME)
      return { content: [{ type: 'text', text: 'Tab closed.' }] }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
