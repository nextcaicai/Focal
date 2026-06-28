# Desktop Update Worker

这份文档记录 Focal 桌面端检查更新的最小 Cloudflare Worker 流程。

## 目标

- 让本地或打包后的桌面端访问真实的 `VITE_OTA_URL`。
- 先通过 `/policy` 判断是否有新版本。
- 暂时不启用 renderer OTA，所以 `/manifest` 返回 `204`。

## 1. 本地运行 Worker

```bash
cd apps/ota-worker
pnpm install
corepack pnpm@10.17.0 run worker:dev
```

默认本地地址是：

```text
http://localhost:8787
```

测试旧版本是否能看到更新：

```bash
curl -i http://localhost:8787/policy \
  -H "X-App-Version: 0.1.7" \
  -H "X-App-Platform: desktop/macos/dmg" \
  -H "X-App-Channel: stable" \
  -H "X-App-Runtime-Version: 0.1.7"
```

预期返回 `action: "prompt"`。

## 2. 部署到 Cloudflare

第一次部署需要浏览器登录 Cloudflare：

```bash
cd apps/ota-worker
corepack pnpm@10.17.0 run worker:deploy
```

部署成功后会得到类似：

```text
https://focal-ota.<your-subdomain>.workers.dev
```

这个地址就是桌面端要使用的 `VITE_OTA_URL`。

当前部署地址：

```text
https://focal-ota.nextcc.workers.dev
```

## 3. 让本地桌面端使用 Worker

```bash
cd apps/desktop
VITE_OTA_URL=https://focal-ota.nextcc.workers.dev corepack pnpm@10.17.0 dev:electron
```

打开“关于”页面，点击“检查更新”。如果当前桌面端版本小于 Worker 的 `LATEST_VERSION`，会提示发现更新。

## 4. 打包时写入 Worker 地址

```bash
cd apps/desktop
VITE_OTA_URL=https://focal-ota.nextcc.workers.dev corepack pnpm@10.17.0 build:electron
```

也可以在 `apps/desktop/.env` 写入：

```bash
VITE_OTA_URL=https://focal-ota.nextcc.workers.dev
```

不要把 `.env` 提交进仓库。

## 5. 发布新版时改哪里

先在 `apps/ota-worker/wrangler.jsonc` 修改：

```jsonc
"LATEST_VERSION": "0.1.8",
"LATEST_RELEASE_URL": "https://github.com/nextcaicai/Focal/releases",
"DOWNLOAD_MACOS_DMG_URL": "https://github.com/nextcaicai/Focal/releases/download/desktop/v0.1.8/Focal-0.1.8-macos-arm64.dmg",
"DOWNLOAD_WINDOWS_EXE_URL": "https://github.com/nextcaicai/Focal/releases/download/desktop/v0.1.8/Focal-0.1.8-windows-x64.exe",
"DOWNLOAD_LINUX_URL": "https://github.com/nextcaicai/Focal/releases/download/desktop/v0.1.8/Focal-0.1.8-linux-x64.AppImage",
```

然后重新部署：

```bash
cd apps/ota-worker
corepack pnpm@10.17.0 run worker:deploy
```

## 重要限制

如果已经发出去的旧包内置的是 `http://127.0.0.1:0`，它不会访问 Cloudflare Worker。这个旧包无法远程修复，需要用户手动安装一次带正确 `VITE_OTA_URL` 的新包。之后检查更新才会正常工作。
