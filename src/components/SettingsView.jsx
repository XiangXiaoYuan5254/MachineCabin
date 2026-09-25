import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';

export function SettingsView({ meta, onSave }) {
  const [roots, setRoots] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRoots((meta?.settings?.discoveryRoots || []).join('\n'));
  }, [meta]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ discoveryRoots: roots.split('\n').map((root) => root.trim()).filter(Boolean) });
    } finally {
      setSaving(false);
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
        <small>每行一个绝对路径，最多向下扫描 4 层。</small>
      </section>
      <section className="settings-section system-info">
        <div><span>控制台地址</span><code>{meta?.consoleUrl || '—'}</code></div>
        <div><span>运行环境</span><code>{meta ? `${meta.platform} · ${meta.arch}` : '—'}</code></div>
        <div><span>配置文件</span><code>{meta?.dataFile || '—'}</code></div>
      </section>
      <button className="button primary settings-save" type="button" onClick={save} disabled={saving}>
        <Save size={17} /> {saving ? '保存中…' : '保存设置'}
      </button>
    </div>
  );
}
