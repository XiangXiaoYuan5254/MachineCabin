import { mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import * as posix from './platform/posix.js';
import * as win32 from './platform/win32.js';
import { dataFile, updateStore } from './store.js';

const system = process.platform === 'win32' ? win32 : posix;
const logsDirectory = path.join(path.dirname(dataFile), 'logs');

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '');
}

function logPath(id) {
  return path.join(logsDirectory, `${safeId(id)}.log`);
}

async function pidExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function trackedProcessIsValid(service) {
  if (!(await pidExists(service.pid))) return false;
  if (!service.pidSignature) return false;
  return (await system.processSignature(service.pid)) === service.pidSignature;
}

export async function getRuntime(service) {
  const [tracked, portPids] = await Promise.all([
    trackedProcessIsValid(service),
    system.listeningPids(service.port),
  ]);
  const detectedPid = tracked ? service.pid : portPids[0] || null;
  const running = tracked || portPids.length > 0;
  return {
    status: running ? 'running' : 'stopped',
    pid: detectedPid,
    managed: tracked,
    manageable: tracked || Boolean(detectedPid && await system.processBelongsTo(detectedPid, service.directory)),
    startedAt: tracked ? service.startedAt || null : null,
  };
}

async function waitFor(check, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 160));
  }
  return false;
}

export async function startService(service) {
  const directoryStat = await stat(service.directory).catch(() => null);
  if (!directoryStat?.isDirectory()) throw Object.assign(new Error('项目目录不存在，请先编辑服务路径。'), { status: 400 });
  if ((await getRuntime(service)).status === 'running') return getRuntime(service);

  await mkdir(logsDirectory, { recursive: true });
  const pid = system.launch({
    command: service.startCommand,
    cwd: service.directory,
    env: { ...process.env, ...(service.env || {}) },
    logFile: logPath(service.id),
  });

  await new Promise((resolve) => setTimeout(resolve, 80));
  const signature = await system.processSignature(pid);
  await updateStore((state) => {
    const target = state.services.find((item) => item.id === service.id);
    if (target) {
      target.pid = pid;
      target.pidSignature = signature;
      target.startedAt = new Date().toISOString();
    }
  });

  if (service.port) {
    await waitFor(async () => (await system.listeningPids(service.port)).length > 0, 2600);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return getRuntime({ ...service, pid, pidSignature: signature, startedAt: new Date().toISOString() });
}

export async function stopService(service) {
  const runtime = await getRuntime(service);
  if (runtime.status === 'stopped') return runtime;
  if (!runtime.manageable || !runtime.pid) {
    throw Object.assign(new Error('端口由其他目录的进程占用，已避免误停。请先确认服务配置。'), { status: 409 });
  }

  await system.terminate(runtime.pid, { managed: runtime.managed });

  const stopped = await waitFor(async () => {
    const next = await getRuntime(service);
    return next.status === 'stopped';
  });
  if (!stopped) {
    throw Object.assign(new Error('服务没有在 4 秒内退出，请检查日志或在终端中停止。'), { status: 409 });
  }

  await updateStore((state) => {
    const target = state.services.find((item) => item.id === service.id);
    if (target) {
      target.pid = null;
      target.pidSignature = '';
      target.startedAt = null;
    }
  });
  return { status: 'stopped', pid: null, managed: false, manageable: false, startedAt: null };
}

export function openFolder(directory) {
  return system.openFolder(directory);
}

export async function readLogs(id, maxBytes = 96_000) {
  const filePath = logPath(id);
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) return '';
  const length = Math.min(fileStat.size, maxBytes);
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, Math.max(0, fileStat.size - length));
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}
