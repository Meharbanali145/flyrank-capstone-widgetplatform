// Serves the demo "customer website" on its own port (its own ORIGIN), so the widget on it
// is proven to work cross-origin for real, not simulated. Reads no user-supplied paths.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SITE_PORT ?? 5500);
const API_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
const WIDGET_ID = process.env.DEMO_WIDGET_ID;

if (!WIDGET_ID) {
  console.error('Set DEMO_WIDGET_ID to a real widget publicId (see README: "Run the demo site").');
  process.exit(1);
}

const template = readFileSync(path.join(root, 'demo/customer-site/index.html'), 'utf8');
const page = template.replaceAll('{{API_BASE}}', API_BASE).replaceAll('{{WIDGET_ID}}', WIDGET_ID);

http.createServer((req, res) => {
  if (req.method !== 'GET' || req.url.split('?')[0] !== '/') { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(page);
}).listen(PORT, () => console.log(`Customer demo site: http://localhost:${PORT}  (widget loads from ${API_BASE})`));
