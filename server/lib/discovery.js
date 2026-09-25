import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './store.js';

const markerFiles = ['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'Package.swift'];
const ignoredDirectories = new Set([
  '.git', '.build', '.cache', '.codex', '.idea', '.next', '.nuxt', '.output', '.turbo',
  '.venv', 'build', 'coverage', 'dist', 'node_modules', 'target', 'vendor', '__pycache__',
]);
const portPattern = /(?:PORT\s*=\s*|--port(?:=|\s+)|-p\s+)(\d{2,5})/i;

function findPort(text) {
  const match = text?.match(portPattern);
  return match ? Number(match[1]) : null;
}

async function readSmallFile(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.size > 128_000) return '';
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function inferPackageService(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const scripts = manifest.scripts || {};
  const preference = ['dev', 'start', 'serve', 'preview'];
  const scriptName = preference.find((name) => scripts[name]) || Object.keys(scripts)[0];
  if (!scriptName) return null;
  const script = String(scripts[scriptName]);
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  let port = findPort(script);

  if (!port) {
    const viteConfigNames = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.cjs'];
    for (const name of viteConfigNames) {
      const config = await readSmallFile(path.join(directory, name));
      const configMatch = config.match(/\bport\s*:\s*(\d{2,5})/);
      if (configMatch) {
        port = Number(configMatch[1]);
        break;
      }
    }
  }

  if (!port) {
    if (dependencies.vite) port = 5173;
    else if (dependencies.next || dependencies['react-scripts']) port = 3000;
    else if (dependencies.nuxt) port = 3000;
  }

  return {
    name: manifest.name || path.basename(directory),
    description: manifest.description || 'Node.js 应用',
    directory,
    port,
    startCommand: `npm run ${scriptName}`,
    env: {},
    healthCheck: '',
    discoveredFrom: 'package.json',
  };
}

async function inferPythonService(directory, marker) {
  const names = await readdir(directory).catch(() => []);
  let startCommand = 'python main.py';
  let port = 8000;
  if (names.includes('manage.py')) {
    startCommand = 'python manage.py runserver';
  } else if (names.includes('app.py')) {
    const appText = await readSmallFile(path.join(directory, 'app.py'));
    startCommand = appText.includes('FastAPI') ? 'uvicorn app:app --reload' : 'python app.py';
    port = appText.includes('Flask') ? 5000 : 8000;
  } else if (names.includes('main.py')) {
    const mainText = await readSmallFile(path.join(directory, 'main.py'));
    if (mainText.includes('FastAPI')) startCommand = 'uvicorn main:app --reload';
    port = findPort(mainText) || port;
  }
  return {
    name: path.basename(directory),
    description: 'Python 应用',
    directory,
    port,
    startCommand,
    env: {},
    healthCheck: '',
    discoveredFrom: marker,
  };
}

export async function inferService(directory, marker) {
  if (marker === 'package.json') return inferPackageService(directory);
  if (marker === 'pyproject.toml' || marker === 'requirements.txt') return inferPythonService(directory, marker);
  if (marker === 'go.mod') {
    return { name: path.basename(directory), description: 'Go 服务', directory, port: 8080, startCommand: 'go run .', env: {}, healthCheck: '', discoveredFrom: marker };
  }
  if (marker === 'Cargo.toml') {
    return { name: path.basename(directory), description: 'Rust 服务', directory, port: 8080, startCommand: 'cargo run', env: {}, healthCheck: '', discoveredFrom: marker };
  }
  if (marker === 'Package.swift') {
    return { name: path.basename(directory), description: 'Swift 应用', directory, port: null, startCommand: 'swift run', env: {}, healthCheck: '', discoveredFrom: marker };
  }
  return null;
}

async function scanDirectory(directory, depth, seen, candidates) {
  const resolved = path.resolve(directory);
  if (seen.has(resolved) || resolved === projectRoot) return;
  seen.add(resolved);

  let entries;
  try {
    entries = await readdir(resolved, { withFileTypes: true });
  } catch {
    return;
  }

  const names = new Set(entries.map((entry) => entry.name));
  const marker = markerFiles.find((file) => names.has(file));
  if (marker) {
    try {
      const candidate = await inferService(resolved, marker);
      if (candidate) candidates.push(candidate);
    } catch {
      // A malformed manifest should not abort the rest of the scan.
    }
    return;
  }

  if (depth <= 0) return;
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !ignoredDirectories.has(entry.name) && !entry.name.startsWith('.'))
    .map((entry) => scanDirectory(path.join(resolved, entry.name), depth - 1, seen, candidates)));
}

export async function discoverServices(roots, maxDepth = 4) {
  const candidates = [];
  const seen = new Set();
  await Promise.all(roots.map((root) => scanDirectory(root, maxDepth, seen, candidates)));
  return candidates.sort((first, second) => first.name.localeCompare(second.name));
}
