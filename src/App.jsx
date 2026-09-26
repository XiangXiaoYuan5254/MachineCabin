import { Inbox, LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { LogPanel } from './components/LogPanel';
import { ServiceDrawer } from './components/ServiceDrawer';
import { ServiceTable } from './components/ServiceTable';
import { ServiceToolbar } from './components/ServiceToolbar';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { openInFileManager, platformName } from './platform';

function parseEnv(text) {
  return Object.fromEntries(
    text.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return separator === -1 ? [line, ''] : [line.slice(0, separator).trim(), line.slice(separator + 1)];
      })
      .filter(([key]) => key),
  );
}

function Toast({ message }) {
  return message ? <div className="toast" role="status">{message}</div> : null;
}

function EmptyState({ hasFilters, onAdd, onDiscover }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Inbox size={24} /></div>
      <h2>{hasFilters ? '没有匹配的服务' : '还没有记录服务'}</h2>
      <p>{hasFilters ? '换个关键词或筛选条件试试。' : '扫描附近的项目，或手动添加第一个本地服务。'}</p>
      {!hasFilters ? (
        <div>
          <button className="button secondary" type="button" onClick={onDiscover}><RefreshCw size={17} /> 扫描服务</button>
          <button className="button primary" type="button" onClick={onAdd}>添加服务</button>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState('services');
  const [services, setServices] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    try {
      const result = await api.getServices();
      setServices(result.services);
      setConnected(true);
      setSelectedId((current) => current || result.services[0]?.id || null);
    } catch (error) {
      setConnected(false);
      if (!quiet) showToast(error.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [showToast]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const [servicesResult, metaResult] = await Promise.allSettled([api.getServices(), api.getMeta()]);
    if (servicesResult.status === 'fulfilled') {
      setServices(servicesResult.value.services);
      setSelectedId(servicesResult.value.services[0]?.id || null);
      setConnected(true);
    } else {
      showToast(servicesResult.reason.message);
    }
    if (metaResult.status === 'fulfilled') setMeta(metaResult.value);
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const timer = window.setInterval(() => refresh({ quiet: true }), meta?.settings?.refreshInterval || 5000);
    return () => window.clearInterval(timer);
  }, [meta, refresh]);

  const filteredServices = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    return services.filter((service) => {
      if (statusFilter !== 'all' && service.runtime.status !== statusFilter) return false;
      if (!normalized) return true;
      return [service.name, service.description, service.directory, service.port, service.startCommand]
        .some((value) => String(value || '').toLowerCase().includes(normalized));
    });
  }, [deferredQuery, services, statusFilter]);

  const runningCount = services.reduce((count, service) => count + Number(service.runtime.status === 'running'), 0);
  const selectedService = services.find((service) => service.id === selectedId) || null;

  const toggleService = async (service) => {
    setBusyId(service.id);
    try {
      if (service.runtime.status === 'running') {
        await api.stopService(service.id);
        showToast(`${service.name} 已停止`);
      } else {
        await api.startService(service.id);
        showToast(`${service.name} 启动命令已执行`);
      }
      await refresh({ quiet: true });
      setSelectedId(service.id);
    } catch (error) {
      showToast(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const saveService = async (form) => {
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      directory: form.directory.trim(),
      port: form.port ? Number(form.port) : null,
      startCommand: form.startCommand.trim(),
      env: parseEnv(form.envText),
      healthCheck: form.healthCheck.trim(),
    };
    try {
      const result = editingService
        ? await api.updateService(editingService.id, payload)
        : await api.createService(payload);
      setDrawerOpen(false);
      setEditingService(null);
      await refresh({ quiet: true });
      setSelectedId(result.service.id);
      showToast(editingService ? '服务已更新' : '服务已添加');
    } finally {
      setSaving(false);
    }
  };

  const deleteService = async (service) => {
    if (!window.confirm(`确定删除“${service.name}”吗？这不会删除项目文件。`)) return;
    try {
      await api.deleteService(service.id);
      await refresh({ quiet: true });
      showToast('服务记录已删除');
    } catch (error) {
      showToast(error.message);
    }
  };

  const discover = async () => {
    setDiscovering(true);
    try {
      const result = await api.discover();
      await refresh({ quiet: true });
      showToast(result.added ? `发现并添加了 ${result.added} 个服务` : `扫描完成，没有发现新服务`);
    } catch (error) {
      showToast(error.message);
    } finally {
      setDiscovering(false);
    }
  };

  const openFolder = async (service) => {
    try {
      const response = await fetch(`/api/services/${service.id}/open-folder`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      showToast(`已${openInFileManager}目录`);
    } catch (error) {
      showToast(error.message);
    }
  };

  const copyValue = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label}已复制`);
    } catch {
      showToast(`无法复制${label}`);
    }
  };

  const saveSettings = async (settings) => {
    const result = await api.updateSettings(settings);
    setMeta((current) => ({ ...current, settings: result.settings }));
    showToast('设置已保存');
  };

  const openAdd = () => {
    setEditingService(null);
    setDrawerOpen(true);
  };

  const openEdit = (service) => {
    setEditingService(service);
    setDrawerOpen(true);
  };

  return (
    <div className="app-shell">
      <Sidebar active={activeSection} onChange={setActiveSection} connected={connected} />
      <main className="main-content">
        {activeSection === 'services' ? (
          <div className="services-view">
            <header className="page-header">
              <div className="title-block">
                <h1>服务控制台</h1>
                <p>所有本地应用，一处掌控。</p>
                <div className="summary-line">
                  <strong>{services.length}</strong> 个服务
                  <span>/</span>
                  <strong className="green">{runningCount}</strong> 运行中
                  <span>/</span>
                  <strong>{services.length - runningCount}</strong> 已停止
                </div>
              </div>
              <ServiceToolbar
                query={query}
                onQueryChange={setQuery}
                status={statusFilter}
                onStatusChange={setStatusFilter}
                onDiscover={discover}
                onAdd={openAdd}
                discovering={discovering}
              />
            </header>

            {loading ? (
              <div className="loading-state"><LoaderCircle className="spin" /> 正在连接控制台…</div>
            ) : filteredServices.length ? (
              <ServiceTable
                services={filteredServices}
                selectedId={selectedId}
                busyId={busyId}
                onSelect={setSelectedId}
                onToggle={toggleService}
                onEdit={openEdit}
                onDelete={deleteService}
                onOpenFolder={openFolder}
                onCopy={copyValue}
              />
            ) : (
              <EmptyState hasFilters={Boolean(query || statusFilter !== 'all')} onAdd={openAdd} onDiscover={discover} />
            )}

            {selectedService ? <LogPanel service={selectedService} onClose={() => setSelectedId(null)} onToast={showToast} /> : null}
          </div>
        ) : null}

        {activeSection === 'logs' ? (
          <div className="logs-view">
            <div className="section-heading">
              <h1>运行日志</h1>
              <p>选择一个服务，持续查看最近的终端输出。</p>
            </div>
            <div className="log-service-tabs">
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  className={service.id === selectedId ? 'active' : ''}
                  onClick={() => setSelectedId(service.id)}
                >
                  <span className={`mini-dot ${service.runtime.status === 'running' ? 'running' : ''}`} />
                  {service.name}
                </button>
              ))}
            </div>
            {selectedService ? (
              <LogPanel service={selectedService} expanded onToast={showToast} />
            ) : (
              <EmptyState hasFilters={false} onAdd={openAdd} onDiscover={discover} />
            )}
          </div>
        ) : null}

        {activeSection === 'settings' ? <SettingsView meta={meta} onSave={saveSettings} /> : null}
      </main>

      <div className="status-bar">
        <span><span className={`connection-dot ${connected ? '' : 'offline'}`} /> {connected ? '本机服务控制已就绪' : '服务端未连接'}</span>
        <span>{meta ? platformName(meta.platform) : '本机'} · 每 {Math.round((meta?.settings?.refreshInterval || 5000) / 1000)} 秒刷新状态</span>
      </div>

      <ServiceDrawer
        open={drawerOpen}
        service={editingService}
        onClose={() => setDrawerOpen(false)}
        onSave={saveService}
        saving={saving}
      />
      <Toast message={toast} />
    </div>
  );
}
