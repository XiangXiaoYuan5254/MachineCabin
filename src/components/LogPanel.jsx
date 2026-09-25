import { Copy, Minus, RefreshCw, Terminal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';

export function LogPanel({ service, expanded = false, onClose, onToast }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    const load = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const result = await api.getLogs(service.id);
        if (active) setLogs(result.logs || '还没有日志。启动服务后，输出会显示在这里。');
      } catch (error) {
        if (active) setLogs(`无法读取日志：${error.message}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(() => load(true), 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [service]);

  if (!service) return null;

  const copyLogs = async () => {
    await navigator.clipboard.writeText(logs);
    onToast('日志已复制');
  };

  return (
    <section className={`log-panel ${expanded ? 'expanded' : ''}`} aria-label={`${service.name} 的运行日志`}>
      <header className="log-header">
        <div className="log-title">
          <Terminal size={17} />
          <strong>日志预览</strong>
          <span>{service.name}</span>
          <span className={`mini-dot ${service.runtime.status === 'running' ? 'running' : ''}`} />
        </div>
        <div className="log-tools">
          {loading ? <RefreshCw size={15} className="spin" /> : null}
          <button type="button" onClick={copyLogs}><Copy size={15} /> 复制</button>
          {onClose ? <button type="button" aria-label="关闭日志" onClick={onClose}>{expanded ? <X size={17} /> : <Minus size={17} />}</button> : null}
        </div>
      </header>
      <pre>{logs}</pre>
    </section>
  );
}
