// Windows 安装包的端到端冒烟测试，供 CI 在 npm run dist:win 之后运行：
// 静默安装 → 启动 App → 通过 API 启动服务 → 关闭 App 后服务仍在运行 → 重新打开 App 并停止服务。
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') throw new Error('只能在 Windows 上运行。');

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(rootDirectory, 'build', 'windows');
const installerName = (await readdir(outputDirectory)).find((name) => /^MachineCabin-Setup-.*\.exe$/.test(name));
assert.ok(installerName, '找不到安装包，请先运行 npm run dist:win');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function eventually(label, check, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`);
    await sleep(300);
  }
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

console.log(`安装 ${installerName}`);
execFileSync(path.join(outputDirectory, installerName), ['/S'], { stdio: 'inherit' });
const programs = path.join(process.env.LOCALAPPDATA, 'Programs');
const installDirectory = (await readdir(programs))
  .map((name) => path.join(programs, name))
  .find((directory) => existsSync(path.join(directory, 'MachineCabin.exe')));
assert.ok(installDirectory, `没有在 ${programs} 下找到安装后的 MachineCabin.exe`);
const executable = path.join(installDirectory, 'MachineCabin.exe');
console.log(`已安装到 ${installDirectory}`);

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'machine-cabin-smoke-data-'));
const serverLog = path.join(dataDirectory, 'console-server.log');

async function launchApp() {
  const logBefore = existsSync(serverLog) ? await readFile(serverLog, 'utf8') : '';
  const app = spawn(executable, [], {
    env: { ...process.env, VBCODING_DATA_DIR: dataDirectory },
    detached: true,
    stdio: 'ignore',
  });
  app.unref();
  // 默认端口被占用时 App 会换一个端口，以服务端日志里新写入的地址为准。
  const consoleUrl = await eventually('控制台启动', async () => {
    const log = await readFile(serverLog, 'utf8');
    return log.slice(logBefore.length).match(/API 已启动：(http:\/\/127\.0\.0\.1:\d+)/)?.[1];
  }, 60_000);
  await eventually('控制台响应', async () => (await fetch(`${consoleUrl}/api/meta`)).ok);
  console.log(`App 已启动（PID ${app.pid}），控制台：${consoleUrl}`);
  return { pid: app.pid, consoleUrl };
}

async function closeApp({ pid, consoleUrl }) {
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).CloseMainWindow() | Out-Null`]);
  await eventually('App 退出', async () => {
    const reachable = await fetch(`${consoleUrl}/api/meta`).then(() => true).catch(() => false);
    return !reachable;
  });
  console.log('App 已关闭');
}

async function api(consoleUrl, method, pathname, body) {
  const response = await fetch(`${consoleUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${pathname} 失败：${payload.message}`);
  return payload;
}

const serviceDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'machine-cabin-smoke-service-')));
const servicePort = await freePort();
await writeFile(path.join(serviceDirectory, 'server.js'), `
require('node:http').createServer((request, response) => response.end('ok')).listen(${servicePort}, '127.0.0.1', () => {
  console.log('服务已就绪 ${servicePort}');
});
`);
const consoleProbe = `
Add-Type -Namespace Probe -Name Native -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr hWnd);
'@
$window = [Probe.Native]::GetConsoleWindow()
$visible = ($window -ne [System.IntPtr]::Zero) -and [Probe.Native]::IsWindowVisible($window)
"console-visible=$visible"
`;

let app = await launchApp();
const meta = await api(app.consoleUrl, 'GET', '/api/meta');
assert.equal(meta.platform, 'win32');
assert.equal(path.dirname(meta.dataFile), dataDirectory);

const { service: web } = await api(app.consoleUrl, 'POST', '/api/services', {
  name: 'smoke-web', directory: serviceDirectory, port: servicePort, startCommand: 'node server.js',
});
const started = await api(app.consoleUrl, 'POST', `/api/services/${web.id}/start`);
assert.equal(started.runtime.status, 'running');
assert.equal(started.runtime.managed, true);
assert.equal(await eventually('服务响应', async () => (await fetch(`http://127.0.0.1:${servicePort}/`)).text()), 'ok');
await eventually('服务日志', async () => (await api(app.consoleUrl, 'GET', `/api/services/${web.id}/logs`)).logs.includes(`服务已就绪 ${servicePort}`));
console.log('✓ 服务已启动，日志中文正常');

const probeDirectory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'machine-cabin-smoke-probe-')));
await writeFile(path.join(probeDirectory, 'probe.ps1'), consoleProbe);
const { service: probe } = await api(app.consoleUrl, 'POST', '/api/services', {
  name: 'smoke-probe', directory: probeDirectory, startCommand: 'powershell -NoProfile -ExecutionPolicy Bypass -File probe.ps1',
});
await api(app.consoleUrl, 'POST', `/api/services/${probe.id}/start`);
const probeLogs = await eventually('控制台窗口检测', async () => {
  const { logs } = await api(app.consoleUrl, 'GET', `/api/services/${probe.id}/logs`);
  return logs.includes('console-visible=') ? logs : null;
});
assert.match(probeLogs, /console-visible=False/);
console.log('✓ 服务没有弹出控制台窗口');

await closeApp(app);
assert.equal(await (await fetch(`http://127.0.0.1:${servicePort}/`)).text(), 'ok');
console.log('✓ 关闭 App 后服务仍在运行');

app = await launchApp();
const { services } = await api(app.consoleUrl, 'GET', '/api/services');
const restored = services.find((service) => service.id === web.id);
assert.equal(restored.runtime.status, 'running');
assert.equal(restored.runtime.managed, true);
const stopped = await api(app.consoleUrl, 'POST', `/api/services/${web.id}/stop`);
assert.equal(stopped.runtime.status, 'stopped');
const reachable = await fetch(`http://127.0.0.1:${servicePort}/`).then(() => true).catch(() => false);
assert.equal(reachable, false);
console.log('✓ 重新打开 App 后识别并停止了服务');

await closeApp(app);
console.log('冒烟测试通过');
