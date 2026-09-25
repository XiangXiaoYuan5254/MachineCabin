import { FolderSearch, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const emptyForm = {
  name: '',
  description: '',
  directory: '',
  port: '',
  startCommand: '',
  envText: '',
  healthCheck: '',
};

function toForm(service) {
  if (!service) return emptyForm;
  return {
    name: service.name || '',
    description: service.description || '',
    directory: service.directory || '',
    port: service.port || '',
    startCommand: service.startCommand || '',
    envText: Object.entries(service.env || {}).map(([key, value]) => `${key}=${value}`).join('\n'),
    healthCheck: service.healthCheck || '',
  };
}

export function ServiceDrawer({ open, service, onClose, onSave, saving }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(toForm(service));
      setError('');
    }
  }, [open, service]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim() || !form.directory.trim() || !form.startCommand.trim()) {
      setError('请填写服务名称、项目目录和启动命令。');
      return;
    }
    try {
      await onSave(form);
    } catch (submissionError) {
      setError(submissionError.message);
    }
  };

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <form onSubmit={submit}>
          <header className="drawer-header">
            <div>
              <h2 id="drawer-title">{service ? '编辑服务' : '添加服务'}</h2>
              <p>记录目录、端口和启动方式，之后即可一键控制。</p>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
              <X size={21} />
            </button>
          </header>

          <div className="drawer-body">
            <label className="field">
              <span>服务名称</span>
              <input value={form.name} onChange={setField('name')} placeholder="例如 order-api" autoFocus />
            </label>
            <label className="field">
              <span>服务说明 <em>可选</em></span>
              <input value={form.description} onChange={setField('description')} placeholder="例如 订单 API" />
            </label>
            <label className="field">
              <span>项目目录</span>
              <div className="input-with-icon">
                <FolderSearch size={18} />
                <input value={form.directory} onChange={setField('directory')} placeholder="/Users/me/Projects/order-api" />
              </div>
              <small>请输入项目的绝对路径；保存时会检查目录是否存在。</small>
            </label>
            <div className="form-row">
              <label className="field">
                <span>端口号 <em>可选</em></span>
                <input value={form.port} onChange={setField('port')} inputMode="numeric" placeholder="8080" />
              </label>
              <label className="field">
                <span>健康检查地址 <em>可选</em></span>
                <input value={form.healthCheck} onChange={setField('healthCheck')} placeholder="/health" />
              </label>
            </div>
            <label className="field">
              <span>启动命令</span>
              <input className="mono-input" value={form.startCommand} onChange={setField('startCommand')} placeholder="npm run dev" />
            </label>
            <label className="field">
              <span>环境变量 <em>可选，每行一个 KEY=VALUE</em></span>
              <textarea value={form.envText} onChange={setField('envText')} placeholder={'NODE_ENV=development\nAPI_KEY=local-value'} rows={5} />
            </label>
            {error ? <div className="form-error" role="alert">{error}</div> : null}
          </div>

          <footer className="drawer-footer">
            <button type="button" className="button secondary" onClick={onClose}>取消</button>
            <button type="submit" className="button primary" disabled={saving}>{saving ? '保存中…' : '保存服务'}</button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
