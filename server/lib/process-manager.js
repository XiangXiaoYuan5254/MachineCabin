import { execFile as execFileCallback, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { dataFile, updateStore } from './store.js';

const execFile = promisify(execFileCallback);
const logsDirectory = path.join(path.dirname(dataFile), 'logs');

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '');
}

function logPath(id) {
  return path.join(logsDirectory, `${safeId(id)}.log`);
}

async function commandOutput(command, args) {
  try {
    const { stdout } = await execFile(command, args, { timeout: 2500, encoding: 'utf8' });
    return stdout.trim();
  } catch {
    return '';
  }
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

async function pidSignature(pid) {
  return commandOutput('ps', ['-p', String(pid), '-o', 'lstart=']);
}

async function pidCwd(pid) {
  const output = await commandOutput('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  return output.split('\n').find((line) => line.startsWith('n'))?.slice(1) || '';
}

async function listeningPids(port) {
  if (!port) return [];
  const output = await commandOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return [...new Set(output.split('\n').map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))];
}

async function trackedProcessIsValid(service) {
  if (!(await pidExists(service.pid))) return false;
  if (!service.pidSignature) return false;
  return (await pidSignature(service.pid)) === service.pidSignature;
}

function pathOwnsProcess(directory, cwd) {
  if (!directory || !cwd) return false;
  const relative = path.relative(path.resolve(directory), path.resolve(cwd));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function getRuntime(service) {
  const [tracked, portPids] = await Promise.all([
    trackedProcessIsValid(service),
    listeningPids(service.port),
  ]);
  const detectedPid = tracked ? service.pid : portPids[0] || null;
  const cwd = detectedPid ? await pidCwd(detectedPid) : '';
  const running = tracked || portPids.length > 0;
  return {
    status: running ? 'running' : 'stopped',
    pid: detectedPid,
    managed: tracked,
    manageable: tracked || pathOwnsProcess(service.directory, cwd),
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
  const descriptor = openSync(logPath(service.id), 'a');
  const shell = process.env.SHELL || '/bin/zsh';
  const child = spawn(shell, ['-lc', service.startCommand], {
    cwd: service.directory,
    env: { ...process.env, ...(service.env || {}) },
    detached: true,
    stdio: ['ignore', descriptor, descriptor],
  });
  child.unref();
  closeSync(descriptor);

  await new Promise((resolve) => setTimeout(resolve, 80));
  const signature = await pidSignature(child.pid);
  await updateStore((state) => {
    const target = state.services.find((item) => item.id === service.id);
    if (target) {
      target.pid = child.pid;
      target.pidSignature = signature;
      target.startedAt = new Date().toISOString();
    }
  });

  if (service.port) {
    await waitFor(async () => (await listeningPids(service.port)).length > 0, 2600);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return getRuntime({ ...service, pid: child.pid, pidSignature: signature, startedAt: new Date().toISOString() });
}

export async function stopService(service) {
  const runtime = await getRuntime(service);
  if (runtime.status === 'stopped') return runtime;
  if (!runtime.manageable || !runtime.pid) {
    throw Object.assign(new Error('端口由其他目录的进程占用，已避免误停。请先确认服务配置。'), { status: 409 });
  }

  try {
    if (runtime.managed) process.kill(-runtime.pid, 'SIGTERM');
    else process.kill(runtime.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }

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
