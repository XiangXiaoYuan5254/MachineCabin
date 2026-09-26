import { execFile as execFileCallback, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const runnerPath = fileURLToPath(new URL('../runner.js', import.meta.url));
const systemRoot = process.env.SystemRoot || 'C:\\Windows';
const powershellPath = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// 输出里包含中文路径，必须显式切到无 BOM 的 UTF-8，否则会按系统代码页（如 GBK）输出。
const snapshotScript = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Get-CimInstance Win32_Process | ForEach-Object {
  [pscustomobject]@{
    pid = $_.ProcessId
    ppid = $_.ParentProcessId
    started = $(if ($_.CreationDate) { [string]$_.CreationDate.Ticks } else { '' })
    commandLine = $_.CommandLine
    executable = $_.ExecutablePath
  }
} | ConvertTo-Json -Compress
`;

async function run(command, args, timeout = 10_000) {
  // windowsHide 必须显式开启，否则每次查询都会闪一下控制台窗口。
  const pending = execFile(command, args, {
    timeout,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  pending.child.stdin?.end();
  const { stdout } = await pending;
  return stdout;
}

function cached(loader, ttl) {
  let generation = 0;
  let value = null;
  let expires = 0;
  let pending = null;
  let pendingGeneration = -1;

  const get = () => {
    if (value && Date.now() < expires) return Promise.resolve(value);
    if (pending && pendingGeneration === generation) return pending;
    const started = generation;
    pendingGeneration = started;
    pending = loader().then((result) => {
      if (started === generation) {
        value = result;
        expires = Date.now() + ttl;
      }
      return result;
    }).finally(() => {
      if (pendingGeneration === started) pending = null;
    });
    return pending;
  };
  get.clear = () => {
    generation += 1;
    value = null;
  };
  return get;
}

export function parseProcessSnapshot(output) {
  const text = String(output || '').replace(/^\uFEFF/, '').trim();
  const parsed = text ? JSON.parse(text) : [];
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return new Map(list
    .filter((item) => Number.isInteger(item?.pid))
    .map((item) => [item.pid, {
      pid: item.pid,
      ppid: item.ppid,
      started: String(item.started || ''),
      commandLine: item.commandLine || '',
      executable: item.executable || '',
    }]));
}

// netstat 的状态列会随系统语言变化（如德语为 ABHÖREN），所以用“远端端口为 0”来识别监听中的 TCP 套接字。
export function parseListeningPorts(output) {
  const ports = new Map();
  for (const line of String(output || '').split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== 'TCP' || parts.length < 5) continue;
    const [, local, remote] = parts;
    const pid = Number(parts.at(-1));
    const port = Number(local.slice(local.lastIndexOf(':') + 1));
    if (!remote.endsWith(':0') || !Number.isInteger(pid) || pid <= 0 || !Number.isInteger(port)) continue;
    if (!ports.has(port)) ports.set(port, new Set());
    ports.get(port).add(pid);
  }
  return ports;
}

export function commandLineMentions(text, directory) {
  if (!text || !directory) return false;
  const haystack = text.toLowerCase().replaceAll('/', '\\');
  const needle = path.win32.resolve(directory).toLowerCase().replace(/\\+$/, '');
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const next = haystack[index + needle.length];
    if (next === undefined || next === '\\' || next === '"' || next === ' ') return true;
    index = haystack.indexOf(needle, index + 1);
  }
  return false;
}

const processSnapshot = cached(async () => parseProcessSnapshot(await run(powershellPath, [
  '-NoLogo', '-NoProfile', '-NonInteractive',
  '-EncodedCommand', Buffer.from(snapshotScript, 'utf16le').toString('base64'),
])), 1200);

const portSnapshot = cached(async () => parseListeningPorts(await run('netstat.exe', ['-ano'])), 800);

export function invalidate() {
  processSnapshot.clear();
  portSnapshot.clear();
}

export async function processSignature(pid) {
  try {
    return (await processSnapshot()).get(pid)?.started || '';
  } catch {
    return '';
  }
}

export async function listeningPids(port) {
  if (!port) return [];
  try {
    return [...((await portSnapshot()).get(port) || [])];
  } catch {
    return [];
  }
}

// Windows 读不到其他进程的工作目录，只能根据命令行或可执行文件路径是否落在服务目录内来判断归属。
export async function processBelongsTo(pid, directory) {
  try {
    const info = (await processSnapshot()).get(pid);
    return Boolean(info && (commandLineMentions(info.commandLine, directory) || commandLineMentions(info.executable, directory)));
  } catch {
    return false;
  }
}

// 服务先交给 runner.js 托管：runner 以 detached 方式启动，关掉机舱后服务仍会继续运行；
// runner 再用隐藏的控制台启动 cmd.exe，避免 npm、python 等命令弹出黑色窗口。
export function launch({ command, cwd, env, logFile }) {
  const child = spawn(process.execPath, [runnerPath], {
    cwd,
    env: {
      ...env,
      ELECTRON_RUN_AS_NODE: '1',
      MACHINE_CABIN_COMMAND: command,
      MACHINE_CABIN_LOG: logFile,
    },
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  });
  child.on('error', () => {});
  child.unref();
  invalidate();
  if (!child.pid) throw new Error('无法创建服务进程。');
  return child.pid;
}

export async function terminate(pid) {
  try {
    await run('taskkill.exe', ['/PID', String(pid), '/T', '/F'], 8000);
  } catch {
    // 进程可能已经退出，调用方会重新检查状态。
  }
  invalidate();
}

export async function openFolder(directory) {
  spawn('explorer.exe', [directory], { detached: true, stdio: 'ignore' }).unref();
}
