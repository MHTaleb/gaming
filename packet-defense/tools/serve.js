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
/**
 * The backlog board, served from outside www/ on purpose.
 *
 * www/ is the Capacitor webDir: everything in it ships inside the APK. The
 * backlog is a development artefact - a plan, a list of things that are broken,
 * and a record of what the game does not do yet - and none of that belongs in a
 * file a player downloads. Serving it from the project root keeps it out of the
 * bundle by construction rather than by remembering to exclude it.
 */
const BACKLOG = path.join(__dirname, '..', 'backlog');
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
function proxy(req, res, relayBase) {
  if (!relayBase) {
    res.writeHead(503, { 'Content-Type': 'application/json' }).end('{"error":"no relay configured"}');
    return;
  }
  let target;
  try {
    target = new URL(req.url.replace(/^\/coop/, '') || '/', relayBase);
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

function createServer(opts) {
  const relayBase = opts && opts.relay !== undefined ? opts.relay : RELAY;
  return http.createServer((req, res) => {
    if (req.url === '/coop' || req.url.startsWith('/coop/')) {
      proxy(req, res, relayBase);
      return;
    }

    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

    // The backlog board, and nothing else outside www/.
    if (urlPath === '/backlog' || urlPath.startsWith('/backlog/')) {
      const rel = urlPath.replace(/^\/backlog\/?/, '') || 'index.html';
      let file = path.join(BACKLOG, rel);
      if (!file.startsWith(BACKLOG)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      fs.stat(file, (err, stat) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
          return;
        }
        if (stat.isDirectory()) file = path.join(file, 'index.html');
        fs.readFile(file, (err2, data) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
            return;
          }
          res.writeHead(200, {
            'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
          });
          res.end(data);
        });
      });
      return;
    }

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
  });
}

function listen(server, port) {
  // 0 is a real value here - it means "any free port" - so this cannot be `||`.
  const p = port === undefined ? PORT : port;
  server.on('error', (err) => {
    /*
     * A taken port, said plainly.
     *
     * 8080 is the default and it is also the most likely port on the machine to
     * already be in use, so this is the first thing a lot of people hit. What
     * they used to get was a raw EADDRINUSE stack, which is indistinguishable
     * from the tool being broken - and this server also serves the backlog
     * board, so a confusing failure here is the difference between somebody
     * reading the plan and somebody giving up on it.
     */
    if (err.code === 'EADDRINUSE') {
      const next = p + 1;
      console.error('\nPort ' + p + ' is already in use.');
      console.error('  Something else is on it - on this machine that is often another project\'s dev server.');
      console.error('\n  Try a different port:\n');
      console.error('      PORT=' + next + ' node tools/serve.js');
      console.error('      PORT=' + next + ' RELAY=http://127.0.0.1:8081 node tools/serve.js\n');
      process.exit(1);
    }
    if (err.code === 'EACCES') {
      console.error('\nPort ' + p + ' needs privileges this process does not have.');
      console.error('  Ports below 1024 are reserved; use one above it.\n');
      process.exit(1);
    }
    console.error('\nThe server could not start: ' + err.message + '\n');
    process.exit(1);
  });

  return server.listen(p, HOST, () => {
    const shown = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
    // The bound port, not the requested one: 0 means "any free port" and the
    // number that matters afterwards is the one the OS chose.
    const bound = server.address().port;
    console.log('Packet Defense running at http://' + shown + ':' + bound);
    console.log('backlog board at        http://' + shown + ':' + bound + '/backlog/');
    console.log(RELAY ? 'co-op relay proxied at /coop -> ' + RELAY : 'co-op relay not configured (set RELAY=...)');
  });
}

/*
 * Run only when invoked directly.
 *
 * tools/screenshots.js - and, later, the co-op test - need a build on a scratch
 * port, and killing whatever is on 8080 to get one is not acceptable. Exported
 * rather than copied: there is one static server in this project, serving one
 * www/ with one set of headers. A second copy would drift, and the copy that
 * drifted would be the one the tests used.
 */
if (require.main === module) listen(createServer());

module.exports = { createServer: createServer, listen: listen, PORT: PORT };
