// Production-build benchmark server. Uses the same backend as the local preview.
// node scripts/performance/serve.mjs [build directory] [port] [API delay in ms]
import { createServer, request } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || 4190);
const delay = Number(process.argv[4] || 0);
const compress = process.argv.includes('--gzip');
const backendPort = Number(process.env.BENCHMARK_BACKEND_PORT || 7090);
const probe = await readFile(new URL('./probe.js', import.meta.url), 'utf8');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/_/')) {
    if (delay) await new Promise((done) => setTimeout(done, delay));
    const upstream = request({ hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: req.headers }, (reply) => {
      if (compress && /gzip/.test(req.headers['accept-encoding'] || '') && /application\/json/.test(reply.headers['content-type'] || '') && !reply.headers['content-encoding']) {
        const chunks = [];
        reply.on('data', (chunk) => chunks.push(chunk));
        reply.on('end', () => {
          const data = gzipSync(Buffer.concat(chunks), { level: 5 });
          res.writeHead(reply.statusCode, { ...reply.headers, 'content-length': data.length, 'content-encoding': 'gzip', vary: 'Accept-Encoding' });
          res.end(data);
        });
      } else { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); }
    });
    upstream.on('error', () => { res.writeHead(502); res.end('Backend unavailable'); });
    req.pipe(upstream);
    return;
  }
  try {
    let file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + sep)) file = resolve(root, 'index.html');
    if (!(await stat(file).catch(() => null))?.isFile()) file = resolve(root, 'index.html');
    let data = await readFile(file);
    if (extname(file) === '.html') data = Buffer.from(data.toString().replace('<head>', '<head><script>' + probe + '</script>'));
    const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': /\/(assets|fonts)\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache' };
    if (compress && /gzip/.test(req.headers['accept-encoding'] || '') && /\.(html|js|css|svg)$/.test(file) && data.length > 1024) {
      data = gzipSync(data, { level: 5 }); headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(500); res.end('Build unavailable');
  }
}).listen(port, '0.0.0.0', () => console.log(`Performance build: http://localhost:${port} (API delay ${delay} ms)`));
