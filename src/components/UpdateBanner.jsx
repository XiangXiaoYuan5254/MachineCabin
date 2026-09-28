import { CircleArrowUp, Download, X } from 'lucide-react';

export function UpdateBanner({ latest, currentVersion, onSkip, onDismiss }) {
  return (
    <div className="update-banner" role="status">
      <CircleArrowUp className="update-banner-icon" size={18} />
      <p>
        <strong>机舱 v{latest.version} 已发布</strong>
        <span>当前版本 v{currentVersion}，下载安装后，服务列表和设置都会保留。</span>
      </p>
      <div className="update-banner-actions">
        <a className="button primary compact" href={latest.downloadUrl} target="_blank" rel="noreferrer">
          <Download size={15} /> 下载新版本
        </a>
        <a className="text-link" href={latest.notesUrl} target="_blank" rel="noreferrer">更新内容</a>
        <button className="text-link" type="button" onClick={onSkip}>忽略此版本</button>
        <button className="icon-button quiet" type="button" onClick={onDismiss} aria-label="暂时关闭" title="暂时关闭">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
