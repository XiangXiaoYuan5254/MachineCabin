import { Download, FolderPlus, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canChooseDirectories, chooseDirectories } from '../platform.js';

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '';
}

function formatTime(value) {
  return value ? value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
}

function updateStatus(update) {
  if (update.checking) return '正在检查更新…';
  if (update.available) {
    const published = formatDate(update.latest.publishedAt);
    return `发现新版本 v${update.latest.version}${published ? `（${published} 发布）` : ''}`;
  }
  if (update.error) return `检查失败：${update.error}`;
  if (update.latest) return `已是最新版本 · ${formatTime(update.checkedAt)} 检查`;
  return '尚未检查';
}

function parseRoots(text) {
  return text.split('\n').map((root) => root.trim()).filter(Boolean);
}

export function SettingsView({ meta, update, onSave, onError }) {
  const [roots, setRoots] = useState('');
  const [saving, setSaving] = useState(false);
  // 只在保存过的扫描目录变化时同步，避免其他设置（例如忽略的版本）覆盖正在编辑的内容。
  const savedRoots = (meta?.settings?.discoveryRoots || []).join('\n');

  useEffect(() => {
    setRoots(savedRoots);
  }, [savedRoots]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ discoveryRoots: parseRoots(roots) });
    } finally {
      setSaving(false);
    }
  };

  const addDirectories = async () => {
    try {
      const picked = await chooseDirectories();
      setRoots((current) => {
        const existing = parseRoots(current);
        const added = picked.filter((root) => !existing.includes(root));
        return [...existing, ...added].join('\n');
      });
    } catch (error) {
      onError(error.message);
    }
  };

  return (
    <div className="settings-view">
      <div className="section-heading">
        <h1>设置</h1>
        <p>配置自动扫描范围和控制台行为。</p>
      </div>
      <section className="settings-section">
        <div>
          <h2>服务扫描目录</h2>
          <p>“扫描服务”会在这些目录下查找 package.json、pyproject.toml、go.mod、Cargo.toml 和 Package.swift。</p>
        </div>
        <textarea value={roots} onChange={(event) => setRoots(event.target.value)} rows={5} aria-label="服务扫描目录" />
        <div className="settings-field-footer">
          {canChooseDirectories ? (
            <button className="button secondary compact" type="button" onClick={addDirectories}>
              <FolderPlus size={15} /> 添加文件夹…
            </button>
          ) : null}
          <small>{canChooseDirectories ? '也可以每行手动输入一个绝对路径' : '每行一个绝对路径'}，最多向下扫描 4 层。</small>
        </div>
      </section>
      <section className="settings-section system-info">
        <div><span>控制台地址</span><code>{meta?.consoleUrl || '—'}</code></div>
        <div><span>运行环境</span><code>{meta ? `${meta.platform} · ${meta.arch}` : '—'}</code></div>
        <div><span>配置文件</span><code>{meta?.dataFile || '—'}</code></div>
      </section>
      <button className="button primary settings-save" type="button" onClick={save} disabled={saving}>
        <Save size={17} /> {saving ? '保存中…' : '保存设置'}
      </button>

      <section className="settings-section update-section">
        <div>
          <h2>版本更新</h2>
          <p>机舱会在启动时和之后每 6 小时到官网 helloxxy.com 查看是否有新版本，只读取公开的版本信息。安装新版本不会影响已记录的服务和设置。</p>
        </div>
        <div className="update-status">
          <div>
            <strong>当前版本 {update.currentVersion ? `v${update.currentVersion}` : '—'}</strong>
            <span className={update.available ? 'highlight' : ''}>{updateStatus(update)}</span>
          </div>
          {update.available ? (
            <>
              <a className="text-link" href={update.latest.notesUrl} target="_blank" rel="noreferrer">更新内容</a>
              <a className="button primary" href={update.latest.downloadUrl} target="_blank" rel="noreferrer">
                <Download size={17} /> 下载 v{update.latest.version}
              </a>
            </>
          ) : null}
          <button className="button secondary" type="button" onClick={update.check} disabled={update.checking || !update.currentVersion}>
            <RefreshCw size={17} className={update.checking ? 'spin' : ''} /> 检查更新
          </button>
        </div>
      </section>
    </div>
  );
}
