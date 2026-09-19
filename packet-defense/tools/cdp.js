/**
 * A small Chrome DevTools Protocol client.
 *
 * WHY NOT PLAYWRIGHT
 *
 * Taking a screenshot of this game means running it in a real browser: the board
 * is a canvas, and node has no canvas. Playwright is the obvious answer and it
 * is 150MB of browser download plus a dependency, in a project whose entire
 * dependency list is one devDependency for rasterising an SVG. Every other tool
 * here is plain node against the plain stdlib, and this keeps that true.
 *
 * It turns out Chrome already speaks a protocol over a WebSocket, and node 22
 * - which this project pins - has a WebSocket client built in. So the whole
 * client is: launch Chrome with a debugging port, read the port out of the
 * profile directory, connect, send JSON.
 *
 * This is not a general browser automation library. It is the four verbs the
 * screenshots need - go somewhere, run a function, click a thing, take a picture
 * - plus enough error reporting that a failing page says why rather than
 * producing a picture of a blank screen. PD-304 and PD-307 will want the same
 * four verbs, which is the reason this is its own file.
 *
 *   const { launch } = require('./cdp');
 *   const browser = await launch();
 *   const page = await browser.newPage({ width: 1920, height: 1080 });
 *   await page.goto('http://localhost:8099/');
 *   await page.eval(function () { return document.title; });
 *   await browser.close();
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* ------------------------------------------------------------------ *
 * Finding a browser
 * ------------------------------------------------------------------ */

/**
 * Places a Chromium might be, most specific first.
 *
 * CHROME_PATH wins so that CI, or anybody with an unusual install, can point at
 * the right binary without this list growing forever. GitHub's ubuntu runners
 * have google-chrome preinstalled; a developer who has ever run Playwright
 * already has one cached; VS Code's own markdown-pdf extension ships one too,
 * which is how this was first developed.
 */
function candidates() {
  const home = os.homedir();
  const out = [];
  if (process.env.CHROME_PATH) out.push(process.env.CHROME_PATH);
  if (process.env.CHROME_BIN) out.push(process.env.CHROME_BIN);

  // Playwright's cache. The directory is versioned, so it is scanned rather
  // than guessed at.
  const pw = path.join(home, '.cache', 'ms-playwright');
  for (const entry of readdir(pw)) {
    if (!/^chromium/.test(entry)) continue;
    // A plain (non-headless-shell) build: headless shell has no screenshot
    // surface worth trusting and no fonts configured the same way.
    if (/headless/.test(entry)) continue;
    out.push(path.join(pw, entry, 'chrome-linux64', 'chrome'));
    out.push(path.join(pw, entry, 'chrome-linux', 'chrome'));
    out.push(path.join(pw, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
  }

  // The chromium bundled with VS Code's markdown-pdf extension.
  const gs = path.join(home, '.vscode-server', 'data', 'User', 'globalStorage');
  for (const entry of readdir(gs)) {
    if (!/markdown-pdf/.test(entry)) continue;
    for (const v of readdir(path.join(gs, entry, 'chrome'))) {
      out.push(path.join(gs, entry, 'chrome', v, 'chrome-linux64', 'chrome'));
    }
  }

  out.push(
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  );
  return out;
}

function readdir(dir) {
  try { return fs.readdirSync(dir); } catch (err) { return []; }
}

/** The first candidate that is an executable file. Throws with the whole list. */
function findChrome(explicit) {
  const list = explicit ? [explicit].concat(candidates()) : candidates();
  for (const p of list) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      if (fs.statSync(p).isFile()) return p;
    } catch (err) { /* keep looking */ }
  }
  throw new Error(
    'No Chromium found. Set CHROME_PATH to one, or install Playwright\'s build with\n' +
    '  npx playwright install chromium\n' +
    'Looked in:\n  ' + list.join('\n  ')
  );
}

/* ------------------------------------------------------------------ *
 * The wire
 * ------------------------------------------------------------------ */

/**
 * One WebSocket to the browser, with requests matched to answers by id.
 *
 * Responses to `Target.*` carry no sessionId; responses to everything else do,
 * because the session was attached flat. Both are routed the same way - by id -
 * so a page command answered while a browser command is in flight cannot land on
 * the wrong promise.
 */
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const conn = { ws, seq: 0, pending: new Map(), waiting: new Map() };

    ws.addEventListener('open', () => resolve(conn));
    ws.addEventListener('error', () => reject(new Error('could not connect to ' + url)));

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (err) { return; }

      if (msg.id !== undefined) {
        const slot = conn.pending.get(msg.id);
        if (!slot) return;
        conn.pending.delete(msg.id);
        if (msg.error) slot.reject(new Error(msg.method + ' failed: ' + msg.error.message));
        else slot.resolve(msg.result);
        return;
      }

      const key = (msg.sessionId || '') + '|' + msg.method;
      const queue = conn.waiting.get(key);
      if (queue && queue.length) queue.shift()(msg.params);
    });
  });
}

function send(conn, method, params, sessionId) {
  const id = ++conn.seq;
  const frame = { id, method, params: params || {} };
  if (sessionId) frame.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    conn.pending.set(id, { resolve, reject, method });
    conn.ws.send(JSON.stringify(frame));
  });
}

/**
 * Resolve on the next occurrence of an event.
 *
 * Call this *before* the action that causes the event, since it only listens
 * from now on: `const loaded = once(...); await send(navigate); await loaded;`.
 */
function once(conn, method, sessionId) {
  const key = (sessionId || '') + '|' + method;
  return new Promise((resolve) => {
    const queue = conn.waiting.get(key) || [];
    queue.push(resolve);
    conn.waiting.set(key, queue);
  });
}

/* ------------------------------------------------------------------ *
 * A page
 * ------------------------------------------------------------------ */

class Page {
  constructor(conn, sessionId, viewport) {
    this.conn = conn;
    this.sessionId = sessionId;
    this.viewport = viewport;
    /** Everything the page said. Printed when something fails. */
    this.logs = [];
    /** Default ceiling on any single page call, in ms. */
    this.timeout = 30000;
  }

  send(method, params) { return send(this.conn, method, params, this.sessionId); }

  /** Wait for an event on this page. */
  once(method) { return once(this.conn, method, this.sessionId); }

  async goto(url) {
    const loaded = this.once('Page.loadEventFired');
    await this.send('Page.navigate', { url: url });
    await this.race(loaded, 'loading ' + url);
    return this;
  }

  /**
   * Give a promise a ceiling.
   *
   * A page evaluation is a message that may simply never be answered - the
   * script inside can await something that never happens, and the protocol has
   * no opinion about that. Without this, the whole tool hangs on a silent page
   * with no output at all, which is the least debuggable failure there is.
   * Learned the direct way: the first full run of tools/screenshots.js sat
   * there forever with a browser on screen and nothing to say.
   */
  race(promise, what, ms) {
    const limit = ms || this.timeout;
    let timer;
    return Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timed out after ' + limit + 'ms: ' + what + this.tail())), limit);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  /**
   * Run a function in the page and return its value.
   *
   * Passed as source rather than as a serialised closure so that it behaves like
   * code written for the page - it closes over nothing from here, which is the
   * only honest way to drive somebody else's app.
   */
  async eval(fn, ...args) {
    if (typeof fn === 'string') {
      return this.evalSource(fn);
    }
    const src = '(' + fn.toString() + ')(' + args.map((a) => JSON.stringify(a)).join(', ') + ')';
    return this.evalSource(src);
  }

  /**
   * Evaluate a string expression.
   *
   * Anything the page throws is re-thrown here with the page's own message,
   * because a swallowed exception in a scripted browser looks exactly like a
   * screenshot of an empty game - and that is a bug this project has already
   * spent an evening on once.
   */
  async evalSource(source) {
    const res = await this.race(this.send('Runtime.evaluate', {
      expression: source,
      returnByValue: true,
      awaitPromise: true,
      // Without this an exception is returned as data rather than raised.
      userGesture: true,
    }), 'running ' + source.slice(0, 90));
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      const text = (d.exception && (d.exception.description || d.exception.value)) || d.text;
      throw new Error('page threw: ' + text);
    }
    return res.result && res.result.value;
  }

  /** Poll an expression until it is truthy. Throws with the log if it never is. */
  async waitFor(expr, opts = {}) {
    const timeout = opts.timeout || 10000;
    const every = opts.every || 100;
    const until = Date.now() + timeout;
    for (;;) {
      let value;
      try { value = await (typeof expr === 'function' ? this.eval(expr, ...(opts.args || [])) : this.evalSource(expr)); }
      catch (err) { value = false; }
      if (value) return value;
      if (Date.now() > until) {
        throw new Error('timed out after ' + timeout + 'ms waiting for: ' +
          (typeof expr === 'string' ? expr : expr.toString().slice(0, 120)) + this.tail());
      }
      await new Promise((r) => setTimeout(r, every));
    }
  }

  /** Sleep, in the page's real time. */
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /**
   * Click something, with real input.
   *
   * Input.dispatchMouseEvent rather than element.click(), so handlers bound to
   * pointer events fire and so a mis-aimed selector fails here rather than
   * silently doing nothing.
   */
  async click(selector) {
    const box = await this.eval(function (sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, selector);
    if (!box) throw new Error('nothing to click at ' + selector + this.tail());

    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type: type, x: box.x, y: box.y, button: 'left', clickCount: 1,
      });
    }
    return this;
  }

  /** Type into an input, as keys, so listeners on input/keyup fire. */
  async type(selector, text) {
    await this.click(selector);
    for (const ch of text) await this.send('Input.dispatchKeyEvent', { type: 'char', text: ch });
    return this;
  }

  /** A PNG of the visible viewport. */
  async screenshot() {
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    return Buffer.from(res.data, 'base64');
  }

  /** The last few things the page said, for an error message. */
  tail(n) {
    const lines = this.logs.slice(-(n || 8));
    return lines.length ? '\n  page said:\n    ' + lines.join('\n    ') : '';
  }

  async close() {
    await send(this.conn, 'Target.closeTarget', { targetId: this.targetId }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ *
 * A browser
 * ------------------------------------------------------------------ */

class Browser {
  constructor(conn, child, profileDir, bin) {
    this.conn = conn;
    this.child = child;
    this.profileDir = profileDir;
    this.bin = bin;
    this.pages = [];
  }

  /**
   * Start a browser and a page showing about:blank.
   *
   * `--headless=new` is the modern headless, which is a real browser with no
   * window: canvas, fonts and images all behave as they do for a player. The old
   * `--headless` is a different rendering path entirely and would make these
   * screenshots a picture of something the game does not do.
   *
   * The debugging port is 0 on purpose so the OS picks a free one, and the
   * chosen port is read back from the profile directory. Hardcoding 9222 is how
   * two of these runs collide.
   */
  static async launch(opts = {}) {
    const bin = findChrome(opts.chrome);
    const width = opts.width || 1920;
    const height = opts.height || 1080;
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-chrome-'));

    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profileDir,
      '--window-size=' + width + ',' + height,
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--hide-scrollbars',
      // The game scores to music. A screenshot run should not.
      '--mute-audio',
      '--force-device-scale-factor=1',
      /*
       * Chrome throttles timers and refuses to animate frames in a window it
       * believes nobody is looking at. Headless is always such a window, and a
       * throttled tab means requestAnimationFrame does not fire, which means the
       * engine's tick loop never runs and every screenshot is of the first
       * frame. These four flags are what make the game actually advance.
       */
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--run-all-compositor-stages-before-draw',
      'about:blank',
    ];

    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const errors = [];
    child.on('error', (err) => errors.push(err));

    const port = await waitForPort(profileDir, child, () => stderr);
    if (!port) {
      child.kill('SIGKILL');
      throw new Error('Chrome did not open a debugging port.' +
        (stderr ? '\n  chrome said:\n    ' + stderr.trim().split('\n').slice(-6).join('\n    ') : ''));
    }

    const conn = await connect('ws://127.0.0.1:' + port.port + port.path);
    const browser = new Browser(conn, child, profileDir, bin);

    child.on('exit', (code) => {
      if (!browser.closing) browser.crashed = 'Chrome exited with code ' + code +
        (stderr ? '\n  chrome said:\n    ' + stderr.trim().split('\n').slice(-6).join('\n    ') : '');
    });
    return browser;
  }

  /** The version string, which is also a cheap proof the connection works. */
  version() {
    return send(this.conn, 'Browser.getVersion', {}).then((v) => v.product);
  }

  /** Open a page at an exact viewport, in CSS pixels. */
  async newPage(opts = {}) {
    const width = opts.width || 1920;
    const height = opts.height || 1080;
    const scale = opts.scale || 1;

    const { targetId } = await send(this.conn, 'Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send(this.conn, 'Target.attachToTarget', { targetId: targetId, flatten: true });

    const page = new Page(this.conn, sessionId, { width, height, scale });
    page.targetId = targetId;
    this.pages.push(page);

    await send(this.conn, 'Page.enable', {}, sessionId);
    await send(this.conn, 'Runtime.enable', {}, sessionId);
    await send(this.conn, 'Log.enable', {}, sessionId).catch(() => {});

    /*
     * An exact viewport, not a window size.
     *
     * --window-size includes browser chrome and is a hint; this is the actual
     * layout size the CSS sees, and it is what makes a 1920x1080 screenshot
     * 1920x1080 rather than 1904x1041.
     */
    await send(this.conn, 'Emulation.setDeviceMetricsOverride', {
      width: width,
      height: height,
      deviceScaleFactor: scale,
      mobile: false,
      screenOrientation: { type: 'landscapePrimary', angle: 90 },
    }, sessionId);

    // Gathered so a failure mid-scenario can print what the page complained
    // about rather than only where it stopped.
    for (const kind of ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded']) {
      this.watch(page, kind);
    }
    return page;
  }

  /** Route a page event into that page's log. */
  watch(page, method) {
    const key = page.sessionId + '|' + method;
    const queue = this.conn.waiting.get(key) || [];
    queue.push(function collect(params) {
      page.logs.push(describe(method, params));
      if (page.logs.length > 200) page.logs.shift();
      // Re-arm: keep listening for the life of the page.
      const again = page.conn.waiting.get(key) || [];
      again.push(collect);
      page.conn.waiting.set(key, again);
    });
    this.conn.waiting.set(key, queue);
  }

  async close() {
    this.closing = true;
    try { await send(this.conn, 'Browser.close', {}); } catch (err) { /* already gone */ }
    try { this.conn.ws.close(); } catch (err) { /* fine */ }
    // Chrome usually exits on its own; this is the belt to that braces.
    await new Promise((r) => setTimeout(r, 150));
    try { this.child.kill('SIGKILL'); } catch (err) { /* fine */ }
    try { fs.rmSync(this.profileDir, { recursive: true, force: true }); } catch (err) { /* fine */ }
  }
}

function describe(method, params) {
  if (method === 'Runtime.consoleAPICalled') {
    const args = (params.args || []).map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type));
    return '[' + params.type + '] ' + args.join(' ');
  }
  if (method === 'Runtime.exceptionThrown') {
    const d = params.exceptionDetails || {};
    return '[uncaught] ' + ((d.exception && d.exception.description) || d.text);
  }
  if (method === 'Log.entryAdded') {
    const e = params.entry || {};
    return '[' + e.level + '] ' + e.text;
  }
  return method;
}

/**
 * Wait for Chrome to write down which port it chose.
 *
 * The file appears before the socket is listening, so this also waits for a
 * connection to succeed - otherwise the first command races the browser and
 * fails with ECONNREFUSED on a slow machine.
 */
function waitForPort(profileDir, child, stderrOf) {
  const file = path.join(profileDir, 'DevToolsActivePort');
  const until = Date.now() + 20000;
  return new Promise((resolve) => {
    (function poll() {
      if (child.exitCode !== null) return resolve(null);
      let raw = '';
      try { raw = fs.readFileSync(file, 'utf8'); } catch (err) { raw = ''; }
      if (raw) {
        const [port, wsPath] = raw.split('\n');
        if (port && wsPath) return resolve({ port: Number(port), path: wsPath.trim() });
      }
      if (Date.now() > until) return resolve(null);
      setTimeout(poll, 60);
    })();
  });
}

module.exports = { launch: Browser.launch, Browser: Browser, findChrome: findChrome };
