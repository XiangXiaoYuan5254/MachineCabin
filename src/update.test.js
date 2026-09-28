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
  tag_name: 'v1.2.0',
  html_url: 'https://github.com/XiangXiaoYuan5254/MachineCabin/releases/tag/v1.2.0',
  published_at: '2026-10-01T08:00:00Z',
  assets: [
    { name: 'MachineCabin-1.2.0.dmg', browser_download_url: 'https://example.com/MachineCabin-1.2.0.dmg' },
    { name: 'MachineCabin-Setup-1.2.0-x64.exe', browser_download_url: 'https://example.com/MachineCabin-Setup-1.2.0-x64.exe' },
  ],
};

test('parseRelease 按系统挑选安装包', () => {
  assert.deepEqual(parseRelease(release, 'darwin'), {
    version: '1.2.0',
    notesUrl: release.html_url,
    downloadUrl: 'https://example.com/MachineCabin-1.2.0.dmg',
    publishedAt: '2026-10-01T08:00:00Z',
  });
  assert.equal(parseRelease(release, 'win32').downloadUrl, 'https://example.com/MachineCabin-Setup-1.2.0-x64.exe');
});

test('parseRelease 没有对应安装包时链接到发布页', () => {
  assert.equal(parseRelease(release, 'linux').downloadUrl, release.html_url);
  assert.equal(parseRelease({ ...release, assets: [] }, 'darwin').downloadUrl, release.html_url);
});

test('parseRelease 拒绝没有版本号的数据', () => {
  assert.throws(() => parseRelease({ assets: [] }, 'darwin'), /版本号/);
});
