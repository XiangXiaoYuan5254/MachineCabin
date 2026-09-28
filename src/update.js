// 读取官网上的版本信息检查新版本：script/package_dmg.sh 和 script/package_windows.mjs
// 打包时生成 latest.json / latest-windows.json，随官网一起部署。请求由界面发出而不是服务端，
// 因为 WKWebView 和 Electron 都会沿用系统代理设置，Node.js 的 fetch 不会。
const DOWNLOADS_URL = 'https://helloxxy.com/works/machine-cabin/downloads/';
const RELEASE_NOTES_URL = 'https://github.com/XiangXiaoYuan5254/MachineCabin/releases/tag/';

const releaseFiles = {
  darwin: 'latest.json',
  win32: 'latest-windows.json',
};

function versionParts(version) {
  return String(version).trim().replace(/^v/i, '').split(/[-+]/)[0].split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

// 把官网的版本信息转成界面需要的信息；没有当前系统的安装包时，下载链接退回到官网下载区。
export function parseRelease(release, platform) {
  const version = String(release?.version || '').trim().replace(/^v/i, '');
  if (!version) throw new Error('没有读到最新版本号。');
  const installer = releaseFiles[platform] && release.file;
  return {
    version,
    notesUrl: `${RELEASE_NOTES_URL}v${version}`,
    downloadUrl: installer ? `${DOWNLOADS_URL}${encodeURIComponent(installer)}` : new URL('../#download', DOWNLOADS_URL).href,
    publishedAt: release.date || null,
  };
}

export async function fetchLatestRelease(platform) {
  let response;
  try {
    response = await fetch(`${DOWNLOADS_URL}${releaseFiles[platform] || releaseFiles.darwin}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('无法连接官网，请检查网络后重试。');
  }
  if (!response.ok) throw new Error(`官网返回了错误（${response.status}）。`);
  return parseRelease(await response.json(), platform);
}
