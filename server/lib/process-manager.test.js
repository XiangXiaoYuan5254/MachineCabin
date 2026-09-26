import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// store.js 在加载时读取数据目录，所以必须先设置环境变量再动态导入。
process.env.VBCODING_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'machine-cabin-data-'));
const { getRuntime, readLogs, startService, stopService } = await import('./process-manager.js');
const { readStore, updateStore } = await import('./store.js');

const serverScript = `
const http = require('node:http');
const port = Number(process.env.PORT);
http.createServer((request, response) => response.end('ok')).listen(port, '127.0.0.1', () => {
  console.log('服务已就绪 ' + port);
});
`;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function eventually(check, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function createService() {
  // macOS 的临时目录经过 /var -> /private/var 符号链接，lsof 报告的是真实路径。
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'machine-cabin-service-')));
  await writeFile(path.join(directory, 'server.js'), serverScript);
  const port = await freePort();
  const service = {
    id: crypto.randomUUID(),
    name: 'sample',
    directory,
    port,
    startCommand: 'node server.js',
    env: { PORT: String(port) },
    pid: null,
    pidSignature: '',
    startedAt: null,
  };
  await updateStore((state) => {
    state.services.push(service);
  });
  return service;
}

async function storedService(id) {
  return (await readStore()).services.find((service) => service.id === id);
}

function startManually(service, cwd) {
  const child = spawn(process.execPath, [path.join(service.directory, 'server.js')], {
    cwd,
    env: { ...process.env, PORT: String(service.port) },
    stdio: 'ignore',
    windowsHide: true,
  });
  return child;
}

test('starts, tracks, logs and stops a service it launched', { timeout: 90_000 }, async () => {
  const service = await createService();

  const started = await startService(service);
  assert.equal(started.status, 'running');
  assert.equal(started.managed, true);

  const tracked = await storedService(service.id);
  assert.ok(tracked.pid > 0);
  assert.ok(tracked.pidSignature, 'process signature should be recorded');

  const response = await eventually(() => fetch(`http://127.0.0.1:${service.port}/`).then((result) => result.text()).catch(() => ''));
  assert.equal(response, 'ok');
  assert.match(await eventually(() => readLogs(service.id).then((logs) => (logs.includes('服务已就绪') ? logs : ''))), /服务已就绪 \d+/);

  const runtime = await getRuntime(tracked);
  assert.equal(runtime.status, 'running');
  assert.equal(runtime.managed, true);

  const stopped = await stopService(tracked);
  assert.equal(stopped.status, 'stopped');
  assert.equal((await getRuntime(await storedService(service.id))).status, 'stopped');
  const reachable = await fetch(`http://127.0.0.1:${service.port}/`).then(() => true).catch(() => false);
  assert.equal(reachable, false);
});

test('stops an untracked process that runs from the service directory', { timeout: 60_000 }, async () => {
  const service = await createService();
  const child = startManually(service, service.directory);
  try {
    const runtime = await eventually(async () => {
      const next = await getRuntime(service);
      return next.status === 'running' ? next : null;
    });
    assert.equal(runtime.managed, false);
    assert.equal(runtime.manageable, true);
    assert.equal((await stopService(service)).status, 'stopped');
  } finally {
    child.kill();
  }
});

test('refuses to stop a process from another directory that holds the same port', { timeout: 60_000 }, async () => {
  const service = await createService();
  const outsider = await createService();
  const child = startManually({ ...outsider, port: service.port }, outsider.directory);
  try {
    const runtime = await eventually(async () => {
      const next = await getRuntime(service);
      return next.status === 'running' ? next : null;
    });
    assert.equal(runtime.manageable, false);
    await assert.rejects(stopService(service), { status: 409 });
  } finally {
    child.kill();
  }
});

// 服务启动的命令会继承 cmd.exe 的控制台；这里让 PowerShell 自己报告这个控制台窗口是否可见。
const consoleProbe = `
Add-Type -Namespace Probe -Name Native -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr hWnd);
'@
$window = [Probe.Native]::GetConsoleWindow()
$visible = ($window -ne [System.IntPtr]::Zero) -and [Probe.Native]::IsWindowVisible($window)
"console-visible=$visible"
`;

test('runs Windows services without a visible console window', { skip: process.platform !== 'win32', timeout: 60_000 }, async () => {
  const service = await createService();
  await writeFile(path.join(service.directory, 'probe.ps1'), consoleProbe);
  const probe = { ...service, port: null, startCommand: 'powershell -NoProfile -ExecutionPolicy Bypass -File probe.ps1' };
  await updateStore((state) => {
    Object.assign(state.services.find((item) => item.id === service.id), probe);
  });
  await startService(probe);
  const logs = await eventually(() => readLogs(service.id).then((text) => (text.includes('console-visible=') ? text : '')), 30_000);
  assert.match(logs, /console-visible=False/);
});
