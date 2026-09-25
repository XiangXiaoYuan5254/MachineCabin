import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(serverDirectory, '../..');
const dataDirectory = process.env.VBCODING_DATA_DIR
  ? path.resolve(process.env.VBCODING_DATA_DIR)
  : path.join(projectRoot, '.vbcoding');
export const dataFile = path.join(dataDirectory, 'services.json');

const initialState = {
  version: 1,
  services: [],
  settings: {
    discoveryRoots: [path.dirname(projectRoot)],
    refreshInterval: 5000,
  },
};

let updateQueue = Promise.resolve();

export function expandPath(value) {
  if (!value) return '';
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

async function ensureStore() {
  await mkdir(dataDirectory, { recursive: true });
  try {
    await readFile(dataFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(dataFile, `${JSON.stringify(initialState, null, 2)}\n`, 'utf8');
  }
}

export async function readStore() {
  await ensureStore();
  const raw = await readFile(dataFile, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    ...initialState,
    ...parsed,
    services: Array.isArray(parsed.services) ? parsed.services : [],
    settings: { ...initialState.settings, ...(parsed.settings || {}) },
  };
}

async function writeStore(state) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryFile, dataFile);
}

export async function updateStore(updater) {
  let result;
  const operation = updateQueue.catch(() => undefined).then(async () => {
    const state = await readStore();
    result = await updater(state);
    await writeStore(state);
  });
  updateQueue = operation.catch(() => undefined);
  await operation;
  return result;
}
