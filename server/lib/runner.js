// Windows 专用的服务托管进程，由 platform/win32.js 启动。
// 它以隐藏的控制台运行启动命令，把输出追加到服务日志，并随命令一起退出。
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

const { MACHINE_CABIN_COMMAND: command, MACHINE_CABIN_LOG: logFile } = process.env;
const env = { ...process.env };
for (const key of ['MACHINE_CABIN_COMMAND', 'MACHINE_CABIN_LOG', 'ELECTRON_RUN_AS_NODE']) delete env[key];
// 让 Python 在输出被重定向时也使用 UTF-8，日志里的中文才不会乱码。
env.PYTHONIOENCODING ||= 'utf-8';

const log = createWriteStream(logFile, { flags: 'a' });
// 所有 stdio 都不继承时，libuv 会以 CREATE_NO_WINDOW 创建 cmd.exe，它派生的子进程共用这个隐藏控制台。
const child = spawn(`chcp 65001 >nul & ${command}`, {
  shell: true,
  env,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
child.on('error', (error) => {
  log.write(`[机舱] 启动命令失败：${error.message}\n`);
});
child.on('close', (code) => {
  log.end(() => process.exit(code ?? 1));
});
