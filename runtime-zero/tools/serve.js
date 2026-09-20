#!/usr/bin/env node
'use strict';
// Serve only the RPG board's four public files. Never expose repo/config files.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', 'backlog');
const FILES = new Map([
  ['/backlog/', ['index.html', 'text/html; charset=utf-8']],
  ['/backlog/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/backlog/board.js', ['board.js', 'text/javascript; charset=utf-8']],
  ['/backlog/board.css', ['board.css', 'text/css; charset=utf-8']],
  ['/backlog/backlog.json', ['backlog.json', 'application/json; charset=utf-8']]
]);
function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, {Allow:'GET, HEAD'}); res.end(); return; }
  let pathname;
  try { pathname = new URL(req.url, 'http://127.0.0.1').pathname; }
  catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/' || pathname === '/backlog') { res.writeHead(302, {Location:'/backlog/'}); res.end(); return; }
  const entry = FILES.get(pathname);
  if (!entry) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(ROOT, entry[0]), (err, data) => {
    if (err) { res.writeHead(500); res.end('Board file unavailable'); return; }
    res.writeHead(200, {'Content-Type':entry[1], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 8090);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1-65535');
  const server = http.createServer(handler);
  server.on('error', (err) => { console.error(err.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Runtime Zero board: http://127.0.0.1:${port}/backlog/`));
}
module.exports = { handler };
