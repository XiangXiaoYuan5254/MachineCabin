# 机舱 · 本地服务控制台

“机舱”用于集中记录和控制本机开发服务。它会显示每个服务的项目目录、端口、启动命令和实时状态，并支持一键启动、停止、日志查看、编辑、删除和自动扫描。

## macOS App

正式 App 安装在：

```text
/Applications/机舱.app
```

可以直接从“应用程序”或 Launchpad 打开。App 会自行启动内置控制台服务，数据保存在：

```text
~/Library/Application Support/机舱/services.json
```

重新构建并安装 App：

```bash
./script/build_and_run.sh --install
```

项目同时提供 `./script/build_and_run.sh` 作为统一的构建、打包和运行入口；Codex 的 Run 按钮也连接到这个脚本。

## Windows App

Windows 版基于 Electron，源码在 `desktop/`，自带运行环境，用户不需要安装 Node.js。它和 macOS 版共用同一套服务端与界面，数据保存在：

```text
%APPDATA%\机舱\services.json
```

在 macOS 或 Windows 上都可以打包 Windows 安装程序（NSIS，x64）：

```bash
npm run dist:win
```

安装程序输出到 `build/windows/MachineCabin-Setup-<版本>-x64.exe`，同时会复制到 `website/downloads/` 并生成 `latest-windows.json`。版本号取自 `package.json` 的 `version`，发版时请和 `macapp/Info.plist` 保持一致。

本地调试 Windows 版的外壳（在 macOS 上也能运行）：

```bash
npm run desktop
```

Windows 版的几个行为差异：

- 服务通过隐藏的控制台运行，不会弹出命令行窗口；关闭机舱后服务继续运行，下次打开会自动识别。
- 停止服务时会结束整个进程树（`taskkill /T /F`）。
- Windows 读不到其他进程的工作目录，所以对不是由机舱启动的进程，改为检查它的命令行或可执行文件是否位于服务目录内，才允许停止。
- 默认端口 49152 被占用时，App 会自动换一个空闲端口。

`.github/workflows/windows.yml` 会在 GitHub 的 Windows 机器上运行测试、打包安装程序，并对安装后的 App 做端到端冒烟测试（`script/smoke_windows.mjs`），安装程序可以在 Actions 的构建产物里下载。

## 启动

在 macOS 上可以直接双击 `start-console.command`。第一次启动会安装依赖并构建页面，随后自动打开：

```text
http://127.0.0.1:49152
```

也可以在终端中运行：

```bash
npm install
npm run build
npm start
```

开发模式使用：

```bash
npm run dev
```

前端开发地址为 `http://127.0.0.1:5173`，API 地址为 `http://127.0.0.1:49152`。

## 使用方法

- 点击“扫描服务”：在设置的扫描目录中查找 Node.js、Python、Go、Rust 与 Swift 项目，并推断启动命令和常见端口。
- 点击“添加服务”：手动填写服务名称、绝对路径、端口和启动命令。
- 点击“启动/停止”：从项目目录执行启动命令，或安全停止由控制台启动的进程。启动命令在 macOS 上由登录 shell 执行，在 Windows 上由 `cmd.exe` 执行。
- 点击服务行：在下方查看持续刷新的运行日志。
- 在“设置”中：每行填写一个扫描根目录，也可以查看当前版本、手动检查更新。

## 检查更新

App 启动时和之后每 6 小时会读取一次官网上的版本信息（macOS 读 `https://helloxxy.com/works/machine-cabin/downloads/latest.json`，Windows 读同目录的 `latest-windows.json`），发现比当前版本新的版本时，在页面顶部提示用户下载。下载按钮直接指向官网上的 `.dmg` 或 `.exe`，“更新内容”打开 GitHub 上这个版本的 Release。用户可以“暂时关闭”（下次打开再提醒）或“忽略此版本”（记在 `services.json` 的 `settings.skippedVersion` 里）。

- 当前版本取自 `package.json` 的 `version`，由 `/api/meta` 返回。
- 请求由界面发出，这样会沿用系统代理设置；Node.js 服务端不会联网检查。因为是跨域请求，官网服务器要给 `downloads/*.json` 返回 `Access-Control-Allow-Origin: *`。
- 1.2.0 仍向 GitHub 查询最新 Release，所以发版时 GitHub Release 也要照常发布。
- 更新不会自动安装，用户下载后按常规方式安装即可，服务列表和设置保存在应用数据目录，不受影响。

## 数据与安全

- 服务配置保存在 `.vbcoding/services.json`，运行日志保存在 `.vbcoding/logs/`；这两个路径默认不提交到 Git。
- 控制台默认只监听 `127.0.0.1`，不会向局域网公开。
- 对于不是由控制台启动的进程，只有当进程工作目录属于服务目录时才允许停止，避免误杀同端口的其他程序。
- 删除服务只会删除控制台中的记录，不会删除项目文件。
- 除了检查更新时读取官网上公开的版本信息，控制台不会访问外网，也不会上传任何数据。

可以使用 `VBCODING_DATA_DIR` 更改配置目录，使用 `CONSOLE_PORT` 更改控制台端口。

## 官网与发布

官网是 `website/` 下的纯静态页面，只保存在本地，不提交到 Git（已在 `.gitignore` 中忽略）。它不需要构建，可以直接部署到任意静态托管（Nginx、GitHub Pages、Vercel、Netlify、OSS 等）。

1. 在 `website/config.js` 中把 `githubRepo` 改成你的 GitHub 仓库（`用户名/仓库名`）。
   发新版本前，同时修改 `package.json` 的 `version` 和 `macapp/Info.plist` 的 `CFBundleShortVersionString`（并把 `CFBundleVersion` 加一）。两者不一致时 `build_and_run.sh` 会拒绝构建。
2. 构建 App 并打包 DMG：

   ```bash
   ./script/build_and_run.sh --build
   ./script/package_dmg.sh
   ```

   `package_dmg.sh` 会生成 `build/release/MachineCabin-<版本>.dmg`（不包含本机的服务列表），并把它和 `latest.json` 同步到 `website/downloads/`，官网上的版本号和大小会自动更新。
3. 运行 `npm run dist:win` 打包 Windows 安装程序，它会同步到 `website/downloads/` 并更新 `latest-windows.json`。如果官网上没有这个安装包，“下载 Windows 版”会自动跳转到 GitHub Releases。
4. 在 GitHub 新建 Release，标签写成 `v<版本>`（例如 `v1.2.0`），上传同一个 DMG 和 EXE 文件，并以正式版发布（不要勾选 pre-release）。1.2.0 靠这个 Release 发现新版本，App 里的“更新内容”也链接到它。
5. 部署 `website/` 目录。1.2.1 起已安装的 App 读取官网上的 `latest.json` / `latest-windows.json` 发现新版本，所以部署后用户才会收到更新。如果想把安装包放到 CDN / OSS，把 `downloadBase` 改成对应地址即可（App 里的下载地址在 `src/update.js`）。

本地预览官网：

```bash
python3 -m http.server 4173 --directory website
```
