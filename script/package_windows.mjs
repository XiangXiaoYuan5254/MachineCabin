// 构建 Windows 安装包（NSIS），并把它和 latest-windows.json 同步到官网的 downloads/ 目录。
// macOS 和 Windows 上都可以运行：npm run dist:win
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arch, build, Platform } from 'electron-builder';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDownloads = path.join(rootDirectory, 'website', 'downloads');
const { version } = JSON.parse(await readFile(path.join(rootDirectory, 'package.json'), 'utf8'));

execSync('npm run build', { cwd: rootDirectory, stdio: 'inherit' });
const artifacts = await build({
  projectDir: rootDirectory,
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
});
const installer = artifacts.find((file) => file.endsWith('.exe'));
if (!installer) throw new Error('electron-builder 没有生成安装包。');

const contents = await readFile(installer);
const fileName = path.basename(installer);
const release = {
  version,
  file: fileName,
  size: contents.length,
  sha256: createHash('sha256').update(contents).digest('hex'),
  arch: 'x64',
  date: new Date().toLocaleDateString('sv-SE'),
};

// 官网只保留最新版本，历史版本交给 GitHub Releases
await mkdir(siteDownloads, { recursive: true });
for (const name of await readdir(siteDownloads)) {
  if (/^MachineCabin-Setup-.*\.exe$/.test(name) && name !== fileName) await rm(path.join(siteDownloads, name));
}
await copyFile(installer, path.join(siteDownloads, fileName));
await writeFile(path.join(siteDownloads, 'latest-windows.json'), `${JSON.stringify(release, null, 2)}\n`);

console.log(`安装包:  ${installer}`);
console.log(`大小:    ${(release.size / 1024 / 1024).toFixed(1)} MB`);
console.log(`SHA-256: ${release.sha256}`);
console.log('已同步到 website/downloads/，并更新 latest-windows.json');
console.log(`发布到 GitHub Releases 时请上传同一个文件：${fileName}`);
