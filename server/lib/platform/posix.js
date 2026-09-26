import { execFile as execFileCallback, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';
import { pathContains } from './paths.js';

const execFile = promisify(execFileCallback);

async function commandOutput(command, args) {
  try {
    const { stdout } = await execFile(command, args, { timeout: 2500, encoding: 'utf8' });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function processSignature(pid) {
  return commandOutput('ps', ['-p', String(pid), '-o', 'lstart=']);
}

export async function listeningPids(port) {
  if (!port) return [];
  const output = await commandOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  return [...new Set(output.split('\n').map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))];
}

async function processCwd(pid) {
  const output = await commandOutput('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  return output.split('\n').find((line) => line.startsWith('n'))?.slice(1) || '';
}

export async function processBelongsTo(pid, directory) {
  return pathContains(directory, await processCwd(pid));
}

export function launch({ command, cwd, env, logFile }) {
  const descriptor = openSync(logFile, 'a');
  const shell = process.env.SHELL || '/bin/zsh';
  const child = spawn(shell, ['-lc', command], {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', descriptor, descriptor],
  });
  child.unref();
  closeSync(descriptor);
  return child.pid;
}

export async function terminate(pid, { managed }) {
  try {
    // 由控制台启动的服务有独立的进程组，整组停止才能带上 npm 派生出的子进程。
    process.kill(managed ? -pid : pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

export async function openFolder(directory) {
  if (os.platform() === 'darwin') {
    await execFile('open', [directory]);
    return;
  }
  spawn('xdg-open', [directory], { detached: true, stdio: 'ignore' }).unref();
}

export function invalidate() {}
