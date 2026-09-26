import crypto from 'node:crypto';
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { discoverServices } from './lib/discovery.js';
import { getRuntime, openFolder, readLogs, startService, stopService } from './lib/process-manager.js';
import { dataFile, expandPath, projectRoot, readStore, updateStore } from './lib/store.js';

const app = express();
const port = Number(process.env.CONSOLE_PORT || 49152);
const host = process.env.CONSOLE_HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function normalizeService(input, existing = {}) {
  const name = String(input.name || '').trim();
  const directory = expandPath(String(input.directory || '').trim());
  const startCommand = String(input.startCommand || '').trim();
  const servicePort = input.port === '' || input.port == null ? null : Number(input.port);
  if (!name) throw httpError(400, '请填写服务名称。');
  if (!directory) throw httpError(400, '请填写项目目录。');
  if (!startCommand) throw httpError(400, '请填写启动命令。');
  if (servicePort != null && (!Number.isInteger(servicePort) || servicePort < 1 || servicePort > 65535)) {
    throw httpError(400, '端口号必须是 1 到 65535 之间的整数。');
  }
  return {
    ...existing,
    name,
    description: String(input.description || '').trim(),
    directory,
    port: servicePort,
    startCommand,
    env: input.env && typeof input.env === 'object' && !Array.isArray(input.env) ? input.env : {},
    healthCheck: String(input.healthCheck || '').trim(),
    updatedAt: new Date().toISOString(),
  };
}

async function findService(id) {
  const state = await readStore();
  const service = state.services.find((item) => item.id === id);
  if (!service) throw httpError(404, '没有找到这个服务。');
  return service;
}

async function serializeService(service) {
  return { ...service, runtime: await getRuntime(service) };
}

app.get('/api/meta', async (_request, response) => {
  const state = await readStore();
  response.json({
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    dataFile,
    consoleUrl: `http://${host}:${port}`,
    settings: state.settings,
  });
});

app.get('/api/services', async (_request, response) => {
  const state = await readStore();
  const services = await Promise.all(state.services.map(serializeService));
  response.json({ services });
});

app.post('/api/services', async (request, response) => {
  const directory = expandPath(String(request.body.directory || '').trim());
  const directoryStat = await stat(directory).catch(() => null);
  if (!directoryStat?.isDirectory()) throw httpError(400, '项目目录不存在，请输入一个有效的绝对路径。');
  const service = normalizeService(request.body, {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    pid: null,
    pidSignature: '',
    startedAt: null,
  });
  await updateStore((state) => {
    if (state.services.some((item) => path.resolve(item.directory) === service.directory)) {
      throw httpError(409, '这个项目目录已经添加过了。');
    }
    state.services.push(service);
  });
  response.status(201).json({ service: await serializeService(service) });
});

app.put('/api/services/:id', async (request, response) => {
  const existing = await findService(request.params.id);
  const service = normalizeService(request.body, existing);
  const directoryStat = await stat(service.directory).catch(() => null);
  if (!directoryStat?.isDirectory()) throw httpError(400, '项目目录不存在，请输入一个有效的绝对路径。');
  await updateStore((state) => {
    const index = state.services.findIndex((item) => item.id === request.params.id);
    state.services[index] = service;
  });
  response.json({ service: await serializeService(service) });
});

app.delete('/api/services/:id', async (request, response) => {
  const service = await findService(request.params.id);
  if ((await getRuntime(service)).status === 'running') throw httpError(409, '请先停止服务，再删除记录。');
  await updateStore((state) => {
    state.services = state.services.filter((item) => item.id !== request.params.id);
  });
  response.json({ ok: true });
});

app.post('/api/services/:id/start', async (request, response) => {
  const service = await findService(request.params.id);
  response.json({ runtime: await startService(service) });
});

app.post('/api/services/:id/stop', async (request, response) => {
  const service = await findService(request.params.id);
  response.json({ runtime: await stopService(service) });
});

app.get('/api/services/:id/logs', async (request, response) => {
  await findService(request.params.id);
  response.json({ logs: await readLogs(request.params.id) });
});

app.post('/api/services/:id/open-folder', async (request, response) => {
  const service = await findService(request.params.id);
  await openFolder(service.directory);
  response.json({ ok: true });
});

app.post('/api/discover', async (_request, response) => {
  const state = await readStore();
  const roots = state.settings.discoveryRoots.map(expandPath);
  const candidates = await discoverServices(roots);
  const knownDirectories = new Set(state.services.map((service) => path.resolve(service.directory)));
  const additions = candidates
    .filter((candidate) => !knownDirectories.has(path.resolve(candidate.directory)))
    .map((candidate) => normalizeService(candidate, {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      pid: null,
      pidSignature: '',
      startedAt: null,
    }));
  if (additions.length) {
    await updateStore((nextState) => {
      const currentDirectories = new Set(nextState.services.map((service) => path.resolve(service.directory)));
      nextState.services.push(...additions.filter((service) => !currentDirectories.has(service.directory)));
    });
  }
  response.json({ added: additions.length, scanned: candidates.length });
});

app.put('/api/settings', async (request, response) => {
  const discoveryRoots = Array.isArray(request.body.discoveryRoots)
    ? request.body.discoveryRoots.map((root) => expandPath(String(root).trim())).filter(Boolean)
    : [];
  if (!discoveryRoots.length) throw httpError(400, '请至少保留一个扫描目录。');
  const invalid = [];
  for (const root of discoveryRoots) {
    const rootStat = await stat(root).catch(() => null);
    if (!rootStat?.isDirectory()) invalid.push(root);
  }
  if (invalid.length) throw httpError(400, `这些扫描目录不存在：${invalid.join('、')}`);
  const settings = await updateStore((state) => {
    state.settings = { ...state.settings, discoveryRoots };
    return state.settings;
  });
  response.json({ settings });
});

app.use(express.static(path.join(projectRoot, 'dist')));
app.use((request, response, next) => {
  if (request.path.startsWith('/api/')) return next();
  return response.sendFile(path.join(projectRoot, 'dist', 'index.html'));
});

app.use((error, _request, response, _next) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);
  response.status(status).json({ message: error.message || '控制台服务发生错误。' });
});

app.listen(port, host, () => {
  console.log(`机舱控制台 API 已启动：http://${host}:${port}`);
});
