import puppeteer, { Browser, CDPSession, Page, PuppeteerLaunchOptions } from 'puppeteer-core'
import { install, Browser as BrowserEnum, detectBrowserPlatform } from '@puppeteer/browsers'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { stealthPatches } from './stealth/patches.js'

let browser: Browser | null = null
let refCount = 0
let browserSession: CDPSession | null = null
let userAgentOverride: UserAgentOverride | null = null

const CHROME_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Chromium\\Application\\chrome.exe`,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
]

function findChrome(): string | undefined {
  for (const p of CHROME_PATHS) {
    if (p && existsSync(p)) return p
  }
  return undefined
}

async function downloadChrome(): Promise<string> {
  const cacheDir = join(process.cwd(), '.browser-cache')
  mkdirSync(cacheDir, { recursive: true })
  const result = await install({
    browser: BrowserEnum.CHROME,
    buildId: 'latest',
    cacheDir,
    detectPlatform: true,
  })
  return result.executablePath
}

function buildStealthInjectionScript(scripts: string[]): string {
  const joint = scripts
    .map(script => `
    try {
      ${script};
    } catch (e) {}
  `)
    .join(';\n')

  return `(() => {
    const Page_Function_toString = Function.prototype.toString;
    const Page_FunctionToStringDescriptor = Object.getOwnPropertyDescriptor(Function.prototype, "toString");
    const Page_Proxy = Proxy;
    const Page_WeakMap = WeakMap;
    const Page_WeakMap_get = Page_WeakMap.prototype.get;
    const Page_WeakMap_set = Page_WeakMap.prototype.set;
    let iframe = null;
    const container = document.head ?? document.documentElement;
    if (container) {
      iframe = document.createElement("iframe");
      iframe.style.display = "none";
      container.appendChild(iframe);
      if (!iframe.contentWindow) iframe = null;
    }
    try {
      const nativeWindow = iframe ? iframe.contentWindow : window;

      const Function_toString = nativeWindow.Function.prototype.toString;
      const Object_getOwnPropertyDescriptor = nativeWindow.Object.getOwnPropertyDescriptor;
      const Object_getOwnPropertyDescriptors = nativeWindow.Object.getOwnPropertyDescriptors;
      const Object_getPrototypeOf = nativeWindow.Object.getPrototypeOf;
      const Object_defineProperty = nativeWindow.Object.defineProperty;
      const Object_getOwnPropertyDescriptorOriginal = nativeWindow.Object.getOwnPropertyDescriptor;
      const Object_create = nativeWindow.Object.create;
      const Object_keys = nativeWindow.Object.keys;
      const Object_getOwnPropertyNames = nativeWindow.Object.getOwnPropertyNames;
      const Object_entries = nativeWindow.Object.entries;
      const Object_setPrototypeOf = nativeWindow.Object.setPrototypeOf;
      const Object_assign = nativeWindow.Object.assign;
      const Window_setTimeout = nativeWindow.setTimeout;
      const Math_random = nativeWindow.Math.random;
      const Math_floor = nativeWindow.Math.floor;
      const Math_max = nativeWindow.Math.max;
      const Math_min = nativeWindow.Math.min;
      const Window_Event = nativeWindow.Event;
      const Promise_resolve = nativeWindow.Promise.resolve.bind(nativeWindow.Promise);
      const Window_Blob = nativeWindow.Blob;
      const Window_Proxy = nativeWindow.Proxy;
      const Reflect_get = nativeWindow.Reflect.get;
      const Reflect_set = nativeWindow.Reflect.set;
      const Reflect_apply = nativeWindow.Reflect.apply;
      const Reflect_construct = nativeWindow.Reflect.construct;
      const Reflect_defineProperty = nativeWindow.Reflect.defineProperty;
      const Reflect_deleteProperty = nativeWindow.Reflect.deleteProperty;
      const Reflect_getOwnPropertyDescriptor = nativeWindow.Reflect.getOwnPropertyDescriptor;
      const Reflect_getPrototypeOf = nativeWindow.Reflect.getPrototypeOf;
      const Reflect_has = nativeWindow.Reflect.has;
      const Reflect_isExtensible = nativeWindow.Reflect.isExtensible;
      const Reflect_ownKeys = nativeWindow.Reflect.ownKeys;
      const Reflect_preventExtensions = nativeWindow.Reflect.preventExtensions;
      const Reflect_setPrototypeOf = nativeWindow.Reflect.setPrototypeOf;
      const Intl_DateTimeFormat = nativeWindow.Intl.DateTimeFormat;
      const Date_constructor = nativeWindow.Date;

      const nativeFunctionSources = new Page_WeakMap();
      const makeNativeString = (name) => "function " + (name || "") + "() { [native code] }";
      const registerNativeSource = (fn, source) => {
        if (typeof fn === "function") Reflect_apply(Page_WeakMap_set, nativeFunctionSources, [fn, source]);
        return fn;
      };
      const patchToString = (fn, name) => registerNativeSource(fn, makeNativeString(name));
      if (${scripts.length > 0 ? "true" : "false"}) {
        const functionToStringProxy = new Page_Proxy(Page_Function_toString, {
          apply(target, thisArg, args) {
            const source = Reflect_apply(Page_WeakMap_get, nativeFunctionSources, [thisArg]);
            if (source) return source;
            return Reflect_apply(target, thisArg, args || []);
          },
          get(target, key, receiver) {
            return Reflect_get(target, key, receiver);
          },
        });
        registerNativeSource(functionToStringProxy, makeNativeString("toString"));
        Object_defineProperty(Function.prototype, "toString", {
          ...(Page_FunctionToStringDescriptor || {
            writable: true,
            configurable: true,
            enumerable: false,
          }),
          value: functionToStringProxy,
        });
      }

      ${joint}
    } finally {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }})();`
}

// =====================================================================
// UA override
// =====================================================================

interface UserAgentOverride {
  userAgent: string
  platform: string
  acceptLanguage: string
  userAgentMetadata: {
    brands: Array<{ brand: string; version: string }>
    fullVersion: string
    fullVersionList: Array<{ brand: string; version: string }>
    platform: string
    platformVersion: string
    architecture: string
    bitness: string
    model: string
    mobile: boolean
  }
}

async function resolveUserAgentOverride(page: Page): Promise<UserAgentOverride> {
  const rawUserAgent = await page.browser().userAgent()
  let userAgent = rawUserAgent.replace('HeadlessChrome/', 'Chrome/')
  if (userAgent.includes('Linux') && !userAgent.includes('Android')) {
    userAgent = userAgent.replace(/\(([^)]+)\)/, '(Windows NT 10.0; Win64; x64)')
  }

  const uaVersionMatch = userAgent.match(/Chrome\/([\d|.]+)/)
  const browserVersionMatch = (await page.browser().version()).match(/\/([\d|.]+)/)
  const legacyVersion = uaVersionMatch?.[1] ?? browserVersionMatch?.[1] ?? '0'
  const fullVersion = browserVersionMatch?.[1] ?? legacyVersion
  const majorVersion = Number.parseInt(legacyVersion.split('.')[0] ?? '0', 10) || 0
  const isAndroid = userAgent.includes('Android')
  const isMac = userAgent.includes('Mac OS X')
  const isWindows = userAgent.includes('Windows')
  const platform = isMac ? 'MacIntel' : isAndroid ? 'Android' : userAgent.includes('Linux') ? 'Linux' : 'Win32'
  const platformFull = isMac ? 'macOS' : isAndroid ? 'Android' : userAgent.includes('Linux') ? 'Linux' : 'Windows'

  const brandOrders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]
  const order = brandOrders[majorVersion % brandOrders.length] ?? brandOrders[0]!
  const escapedChars = [' ', ' ', ';']
  const greaseyBrand = `${escapedChars[order[0]!]}Not${escapedChars[order[1]!]}A${escapedChars[order[2]!]}Brand`
  const brands: { brand: string; version: string }[] = []
  brands[order[0]!] = { brand: greaseyBrand, version: '99' }
  brands[order[1]!] = { brand: 'Chromium', version: String(majorVersion) }
  brands[order[2]!] = { brand: 'Google Chrome', version: String(majorVersion) }
  const fullVersionList = brands.map(({ brand }) => ({
    brand,
    version: brand === greaseyBrand ? '99.0.0.0' : fullVersion,
  }))

  return {
    userAgent,
    platform,
    acceptLanguage: 'en-US,en',
    userAgentMetadata: {
      brands,
      fullVersion,
      fullVersionList,
      platform: platformFull,
      platformVersion: '',
      architecture: '',
      bitness: '',
      model: '',
      mobile: isAndroid,
    },
  }
}

async function sendUserAgentOverride(client: { send: (method: string, params?: Record<string, unknown>) => Promise<unknown> }, override: UserAgentOverride): Promise<void> {
  try { await client.send('Network.enable') } catch {}
  try { await client.send('Network.setUserAgentOverride', override as unknown as Record<string, unknown>) } catch {}
  try { await client.send('Emulation.setUserAgentOverride', override as unknown as Record<string, unknown>) } catch {}
}

function resolvePageClient(page: Page): { send: (method: string, params?: Record<string, unknown>) => Promise<unknown> } | null {
  const p = page as Page & { _client?: { send: Function } }
  return p._client ? { send: (m, p) => p._client!.send(m, p as never) } : null
}

const patchedClients = new WeakSet<object>()

function patchSourceUrl(page: Page): void {
  const client = resolvePageClient(page)
  if (!client) return
  const clientKey = client as object
  if (patchedClients.has(clientKey)) return
  patchedClients.add(clientKey)
  const originalSend = client.send.bind(client)
  client.send = async (method: string, params?: Record<string, unknown>) => {
    const next = async (payload?: Record<string, unknown>) => {
      try { return await originalSend(method, payload) } catch { return undefined }
    }
    if (!method || !params) return next(params)
    const key = method === 'Runtime.evaluate' ? 'expression' : method === 'Runtime.callFunctionOn' ? 'functionDeclaration' : null
    if (!key) return next(params)
    const value = params[key] as string | undefined
    if (typeof value !== 'string' || !value.includes('__puppeteer_evaluation_script__')) return next(params)
    const patchedParams = { ...params, [key]: value.replace('//# sourceURL=__puppeteer_evaluation_script__', '') }
    return next(patchedParams)
  }
}

async function applyStealthPatches(page: Page): Promise<void> {
  patchSourceUrl(page)

  if (!userAgentOverride) {
    userAgentOverride = await resolveUserAgentOverride(page)
  }

  const client = resolvePageClient(page)
  if (client) {
    await sendUserAgentOverride(client, userAgentOverride)
  }

  const injectionScript = buildStealthInjectionScript(stealthPatches)
  await page.evaluateOnNewDocument(injectionScript)
}

// =====================================================================
// Public API
// =====================================================================

export async function acquirePage(viewport?: { width: number; height: number }): Promise<Page> {
  if (!browser?.connected) {
    let executablePath = findChrome()
    if (!executablePath) {
      console.error('No Chrome found. Downloading Chromium...')
      executablePath = await downloadChrome()
    }
    const opts: PuppeteerLaunchOptions = {
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      ignoreDefaultArgs: [
        '--enable-automation',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-component-extensions-with-background-pages',
        '--disable-popup-blocking',
        '--disable-client-side-phishing-detection',
        '--allow-pre-commit-input',
        '--disable-ipc-flooding-protection',
        '--metrics-recording-only',
      ] as never,
    }
    browser = await puppeteer.launch(opts)
  }
  refCount++

  const page = await browser.newPage()
  await applyStealthPatches(page)
  if (viewport) {
    await page.setViewport(viewport)
  }
  return page
}

export function releasePage(): void {
  refCount--
  if (refCount <= 0 && browser) {
    browser.close().catch(() => {})
    browser = null
    refCount = 0
    browserSession = null
    userAgentOverride = null
  }
}
