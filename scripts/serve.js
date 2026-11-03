// Zero-dependency static file server for the demos. Bound to loopback only.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 5173;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/') {
      res.writeHead(302, { location: '/demos/' }).end();
      return;
    }
    let file = resolve(join(root, normalize(decodeURIComponent(pathname))));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Strata dev server: http://localhost:${port}/`);
});
