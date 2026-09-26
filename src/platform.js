// 控制台只监听 127.0.0.1，浏览器所在的系统就是服务运行的系统。
const userAgent = navigator.userAgent;
const isWindows = /Windows/i.test(userAgent);
const isMac = /Macintosh|Mac OS X/i.test(userAgent);

export const openInFileManager = isWindows ? '在资源管理器中打开' : isMac ? '在 Finder 中打开' : '在文件管理器中打开';

export const directoryPlaceholder = isWindows ? 'C:\\Users\\me\\Projects\\order-api' : '/Users/me/Projects/order-api';

const platformNames = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

export function platformName(platform) {
  return platformNames[platform] || platform;
}
