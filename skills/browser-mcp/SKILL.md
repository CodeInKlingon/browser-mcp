---
name: browser-mcp
description: Controls a headless browser via Puppeteer through MCP tools (browser_tab_open, browser_tab_run, browser_tab_close). Use when the user says "open the browser", "navigate to", "click", "screenshot", "scrape", "test in browser", "automate browser", or asks you to interact with a web page. For static content (articles, docs, JSON, PDFs, feeds), use webfetch instead — browser is for JS execution, auth, and interactive actions.
config:
  opencode.json:
    mcp:
      browser-mcp:
        type: local
        command:
          - npx
          - -y
          - '@codeinklingon/browser-mcp'
        enabled: true
---

# Browser MCP

Three tools: `browser_tab_open` → `browser_tab_run` (1+ times) → `browser_tab_close`.

## Critical Rules

- **MUST open before run** — `browser_tab_run` never creates a tab.
- **Always `await`** all async methods.
- **Navigation invalidates refs** — re-run `observe()` or `ariaSnapshot()` after `goto()`.
- **Default to `observe()`** for page state; screenshot only when appearance matters.
- **Static content** → use `webfetch`, not the browser.
- **`tab.url()` is sync** — no `await` needed.

## The `tab` API

Every `browser_tab_run` call has `tab`, `display`, `wait`, `assert` in scope.

**`display`, `wait`, `assert` are bare globals — NOT `tab.*` methods.**
- `display(x)` ✓ — `tab.display(x)` ✗
- `wait(2000)` ✓ — `tab.wait(2000)` ✗, `tab.waitForTimeout(2000)` ✗

### Navigation & Info

| Method | Notes |
|--------|-------|
| `tab.url(): string` | Current URL (sync) |
| `tab.title()` | Page title |
| `tab.goto(url, { waitUntil? })` | `'load'` (default), `'domcontentloaded'`, `'networkidle'` |
| `tab.waitForNavigation({ waitUntil?, timeout? })` | Wait for next page load |

### Click & Input

| Method | Notes |
|--------|-------|
| `tab.click(selector)` | CSS, `text/`, `xpath/`, `aria-ref=` |
| `tab.type(selector, text)` | Type into input |
| `tab.fill(selector, value)` | Clear then type |
| `tab.press(key, { selector? })` | `'Enter'`, `'Escape'`, etc. |
| `tab.hover(selector)` | Hover over element |
| `tab.select(selector, ...values)` | `<select>` options |
| `tab.drag(from, to)` | Selector or `{ x, y }` point |
| `tab.uploadFile(selector, ...filePaths)` | File input |

### Scrolling & Visibility

| Method | Notes |
|--------|-------|
| `tab.scroll(dx, dy)` | Scroll by pixels |
| `tab.scrollIntoView(selector)` | Center element in viewport |

### Page State

| Method | Notes |
|--------|-------|
| `tab.observe()` | Accessibility tree: `{ elements: [{ id, role, name, value, focused }] }` |
| `tab.ariaSnapshot()` | Playwright-format YAML with `[ref=eN]` ids, `[cursor=pointer]` on clickables |
| `tab.evaluate(fn, ...args)` | Raw JS in page context |
| `tab.extract(format?)` | `'markdown'` / `'text'` / omitted = HTML |
| `tab.screenshot({ fullPage?, selector? })` | Base64 PNG |

### Element Refs

| Method | Notes |
|--------|-------|
| `tab.id(n)` | ElementHandleActions from `observe()` id |
| `tab.ref("e5")` | ElementHandleActions from `ariaSnapshot()` ref |
| `tab.waitForSelector(selector, { timeout?, visible?, hidden? })` | |
| `tab.waitForUrl(pattern, { timeout? })` | String substring or RegExp |
| `tab.waitForResponse(pattern, { timeout? })` | String, RegExp, or function |

**ElementHandleActions**: `{ click, type, fill, hover, focus, screenshot, evaluate, scrollIntoView }`

### Selector Syntax

| Prefix | Example | Notes |
|--------|---------|-------|
| *(none)* | `'button.submit'` | CSS selector |
| `text/` | `'text/Sign in'` | Visible text (retries 10x) |
| `xpath/` | `'xpath//button'` | XPath |
| `aria-ref=` | `'aria-ref=e12'` | Ref from `ariaSnapshot()` |

## Patterns

### Multi-step interaction

```js
await tab.goto('https://example.com/login')
await tab.fill('input[name="email"]', 'user@example.com')
await tab.type('input[type="password"]', 'hunter2')
await tab.click('text/Sign in')
await tab.waitForSelector('.dashboard')
display('Logged in')
```

### Using ariaSnapshot refs

```js
const tree = await tab.ariaSnapshot()
display(tree)
await tab.ref('e5').click()
```

### Observe + interact

```js
const snap = await tab.observe()
display(snap)
await tab.click('text/Learn more')
```

### Page data

```js
await tab.goto('https://example.com')
const items = await tab.evaluate(() =>
  document.querySelectorAll('.product').length
)
return items
```

### Wait for dynamic content

```js
await tab.click('text/Load more')
const url = await tab.waitForUrl('/results', { timeout: 10000 })
display('URL changed to: ' + url)
```

## Installation

This skill pairs with `@codeinklingon/browser-mcp`. Install both:

```bash
npx skills install codeinklingon/browser-mcp
```

This registers the MCP server in your `opencode.json` and loads the skill.
