import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inferService } from './discovery.js';

test('infers a Vite service and configured port from package metadata', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'machine-cabin-discovery-'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({
    name: 'sample-app',
    scripts: { dev: 'vite --port 4310' },
    devDependencies: { vite: '^6.0.0' },
  }));
  const service = await inferService(directory, 'package.json');
  assert.equal(service.name, 'sample-app');
  assert.equal(service.startCommand, 'npm run dev');
  assert.equal(service.port, 4310);
});
