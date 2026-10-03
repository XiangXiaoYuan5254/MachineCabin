import { createWriteStream, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, utilityProcess } from 'electron';

const HOST = '127.0.0.1';
const PREFERRED_PORT = Number(process.env.CONSOLE_PORT) || 49152;
const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(desktopDirectory, '..', 'server', 'index.js');

// 与 macOS 版保持一致：数据放在“应用数据/机舱”（Windows 上是 %APPDATA%\机舱）。
app.setPath('userData', process.env.VBCODING_DATA_DIR || path.join(app.getPath('appData'), '机舱'));
const dataDirectory = app.getPath('userData');
const serverLogFile = path.join(dataDirectory, 'console-server.log');

let mainWindow = null;
let serverProcess = null;
let consoleUrl = `http://${HOST}:${PREFERRED_PORT}/`;
let phase = 'idle';
let failureMessage = '';
let startupRun = 0;
let quitting = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function serverResponds(url) {
  try {
    const response = await fetch(new URL('api/meta', url), { signal: AbortSignal.timeout(1200) });
    return response.ok && (await response.text()).includes('dataFile');
  } catch {
    return false;
  }
}

function listenOn(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(null));
    probe.listen(port, HOST, () => {
      const { port: boundPort } = probe.address();
      probe.close(() => resolve(boundPort));
    });
  });
}

// 49152 是 Windows 动态端口范围的起点，可能被占用或被 Hyper-V/WSL 保留，这时退回系统分配的空闲端口。
async function choosePort() {
  const port = (await listenOn(PREFERRED_PORT)) || (await listenOn(0));
  if (!port) throw new Error('没有可用的本地端口。');
  return port;
}

function render() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (phase === 'ready') {
    mainWindow.loadURL(consoleUrl);
  } else {
    mainWindow.loadFile(path.join(desktopDirectory, 'status.html'), {
      query: { state: phase === 'failed' ? 'failed' : 'connecting', message: failureMessage },
    });
  }
}

function showPhase(nextPhase, message = '') {
  phase = nextPhase;
  failureMessage = message;
  render();
}

function launchServer(port) {
  mkdirSync(dataDirectory, { recursive: true });
  const log = createWriteStream(serverLogFile, { flags: 'a' });
  const child = utilityProcess.fork(serverEntry, [], {
    serviceName: '机舱控制台服务',
    stdio: 'pipe',
    env: {
      ...process.env,
      VBCODING_DATA_DIR: dataDirectory,
      VBCODING_DISCOVERY_ROOT: app.getPath('home'),
      CONSOLE_HOST: HOST,
      CONSOLE_PORT: String(port),
    },
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  child.once('exit', (code) => {
    log.end();
    if (serverProcess !== child) return;
    serverProcess = null;
    if (quitting) return;
    if (phase === 'ready') {
      showPhase('failed', `服务端已退出（状态码 ${code}）。`);
    } else if (phase === 'connecting') {
      showPhase('failed', `服务端启动失败（状态码 ${code}）。可在 ${serverLogFile} 查看日志。`);
    }
  });
  serverProcess = child;
}

async function start() {
  if (phase === 'connecting' || phase === 'ready') return;
  const run = ++startupRun;
  showPhase('connecting');

  consoleUrl = `http://${HOST}:${PREFERRED_PORT}/`;
  if (await serverResponds(consoleUrl)) {
    if (run === startupRun) showPhase('ready');
    return;
  }

  try {
    const port = await choosePort();
    if (run !== startupRun) return;
    consoleUrl = `http://${HOST}:${port}/`;
    launchServer(port);
  } catch (error) {
    showPhase('failed', error.message);
    return;
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (run !== startupRun || phase !== 'connecting') return;
    if (await serverResponds(consoleUrl)) {
      if (run === startupRun && phase === 'connecting') showPhase('ready');
      return;
    }
    await sleep(200);
  }
  if (run === startupRun) showPhase('failed', `服务端在 12 秒内没有响应。可在 ${serverLogFile} 查看日志。`);
}

async function stop() {
  startupRun += 1;
  phase = 'idle';
  const child = serverProcess;
  serverProcess = null;
  if (!child) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([exited, sleep(3000)]);
}

async function restart() {
  await stop();
  await start();
}

function isConsolePage(url) {
  try {
    return new URL(url).origin === new URL(consoleUrl).origin;
  } catch {
    return false;
  }
}

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1480, workArea.width),
    height: Math.min(920, workArea.height),
    minWidth: Math.min(1100, workArea.width),
    minHeight: Math.min(720, workArea.height),
    title: '机舱',
    backgroundColor: '#f7f9f8',
    show: false,
    webPreferences: {
      preload: path.join(desktopDirectory, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const { webContents } = mainWindow;
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (isConsolePage(url)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 表示导航被新的导航取消，不是真正的错误。
    if (!isMainFrame || errorCode === -3 || !isConsolePage(validatedURL) || phase !== 'ready') return;
    showPhase('failed', `无法加载控制台页面：${errorDescription}`);
  });

  render();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '服务控制台',
      submenu: [
        { label: '重新连接', accelerator: 'CmdOrCtrl+Shift+R', click: () => restart() },
        { label: '在默认浏览器中打开', accelerator: 'CmdOrCtrl+Shift+O', click: () => shell.openExternal(consoleUrl) },
        { label: '打开数据目录', click: () => shell.openPath(dataDirectory) },
        ...(isMac ? [] : [{ type: 'separator' }, { label: '退出', role: 'quit' }]),
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },
  ]));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  ipcMain.on('console:retry', (event) => {
    if (mainWindow && event.sender === mainWindow.webContents) restart();
  });

  ipcMain.handle('dialog:chooseDirectories', async (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return [];
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      buttonLabel: '添加',
      properties: ['openDirectory', 'multiSelections', 'createDirectory'],
    });
    return canceled ? [] : filePaths;
  });

  app.on('before-quit', () => {
    quitting = true;
    serverProcess?.kill();
  });
  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.xxy.machinecabin');
    buildMenu();
    createWindow();
    start();
  });
}
