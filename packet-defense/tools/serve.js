#!/usr/bin/env node
/**
 * Tiny zero-dependency static server for local testing.
 * Usage: npm run serve   ->  http://localhost:8080
 *
 * It also reverse-proxies `/coop/*` to the co-op relay, so local co-op runs
 * same-origin exactly as it does in production.
 *
 * That is not a convenience. The game's CSP is `connect-src 'self'`, and the
 * alternative to this proxy is putting a second origin in the policy - which
 * would mean the development build and the shipped build have different security
 * policies, and the one that is exercised least is the one that ships. Proxying
 * also means the `?relay=` override in net.js is only ever needed for pointing a
 * dev build at somebody else's server, not for the ordinary case.
 *
 *   node tools/serve.js                # static only
 *   RELAY=http://127.0.0.1:8081 node tools/serve.js   # with co-op
 *
 * The deploy's nginx does the same thing with `location /coop/`.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'www');
const PORT = Number(process.env.PORT || 8080);
// Bind interface. Defaults to all interfaces for local dev; the staging
// deploy sets HOST=127.0.0.1 so only nginx can reach the app directly.
const HOST = process.env.HOST || '0.0.0.0';
// Where the relay is. Absent means the co-op screen stays hidden rather than
// offering a button that cannot work.
const RELAY = process.env.RELAY || '';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Forward `/coop/<rest>` to the relay and stream the answer back.
 *
 * The event stream has to be piped rather than buffered, and `res.flushHeaders`
 * is what stops node holding the response until the first byte - which for a
 * stream that may go quiet for fifteen seconds looks exactly like a hang.
 */
function proxy(req, res) {
  if (!RELAY) {
    res.writeHead(503, { 'Content-Type': 'application/json' }).end('{"error":"no relay configured"}');
    return;
  }
  let target;
  try {
    target = new URL(req.url.replace(/^\/coop/, '') || '/', RELAY);
  } catch (err) {
    res.writeHead(400).end('Bad relay url');
    return;
  }

  const upstream = http.request({
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: target.host }),
  }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });

  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end('{"error":"relay unreachable"}');
  });

  req.pipe(upstream);
}

http
  .createServer((req, res) => {
    if (req.url === '/coop' || req.url.startsWith('/coop/')) {
      proxy(req, res);
      return;
    }

    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      fs.readFile(filePath, (err2, data) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      });
    });
  })
  .listen(PORT, HOST, () => {
    const shown = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
    console.log(`Packet Defense running at http://${shown}:${PORT}`);
    console.log(RELAY ? `co-op relay proxied at /coop -> ${RELAY}` : 'co-op relay not configured (set RELAY=...)');
  });
