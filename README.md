<div align="center">
  <img src="./apps/desktop/layer/renderer/src/assets/focal-logo.png" alt="Focal Logo" width="88" height="88">

  <h1>Focal</h1>
  <p><strong>Focal - Your Feeds, Local First</strong></p>
  <p>一个越来越懂你阅读偏好的本地 RSS 阅读器</p>
  <p>简体中文 | <a href="./README-en.md">English</a></p>
</div>

## Focal 是什么

Focal fork 自 [RSSNext/Folo](https://github.com/RSSNext/Folo)。Folo 提供了成熟的订阅、时间线、跨平台阅读器和内容生态基础；Focal 在此之上转向更独立的本地优先路线，重点服务 macOS 桌面端 RSS 阅读、BYOK AI 增强、个人阅读偏好学习。

当前 Focal 的默认形态是本地 RSS 模式：订阅源、条目、未读状态、AI 增强结果、推荐排序和集成配置主要围绕本地数据库与桌面运行时工作。它的目标不是再做一个通用信息流，而是做一个能帮你过滤、理解、整理信息的个人阅读工作台。

## 用户可见的核心能力

### 1. 本地 RSS 订阅与刷新

- 通过 RSS/Atom URL 添加订阅源，订阅前可预览源信息与最新条目。
- 以本地数据库保存订阅、条目、未读状态和 AI 结果，降低日常阅读对远端同步状态的依赖。
- 支持启动时与后台定时刷新本地 RSS，并在订阅源刷新失败时保留错误状态。
- 新订阅默认只保留最新少量条目为未读，避免历史 backlog 一次性冲进时间线，也减少不必要的 BYOK AI 消耗。
- 支持订阅分类、折叠分组、批量取消订阅和按视图组织内容。

### 2. 高效阅读时间线

- 支持 Today、Unread、Starred 等 Smart Feeds，快速进入今天内容、全部未读和收藏内容。
- 支持未读筛选、刷新、批量标记已读、快捷键切换条目，以及按订阅源/分类/视图浏览。
- 支持 Latest / Recommended 双时间线：Latest 按发布时间阅读，Recommended 按个人推荐分重新排序。
- 支持 Readability 阅读模式、目录、代码高亮、正文排版和工具栏自定义，让阅读体验更接近桌面原生应用。

### 3. BYOK AI 阅读增强

- 在 Settings > AI 中配置模型 API Key，用自己常用的模型服务处理 AI 能力。模型建议 DeepSeek-v4-flash
- 可对条目生成摘要、标题/正文翻译、AI 标签和内容质量评分。
- 支持双语或仅译文模式，并可设置 AI 动作输出语言。
- 可在 AI 面板中围绕当前文章、订阅源或时间线对话，直接追问、解释和整理正在阅读的内容。
- 支持时间线总结入口，帮助用户先了解一批未读内容里真正发生了什么。

### 4. 越来越懂你的推荐排序

- 在 Settings > AI 中配置模型 API Key 才能调用该服务。模型建议 bge-m3
- Focal 会把内容质量、发布时间、未读/已读/收藏状态和个人兴趣信号组合成推荐分。
- 内容质量评分基于 AIRSS 维度，关注信息增益、深度、证据、可操作性和原创性等信号。
- Embedding 与兴趣聚类会把新文章和历史阅读偏好做语义匹配，推荐时间线会优先浮出更可能值得你看的内容。
- 阅读、收藏、标记不感兴趣等行为会逐步成为排序反馈，让 Recommended 时间线从冷启动的新鲜度排序，过渡到更个人化的阅读顺序。

### 5. Actions 自动化规则

- 可在 Settings > Actions 中创建规则，对全部条目或满足条件的条目自动执行动作。
- 条件支持订阅状态、视图、订阅标题、分类、站点 URL、Feed URL、条目标题、正文、链接、作者、媒体数量和附件时长。
- 操作支持生成摘要、翻译、开启 Readability、基于 Readability 内容重新质量评分、抓取源内容、新条目通知、静音、阻止、收藏、重写规则和 Webhook。
- 可将规则保存并应用到已有条目，适合把重复的信息处理流程前置到入库阶段。

### 6. 知识整理与第三方集成

- 支持把条目保存到 Obsidian，并选择本地 vault 路径。
- 支持更适合知识库沉淀的 Markdown 元数据和文件路径处理。
- 后续将支持飞书、Notion 等常用知识库的内置集成。

## Focal 相比 Folo 的二开重点

- **本地 RSS 阅读**：从云端订阅同步优先，转向本地数据库、本地刷新和本地状态保护优先。
- **BYOK AI pipeline**：摘要、翻译、AI 标签、质量分、embedding 和 AI 对话都围绕用户自己的模型服务展开。
- **个人化 AI RSS 推荐**：用质量分、新鲜度、阅读状态、embedding 兴趣匹配和负向兴趣信号组合出 Recommended 时间线，但推荐完全基于你的订阅源，不让好的内容沉底。
- **macOS 桌面阅读体验**：围绕双栏/多栏阅读、快捷键、可拖拽列宽、后台刷新和本地缓存优化高频阅读。

## 技术栈

- Monorepo: `pnpm` workspaces + Turbo
- Desktop/Web: Electron + Vite + React
- State: Jotai, Zustand, TanStack Query
- Database: Drizzle + SQLite
- UI: Tailwind CSS + Apple UIKit color tokens
- i18n: i18next

## 使用说明

### 个人用户（推荐）

直接在 [GitHub Releases](https://github.com/nextcaicai/Focal/releases) 下载最新版本（目前仅 mac 版本）：

- **macOS**: 下载 `.dmg` 文件，拖拽安装

下载后开箱即用，无需配置开发环境。

### 开发者

如果你想参与开发或自定义功能，请参考下方的「本地开发」部分。

## 本地开发

安装依赖：

```bash
pnpm install
```

推荐使用浏览器模式开发桌面渲染层：

```bash
cd apps/desktop
pnpm run dev:web
```

运行完整 Electron 桌面应用：

```bash
cd apps/desktop
pnpm run dev:electron
```

构建 Web 版本：

```bash
pnpm run build:web
```

提交或合并前按顺序运行：

```bash
pnpm run typecheck
pnpm run lint:fix
pnpm run test
```

## 贡献

欢迎围绕本地 RSS、BYOK AI、阅读偏好推荐、Actions 自动化、知识库集成和 macOS 桌面阅读体验继续改进 Focal。开始贡献前请阅读 [Contributing Guide](./CONTRIBUTING.md)，并遵守项目内各目录的 `AGENTS.md` 约定。

## 致谢

Focal 的诞生离不开以下优秀开源项目的贡献：

- **[RSSNext/Folo](https://github.com/RSSNext/Folo)** —— Focal fork 自 Folo，继承了其成熟的订阅管理、时间线架构和跨平台阅读器基础。
- **[NetNewsWire](https://github.com/Ranchero-Software/NetNewsWire)** —— macOS 上经典的 RSS 阅读器，Focal 在本地 RSS 处理和桌面阅读体验设计上深受其启发。
- **[Defuddle](https://github.com/kevinburke/defuddle)** —— Youtube视频逐字稿内容提取，为 Focal 的纯净阅读模式提供技术支持。
- **[Simple Icons](https://github.com/simple-icons/simple-icons)** —— 提供高质量的品牌图标，用于订阅源和集成的图标展示。
- **[Lobehub](https://github.com/lobehub/lobe-chat)** —— 提供高质量的大模型品牌图标，用于模型接入的图标展示。

## 许可证

本项目继承上游 Folo 的许可证约束，采用 GNU Affero General Public License version 3。

Focal 不再分发历史 `icons/mgc` 目录中的 MingCute Pro 资产；当前本地图标位于 `icons/focal`，由可分发的开源图标或 Focal 自有资产生成。
