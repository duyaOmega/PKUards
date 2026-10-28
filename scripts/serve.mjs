import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };
export function createStaticServer() { return http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.writeHead(302, { Location: '/PKUards/' }); res.end(); return; }
    if (pathname.startsWith('/PKUards/')) pathname = pathname.slice('/PKUards'.length);
    const absolute = path.resolve(root, '.' + pathname);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    let file = absolute;
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 · 未找到页面'); }
}); }
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1–65535');
  const server = createStaticServer();
  server.on('error', error => { console.error(`启动失败：${error.message}。可使用 npm start -- --port 4174 更换端口。`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/PKUards/`;
    console.log(`PKUARDS · 燕园争锋\nLocal: ${url}\n按 Ctrl+C 停止服务。`);
    if (process.argv.includes('--open') && process.platform === 'win32') {
      const opener = spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' });
      opener.on('error', () => console.log('请手动在浏览器打开上述地址。'));
      opener.unref();
    }
  });
}
