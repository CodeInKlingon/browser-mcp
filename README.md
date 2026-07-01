# @codeinklingon/browser-mcp

vibecoded port of oh-my-pi's browser tool as an mcp server

MCP server for headless browser automation via Puppeteer. Drop-in replacement for `@playwright/mcp` with enhanced stealth anti-detection and Playwright-format ARIA snapshots.

## Usage

Add to your `opencode.json`:

```json
{
  "mcp": {
    "browser-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@codeinklingon/browser-mcp"],
      "enabled": true
    }
  }
}
```

Or install the skill (registers the MCP server + loads AI guidance):

```bash
npx skills install @codeinklingon/browser-mcp
```

Or run directly:

```bash
npx @codeinklingon/browser-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `browser_tab_open` | Open a tab, optionally navigate to a URL |
| `browser_tab_run` | Execute JS in the tab — has full `tab` API in scope |
| `browser_tab_close` | Close the tab and release resources |

## The `tab` API

Every `browser_tab_run` call has `tab`, `display`, `wait`, `assert` in scope.

### Navigation & Info

| Method | Notes |
|--------|-------|
| `tab.url()` | Current URL (sync) |
| `tab.title()` | Page title |
| `tab.goto(url, { waitUntil? })` | `'load'`, `'domcontentloaded'`, `'networkidle'` |
| `tab.waitForNavigation({ waitUntil?, timeout? })` | Wait for next page load |

### Click & Input

| Method | Notes |
|--------|-------|
| `tab.click(selector)` | CSS, `text/`, `xpath/`, `aria-ref=` |
| `tab.type(selector, text)` | Type into input |
| `tab.fill(selector, value)` | Clear then type |
| `tab.press(key, { selector? })` | `'Enter'`, `'Escape'`, etc. |
| `tab.hover(selector)` | |
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
| `tab.waitForSelector(...)` | CSS, text, xpath, aria-ref |
| `tab.waitForUrl(pattern, { timeout? })` | String substring or RegExp |
| `tab.waitForResponse(pattern, { timeout? })` | String, RegExp, or function |

**ElementHandleActions**: `{ click, type, fill, hover, focus, screenshot, evaluate, scrollIntoView }`

### Important

- `display`, `wait`, `assert` are **bare globals** — NOT `tab.*` methods
  - `display(x)` ✓ — `tab.display(x)` ✗
  - `wait(2000)` ✓ — `tab.wait(2000)` ✗
- Navigation invalidates refs — re-run `ariaSnapshot()` or `observe()` after `goto()`
- Single-expression code auto-returns its value (no explicit `return` needed)

## Selector Syntax

| Prefix | Example | Notes |
|--------|---------|-------|
| *(none)* | `'button.submit'` | CSS selector |
| `text/` | `'text/Sign in'` | Visible text (retries 10x) |
| `xpath/` | `'xpath//button'` | XPath |
| `aria-ref=` | `'aria-ref=e12'` | Ref from `ariaSnapshot()` |

## Example

```js
await tab.goto('https://example.com/login')
const snap = await tab.ariaSnapshot()
display(snap)
await tab.fill('aria-ref=e5', 'admin')
await tab.fill('aria-ref=e8', 'password')
await tab.click('aria-ref=e12')
await tab.waitForNavigation()
display(tab.url())
const screenshot = await tab.screenshot()
display(screenshot)
```

## Install

```bash
# Quick start — installs the skill and registers the MCP server
npx skills install codeinklingon/browser-mcp

# Or manually add to opencode.json (see Usage above)
```

## Build from source

```bash
npm install
npm run build
```

Publish:

```bash
npm publish
```

## License

MIT
