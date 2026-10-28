/** Launch an installed Chromium/Chrome/Edge with an empty disposable profile. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';

const option = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const candidates = [
  process.env.BROWSER_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap(root => ['Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'].map(file => path.join(root, file)))
];
const executable = option('--browser') || candidates.find(candidate => candidate && existsSync(candidate));
if (!executable) throw new Error('No installed Chromium browser found. Set BROWSER_PATH or use --browser <executable>.');
const profile = await mkdtemp(path.join(tmpdir(), 'pkuards-browser-'));
const server = createStaticServer();
let browser;
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = option('--base') || `http://127.0.0.1:${server.address().port}/PKUards/`;
  browser = spawn(executable, ['--headless=new', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  const port = await new Promise((resolve, reject) => {
    let output = '', settled = false;
    function finish(error, port) {
      if (settled) return;
      settled = true; clearTimeout(timeout);
      browser.removeListener('error', onError); browser.removeListener('exit', onExit);
      if (error) reject(error); else resolve(port);
    }
    const onError = error => finish(error);
    const onExit = code => finish(new Error(`Test browser exited early (${code}): ${output.slice(-2000)}`));
    const timeout = setTimeout(() => finish(new Error(`Timed out starting ${executable}: ${output.slice(-3000)}`)), 30000);
    browser.once('error', onError); browser.once('exit', onExit);
    browser.stderr.on('data', data => { output = (output + data).slice(-4000); });
    async function poll() {
      if (settled) return;
      try {
        const [port] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
        if (/^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535) { finish(null, port); return; }
      } catch (error) { if (error.code !== 'ENOENT') { finish(error); return; } }
      setTimeout(poll, 50);
    }
    poll();
  });
  const scripts = process.argv.includes('--soak') ? ['browser-soak.mjs'] : ['browser-qa.mjs', 'browser-mobile-qa.mjs', 'browser-offline-qa.mjs'];
  const extra = ['--games', '--until', '--source'].flatMap(name => option(name) ? [name, option(name)] : []);
  for (const script of scripts) {
    const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), '--port', port, '--base', base, ...extra], { stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    if (code !== 0) throw new Error(`${script} failed (${code})`);
  }
} finally {
  if (browser && browser.exitCode === null) {
    const exited = once(browser, 'exit'); browser.kill(); await exited;
  }
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
