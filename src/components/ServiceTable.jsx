import { Copy, ExternalLink, FolderOpen, MoreHorizontal, Pencil, Play, Square, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function RowMenu({ service, onEdit, onDelete, onOpenFolder }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const menuRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!menuRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnViewportChange = () => setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open]);

  const toggleMenu = (event) => {
    event.stopPropagation();
    if (!open) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const popoverWidth = 164;
      const popoverHeight = 132;
      setPosition({
        left: Math.max(10, Math.min(window.innerWidth - popoverWidth - 10, bounds.right - popoverWidth)),
        top: bounds.bottom + popoverHeight > window.innerHeight
          ? Math.max(10, bounds.top - popoverHeight - 6)
          : bounds.bottom + 6,
      });
    }
    setOpen((value) => !value);
  };

  const runAndClose = (action) => {
    setOpen(false);
    action(service);
  };

  return (
    <div className="row-menu" ref={menuRef}>
      <button
        type="button"
        className="icon-button quiet"
        aria-label={`打开 ${service.name} 的更多操作`}
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <MoreHorizontal size={19} />
      </button>
      {open ? createPortal(
        <div
          className="menu-popover"
          ref={popoverRef}
          role="menu"
          style={{ left: position.left, top: position.top }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => runAndClose(onEdit)}><Pencil size={15} /> 编辑服务</button>
          <button type="button" role="menuitem" onClick={() => runAndClose(onOpenFolder)}><FolderOpen size={15} /> 在 Finder 中打开</button>
          <button type="button" role="menuitem" className="danger" onClick={() => runAndClose(onDelete)}><Trash2 size={15} /> 删除记录</button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function CopyableValue({ value, label, className, onCopy }) {
  return (
    <button
      type="button"
      className={`copyable-value ${className}`}
      aria-label={`复制${label}：${value}`}
      onClick={(event) => {
        event.stopPropagation();
        onCopy(value, label);
      }}
    >
      <code>{value}</code>
      <Copy size={14} aria-hidden="true" />
    </button>
  );
}

function DirectoryValue({ service, onOpenFolder, onCopy }) {
  return (
    <div className="directory-value">
      <CopyableValue
        value={service.directory}
        label="项目目录"
        className="path-value directory-path"
        onCopy={onCopy}
      />
      <button
        type="button"
        className="directory-open-button"
        aria-label={`在 Finder 中打开项目目录：${service.directory}`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenFolder(service);
        }}
      >
        <FolderOpen size={14} />
        <span>打开</span>
      </button>
    </div>
  );
}

function ServiceRow({ service, selected, busy, onSelect, onToggle, onEdit, onDelete, onOpenFolder, onCopy }) {
  const isRunning = service.runtime.status === 'running';
  return (
    <tr className={selected ? 'selected' : ''} onClick={() => onSelect(service.id)}>
      <td>
        <button className="service-name-button" type="button" onClick={() => onSelect(service.id)}>
          <strong>{service.name}</strong>
          <span>{service.description || '本地应用服务'}</span>
        </button>
      </td>
      <td>
        <span className={`status-label ${isRunning ? 'running' : ''}`}>
          <span className="status-dot" />
          {isRunning ? '运行中' : '已停止'}
        </span>
      </td>
      <td>
        <div className="port-cell">
          <code>{service.port || '—'}</code>
          {isRunning && service.port ? (
            <a
              href={`http://127.0.0.1:${service.port}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`打开 ${service.name}`}
              onClick={(event) => event.stopPropagation()}
            ><ExternalLink size={13} /></a>
          ) : null}
        </div>
      </td>
      <td><DirectoryValue service={service} onOpenFolder={onOpenFolder} onCopy={onCopy} /></td>
      <td><CopyableValue value={service.startCommand} label="启动命令" className="command-value" onCopy={onCopy} /></td>
      <td>
        <div className="row-actions">
          <button
            type="button"
            className={`run-button ${isRunning ? 'stop' : ''}`}
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(service);
            }}
          >
            {isRunning ? <Square size={13} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            {busy ? '处理中' : isRunning ? '停止' : '启动'}
          </button>
          <RowMenu service={service} onEdit={onEdit} onDelete={onDelete} onOpenFolder={onOpenFolder} />
        </div>
      </td>
    </tr>
  );
}

export function ServiceTable({ services, selectedId, busyId, onSelect, onToggle, onEdit, onDelete, onOpenFolder, onCopy }) {
  return (
    <div className="table-shell">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>服务</th>
              <th>状态</th>
              <th>端口</th>
              <th>项目目录</th>
              <th>启动命令</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                selected={selectedId === service.id}
                busy={busyId === service.id}
                onSelect={onSelect}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onOpenFolder={onOpenFolder}
                onCopy={onCopy}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
