import { useCallback, useEffect, useState } from 'react';
import { compareVersions, fetchLatestRelease } from './update';

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

// 启动时检查一次，之后每 6 小时再检查一次。检查失败时保留上一次的结果。
export function useUpdateCheck(meta) {
  const currentVersion = meta?.version;
  const platform = meta?.platform;
  const [state, setState] = useState({ checking: false, latest: null, error: '', checkedAt: null });

  const check = useCallback(async () => {
    if (!currentVersion) return;
    setState((current) => ({ ...current, checking: true, error: '' }));
    try {
      const latest = await fetchLatestRelease(platform);
      setState({ checking: false, latest, error: '', checkedAt: new Date() });
    } catch (error) {
      setState((current) => ({ ...current, checking: false, error: error.message, checkedAt: new Date() }));
    }
  }, [currentVersion, platform]);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, CHECK_INTERVAL);
    return () => window.clearInterval(timer);
  }, [check]);

  const available = Boolean(state.latest && currentVersion && compareVersions(state.latest.version, currentVersion) > 0);
  return { ...state, currentVersion, available, check };
}
