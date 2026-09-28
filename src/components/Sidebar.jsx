import { ListRestart, ScrollText, ServerCog, Settings2 } from 'lucide-react';

const navItems = [
  { id: 'services', label: '服务', icon: ServerCog },
  { id: 'logs', label: '运行日志', icon: ScrollText },
  { id: 'settings', label: '设置', icon: Settings2 },
];

export function Sidebar({ active, onChange, connected, version, updateVersion }) {
  return (
    <aside className="sidebar">
      <button className="brand" type="button" onClick={() => onChange('services')}>
        <span className="brand-mark"><ListRestart size={19} strokeWidth={2.2} /></span>
        <span>机舱</span>
      </button>

      <nav className="sidebar-nav" aria-label="主导航">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            className={`nav-item ${active === id ? 'active' : ''}`}
            key={id}
            type="button"
            onClick={() => onChange(id)}
          >
            <Icon size={18} strokeWidth={1.9} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className={`connection-dot ${connected ? '' : 'offline'}`} />
        <span>{connected ? '控制台已连接' : '等待连接'}</span>
        {updateVersion ? (
          <button className="update-pill" type="button" onClick={() => onChange('settings')} title={`发现新版本 v${updateVersion}`}>
            有更新
          </button>
        ) : (
          <small>{version ? `v${version}` : ''}</small>
        )}
      </div>
    </aside>
  );
}
