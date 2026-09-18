#!/usr/bin/env node
/**
 * Tiny zero-dependency static server for local testing.
 * Usage: npm run serve   ->  http://localhost:8080
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'www');
const PORT = Number(process.env.PORT || 8080);

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

http
  .createServer((req, res) => {
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
  .listen(PORT, () => console.log(`Neon Stack running at http://localhost:${PORT}`));
