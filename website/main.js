(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ---------- 下载链接与版本信息 ---------- */

  const config = window.SITE_CONFIG || {};
  const archLabels = {
    arm64: 'Apple Silicon',
    x86_64: 'Intel',
    'x86_64 arm64': 'Apple Silicon + Intel',
    'arm64 x86_64': 'Apple Silicon + Intel',
  };

  function formatSize(bytes) {
    if (!bytes) return '';
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function applyRelease(release) {
    const githubUrl = `https://github.com/${config.githubRepo}`;
    const links = {
      repo: githubUrl,
      releases: `${githubUrl}/releases/latest`,
      issues: `${githubUrl}/issues`,
      download: `${config.downloadBase || 'downloads/'}${release.file}`,
    };
    const values = {
      version: release.version,
      arch: archLabels[release.arch] || release.arch || 'Apple Silicon',
      size: formatSize(release.size),
      sha256: release.sha256 || '',
    };

    $$('[data-link]').forEach((link) => {
      const href = links[link.dataset.link];
      if (href) link.href = href;
    });
    $$('[data-bind]').forEach((node) => {
      const value = values[node.dataset.bind];
      if (value) node.textContent = value;
    });
    $$('[data-show]').forEach((node) => {
      node.hidden = !values[node.dataset.show];
    });
  }

  const fallback = config.fallback || { version: '1.1.0', file: 'MachineCabin-1.1.0.dmg' };
  applyRelease(fallback);
  fetch('downloads/latest.json', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((release) => {
      if (release?.file) applyRelease({ ...fallback, ...release });
    })
    .catch(() => {});

  $('#year').textContent = new Date().getFullYear();

  /* ---------- 导航 ---------- */

  const nav = $('#nav');
  const updateNav = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  updateNav();
  window.addEventListener('scroll', updateNav, { passive: true });

  /* ---------- 进场动画 ---------- */

  const revealItems = $$('.reveal');
  revealItems.forEach((item) => {
    if (item.style.getPropertyValue('--delay')) return;
    const siblings = [...item.parentElement.children].filter((node) => node.classList.contains('reveal'));
    item.style.setProperty('--delay', `${Math.min(siblings.indexOf(item), 6) * 0.08}s`);
  });
  $('.showcase').style.setProperty('--delay', '0.4s');

  if ('IntersectionObserver' in window && !reducedMotion) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('in'));
  }

  /* ---------- 卡片光斑 ---------- */

  $$('.card').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
  });

  /* ---------- 复制命令 ---------- */

  $$('[data-copy]').forEach((button) => {
    const label = $('span', button);
    button.addEventListener('click', async () => {
      const text = $(button.dataset.copy).textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const range = document.createRange();
        range.selectNodeContents($(button.dataset.copy));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        document.execCommand('copy');
      }
      button.classList.add('done');
      label.textContent = '已复制';
      setTimeout(() => {
        button.classList.remove('done');
        label.textContent = '复制';
      }, 1800);
    });
  });

  /* ---------- 界面预览：缩放与倾斜 ---------- */

  const DESIGN_WIDTH = 1180;
  const frame = $('#stageFrame');
  const stage = $('#stage');
  const demoWindow = $('#demoWindow');

  function fitWindow() {
    const scale = Math.min(1, frame.clientWidth / DESIGN_WIDTH);
    demoWindow.style.setProperty('--s', scale);
    frame.style.height = `${demoWindow.offsetHeight * scale}px`;
  }

  let tiltQueued = false;
  function updateTilt() {
    tiltQueued = false;
    const rect = frame.getBoundingClientRect();
    const viewport = window.innerHeight;
    const progress = Math.min(1, Math.max(0, (viewport - rect.top) / (viewport * 0.9)));
    const maxTilt = window.innerWidth < 680 ? 8 : 16;
    stage.style.setProperty('--tilt', `${(maxTilt * (1 - progress)).toFixed(2)}deg`);
    stage.style.setProperty('--zoom', (0.94 + 0.06 * progress).toFixed(4));
  }

  fitWindow();
  window.addEventListener('resize', () => {
    fitWindow();
    updateTilt();
  });
  document.fonts?.ready.then(fitWindow);

  if (!reducedMotion) {
    updateTilt();
    window.addEventListener('scroll', () => {
      if (tiltQueued) return;
      tiltQueued = true;
      requestAnimationFrame(updateTilt);
    }, { passive: true });
  }

  /* ---------- 界面预览：演示动画 ---------- */

  const logBody = $('#demoLog');
  const logTarget = $('#demoLogTarget');
  const runningCount = $('#demoRunning');
  const stoppedCount = $('#demoStopped');
  const target = $('#demoTarget');
  const MAX_LINES = 5;

  const logs = {
    web: {
      label: 'web-client (5173)',
      boot: [
        ['VITE', 'vite v6.0.7 <span class="ok">ready</span> in 327 ms'],
        ['VITE', '➜  Local:   <span class="u">http://localhost:5173/</span>'],
        ['VITE', '➜  Network: use --host to expose'],
        ['HMR', 'hmr update <span class="y">/src/components/Header.jsx</span>'],
        ['VITE', '<span class="ok">✓</span> page reload <span class="y">src/views/Home.jsx</span>'],
      ],
      stream: [
        ['HMR', 'hmr update <span class="y">/src/App.jsx</span>'],
        ['HMR', 'hmr update <span class="y">/src/components/ServiceTable.jsx</span>'],
        ['HMR', 'hmr update <span class="y">/src/styles.css</span>'],
        ['VITE', '<span class="ok">✓</span> page reload <span class="y">src/main.jsx</span>'],
        ['HMR', 'hmr update <span class="y">/src/components/LogPanel.jsx</span> (x2)'],
      ],
    },
    file: {
      label: 'file-service (9100)',
      boot: [
        ['GO', 'go: downloading github.com/gin-gonic/gin v1.10.0'],
        ['GIN', '[GIN-debug] GET    /health   --> main.health'],
        ['GIN', '[GIN-debug] POST   /upload   --> main.upload'],
        ['GIN', 'Listening and serving HTTP on <span class="u">:9100</span>'],
      ],
      stream: [
        ['GIN', '<span class="ok">200</span> |    1.2ms | GET    <span class="y">"/health"</span>'],
        ['GIN', '<span class="ok">201</span> |   38.4ms | POST   <span class="y">"/upload"</span>'],
        ['GIN', '<span class="ok">200</span> |    0.9ms | GET    <span class="y">"/files/42"</span>'],
      ],
    },
  };

  function clock() {
    return new Date().toTimeString().slice(0, 8);
  }

  function appendLine([tag, message]) {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="t">${clock()}</span><span class="k">${tag}</span><span>${message}</span>`;
    logBody.append(line);
    while (logBody.children.length > MAX_LINES) logBody.firstElementChild.remove();
  }

  function showLog(set, lines) {
    logTarget.textContent = set.label;
    logBody.replaceChildren();
    lines.forEach(appendLine);
  }

  function selectRow(id) {
    $$('.tr[data-id]').forEach((row) => row.classList.toggle('sel', row.dataset.id === id));
  }

  function setStatus(state) {
    const status = $('.st', target);
    const button = $('.op', target);
    status.className = `st ${state}`;
    $('em', status).textContent = { run: '运行中', boot: '启动中', '': '已停止' }[state];
    button.classList.toggle('start', state === '');
    button.textContent = state === '' ? '启动' : '停止';
    const running = state === '' ? 3 : 4;
    runningCount.textContent = running;
    stoppedCount.textContent = 6 - running;
  }

  async function press() {
    const button = $('.op', target);
    button.classList.add('press');
    await sleep(220);
    button.classList.remove('press');
  }

  let demoVisible = true;
  async function wait(ms) {
    await sleep(ms);
    while (!demoVisible || document.hidden) await sleep(400);
  }

  async function stream(set, count, from = 0) {
    for (let index = 0; index < count; index += 1) {
      await wait(1500);
      appendLine(set.stream[(from + index) % set.stream.length]);
    }
  }

  async function runDemo() {
    let round = 0;
    for (;;) {
      await stream(logs.web, 3, round * 3);

      await press();
      setStatus('boot');
      selectRow('file-service');
      showLog(logs.file, []);
      for (const line of logs.file.boot) {
        await wait(420);
        appendLine(line);
      }
      await wait(300);
      setStatus('run');
      await stream(logs.file, 3);

      await wait(600);
      await press();
      appendLine(['GIN', 'received SIGTERM, shutting down…']);
      setStatus('');
      await wait(1400);

      selectRow('web-client');
      showLog(logs.web, logs.web.boot.slice(-4));
      round += 1;
    }
  }

  showLog(logs.web, logs.web.boot);

  if (!reducedMotion) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        demoVisible = entry.isIntersecting;
      }).observe(frame);
    }
    runDemo();
  }
})();
