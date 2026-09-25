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
- 点击“启动/停止”：从项目目录执行启动命令，或安全停止由控制台启动的进程。
- 点击服务行：在下方查看持续刷新的运行日志。
- 在“设置”中：每行填写一个扫描根目录。

## 数据与安全

- 服务配置保存在 `.vbcoding/services.json`，运行日志保存在 `.vbcoding/logs/`；这两个路径默认不提交到 Git。
- 控制台默认只监听 `127.0.0.1`，不会向局域网公开。
- 对于不是由控制台启动的进程，只有当进程工作目录属于服务目录时才允许停止，避免误杀同端口的其他程序。
- 删除服务只会删除控制台中的记录，不会删除项目文件。

可以使用 `VBCODING_DATA_DIR` 更改配置目录，使用 `CONSOLE_PORT` 更改控制台端口。

## 官网与发布

官网是 `website/` 下的纯静态页面，不需要构建，可以直接部署到任意静态托管（Nginx、GitHub Pages、Vercel、Netlify、OSS 等）。

1. 在 `website/config.js` 中把 `githubRepo` 改成你的 GitHub 仓库（`用户名/仓库名`）。
2. 构建 App 并打包 DMG：

   ```bash
   ./script/build_and_run.sh --build
   ./script/package_dmg.sh
   ```

   `package_dmg.sh` 会生成 `build/release/MachineCabin-<版本>.dmg`（不包含本机的服务列表），并把它和 `latest.json` 同步到 `website/downloads/`，官网上的版本号、大小和 SHA-256 会自动更新。
3. 在 GitHub 新建 Release，上传同一个 DMG 文件。
4. 部署 `website/` 目录。如果想把安装包放到 CDN / OSS，把 `downloadBase` 改成对应地址即可。

本地预览官网：

```bash
python3 -m http.server 4173 --directory website
```
