import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, parseRelease } from './update.js';

test('compareVersions 按数字逐段比较版本号', () => {
  assert.equal(compareVersions('1.2.0', '1.1.0'), 1);
  assert.equal(compareVersions('1.10.0', '1.9.3'), 1);
  assert.equal(compareVersions('v1.1.0', '1.1.0'), 0);
  assert.equal(compareVersions('1.1', '1.1.0'), 0);
  assert.equal(compareVersions('1.1.0', '1.1.1'), -1);
  assert.equal(compareVersions('2.0.0-beta.1', '1.9.0'), 1);
});

const release = {
  version: '1.2.0',
  file: 'MachineCabin-1.2.0.dmg',
  size: 1396533,
  arch: 'arm64',
  date: '2026-10-01',
};

test('parseRelease 读取官网的版本信息', () => {
  assert.deepEqual(parseRelease(release, 'darwin'), {
    version: '1.2.0',
    notesUrl: 'https://github.com/XiangXiaoYuan5254/MachineCabin/releases/tag/v1.2.0',
    downloadUrl: 'https://helloxxy.com/works/machine-cabin/downloads/MachineCabin-1.2.0.dmg',
    publishedAt: '2026-10-01',
  });
  const windows = { ...release, file: 'MachineCabin-Setup-1.2.0-x64.exe' };
  assert.equal(parseRelease(windows, 'win32').downloadUrl, 'https://helloxxy.com/works/machine-cabin/downloads/MachineCabin-Setup-1.2.0-x64.exe');
});

test('parseRelease 没有对应安装包时链接到官网下载区', () => {
  assert.equal(parseRelease(release, 'linux').downloadUrl, 'https://helloxxy.com/works/machine-cabin/#download');
  assert.equal(parseRelease({ version: '1.2.0' }, 'darwin').downloadUrl, 'https://helloxxy.com/works/machine-cabin/#download');
});

test('parseRelease 拒绝没有版本号的数据', () => {
  assert.throws(() => parseRelease({ file: 'MachineCabin-1.2.0.dmg' }, 'darwin'), /版本号/);
});
