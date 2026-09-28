// 通过 GitHub Releases 检查新版本。请求由界面发出而不是服务端，
// 因为 WKWebView 和 Electron 都会沿用系统代理设置，Node.js 的 fetch 不会。
const LATEST_RELEASE_API = 'https://api.github.com/repos/XiangXiaoYuan5254/MachineCabin/releases/latest';

const installerPatterns = {
  darwin: /\.dmg$/i,
  win32: /\.exe$/i,
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

// 把 GitHub Release 转成界面需要的信息；找不到当前系统的安装包时，下载链接退回到发布页。
export function parseRelease(release, platform) {
  const version = String(release?.tag_name || '').trim().replace(/^v/i, '');
  if (!version) throw new Error('没有读到最新版本号。');
  const pattern = installerPatterns[platform];
  const installer = pattern && (release.assets || []).find((asset) => pattern.test(asset.name));
  return {
    version,
    notesUrl: release.html_url,
    downloadUrl: installer?.browser_download_url || release.html_url,
    publishedAt: release.published_at || null,
  };
}

export async function fetchLatestRelease(platform) {
  let response;
  try {
    response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('无法连接 GitHub，请检查网络后重试。');
  }
  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub 访问次数暂时超限，请稍后再试。');
  }
  if (!response.ok) throw new Error(`GitHub 返回了错误（${response.status}）。`);
  return parseRelease(await response.json(), platform);
}
