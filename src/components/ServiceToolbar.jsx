import { Plus, RefreshCw, Search } from 'lucide-react';

export function ServiceToolbar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  onDiscover,
  onAdd,
  discovering,
}) {
  return (
    <div className="toolbar">
      <label className="search-field">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索服务、目录或端口"
          aria-label="搜索服务、目录或端口"
        />
      </label>

      <select
        className="status-filter"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        aria-label="按运行状态筛选"
      >
        <option value="all">全部状态</option>
        <option value="running">运行中</option>
        <option value="stopped">已停止</option>
      </select>

      <button className="button secondary" type="button" onClick={onDiscover} disabled={discovering}>
        <RefreshCw size={17} className={discovering ? 'spin' : ''} />
        <span>{discovering ? '扫描中' : '扫描服务'}</span>
      </button>
      <button className="button primary" type="button" onClick={onAdd}>
        <Plus size={18} />
        <span>添加服务</span>
      </button>
    </div>
  );
}
