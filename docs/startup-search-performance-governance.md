# 启动与搜索性能治理方案

> 状态：P0 + P1 实现中（2026-07-12）  
> 范围：本地库 3000+ 文章、全库 embedding 后的启动阻塞与搜索卡顿  
> 关联实现：`packages/internal/store/src/hydrate.ts`、`entry/store.ts`、`library-search.ts`  
> 测量：`hydrate-perf` 日志、`[perf] search` 日志（正式版 → 帮助 → 打开日志文件）

---

## 1. 背景与问题

用户在全库 embedding（约 4000 向量）后感知到：

1. **打开 Focal 慢**：首屏需等待约 **17s** 才能交互
2. **搜索略卡**：输入后结果更新有顿挫

### 1.1 正式版 profiling 结论（3136 entries / 3992 embeddings）

```
hydrateDatabaseToStore  17077ms  ≈  App is ready 17414ms
Initialize Focal done        4ms
```

瓶颈 **100% 在 `hydrateDatabaseToStore`**，之后初始化可忽略。

| Store                                          | DB 读取 | 条数 | 启动必需？           |
| ---------------------------------------------- | ------- | ---- | -------------------- |
| entry（含正文）                                | 14481ms | 3136 | 元数据必需，正文不必 |
| entryEmbedding                                 | 14924ms | 3992 | 否                   |
| translation                                    | 15661ms | 929  | 否                   |
| entryRankScore / quality / aiTags / summary 等 | ~14–15s | —    | 否                   |
| feed / subscription / unread 等                | ~50ms   | —    | **是**               |

各 enrichment store **并行** hydrate，但共用 SQLite，墙钟时间由最慢的一批读取决定（~15s）。慢在 **DB 全量读取**，不是 immer 写入。

### 1.2 搜索慢（与启动部分重叠）

| 因素                               | 是否被启动优化覆盖      |
| ---------------------------------- | ----------------------- |
| 启动期主线程被 hydration 占满      | ✅ P0 缓解              |
| 全库 3992 向量 O(N) 线性扫描       | ❌ 需 P1                |
| Query embedding API 延迟           | ❌ 已有渐进式关键词先行 |
| 后台 embedding upsert 触发搜索重算 | ❌ 需 P1 快照隔离       |

**结论：P0 主要治启动；P1 专门治搜索。**

---

## 2. 目标

### 2.1 P0 — 启动分层 hydration

| 指标                                        | 现在 | 目标      |
| ------------------------------------------- | ---- | --------- |
| `hydrateDatabaseToStore`（挡 `appIsReady`） | ~17s | **~2–3s** |
| 首屏可交互                                  | ~17s | **~2–3s** |

### 2.2 P1 — 搜索路径优化

| 指标                               | 目标                            |
| ---------------------------------- | ------------------------------- |
| 实体/关键词查询（如「华为」）      | 语义扫描从全库 → 关键词候选子集 |
| 同一 query 期间后台 embedding 更新 | 不触发搜索重算                  |
| 无语义关键词命中（意译查询）       | 保持全库语义扫描（正确性优先）  |

### 非目标（本阶段）

- HNSW / sqlite-vec 向量索引（库 > 1 万时再评估）
- Web Worker 跑 cosine（P2 候选）
- 更换 embedding 模型

---

## 3. P0 设计：分层 hydration

### 3.1 Phase 1（阻塞，挡 `appIsReady`）

```
feed, subscription, inbox, list, unread, user
entry（元数据，不含 content / readabilityContent）
collection（收藏夹立即可用）
```

外加：`initializeDB` + `migrateDB` + `reconcileLocalRssUnreadCounts`

### 3.2 Phase 2（后台，不挡首屏）

```
entryEmbedding, translation, entryRankScore, entryQualityScore,
entryAiTags, summary, behaviorEvent, interestCluster, image
```

`void startDeferredStoreHydrate()` 在 Phase 1 完成后启动；日志打 `[perf] hydrate.deferred`。

### 3.3 Entry 正文 lazy load（P0 必做）

`LOCAL_RSS_MODE` 下 `fetchEntryDetail` 只读内存。若 Phase 1 不加载正文，**点开文章会空白**。

策略：

1. `getEntriesMetadataToHydrate()` — SQLite 查询排除 `content`、`readabilityContent`
2. hydrate 时记录 `contentDeferredEntryIds`
3. 打开文章时 `ensureEntryBodyLoaded(entryId)` 从 DB 单条读取正文并写入 session

### 3.4 Phase 2 期间的体验（短暂降级，非永久）

| 功能               | Phase 2 完成前          | 完成后      |
| ------------------ | ----------------------- | ----------- |
| 文章列表           | ✅ 正常                 | ✅          |
| 按时间排序         | ✅                      | ✅          |
| 点开读正文         | ✅（lazy load）         | ✅          |
| 关键词搜索         | ✅                      | ✅          |
| 语义搜索           | 仅关键词                | 完整 hybrid |
| 列表中文译名       | 原文标题                | 译名        |
| 推荐排序           | 退化为时间序 + 简单规则 | 完整 rank   |
| AI 标签 / 标签话题 | 不完整                  | 完整        |
| AI 摘要（已生成）  | 可能空白                | 显示        |

预计 Phase 2 窗口：**约 15–30s**（与全量读库耗时同量级），不挡首屏。

---

## 4. P1 设计：搜索优化

### 4.1 两阶段语义扫描

```
Pass 1：全库关键词匹配（title + description + translation），收集 keywordScore > 0 的 entryId
Pass 2：
  - 若关键词命中数为 0 → 全库语义扫描（意译 / 跨语言查询）
  - 若命中数 > 0 → 仅对候选集（上限 500，按 keyword 分排序）做 cosine
```

实现：`collectSemanticHits` 增加 `entryIds?: ReadonlySet<string>` 过滤。

**权衡**：有关键词命中时，纯语义命中（标题无词但向量相近）可能减少；实体类短查询收益最大。

### 4.2 搜索快照隔离

`useLibrarySearchEntryIds` 的 `useMemo` **不再依赖** `embeddings` 对象引用。

- 仅在 `query` / `queryVector` / `entryRevision` / `translationRevision` 变化时重算
- 同一 query 期间后台 embedding hydrate/upsert **不触发**搜索重算

用户若需刷新：改 query 或清空再输入同一词即可。

### 4.3 已有策略（保留）

- 250ms 输入 debounce
- 渐进式搜索：query vector 未就绪时先关键词
- `title_description` 关键词路径（不扫 HTML 正文）
- `cosineWithUnitQuery` 快速 cosine

---

## 5. 文件改动清单

| 文件                                                                     | 改动                            |
| ------------------------------------------------------------------------ | ------------------------------- |
| `packages/internal/database/src/services/entry.ts`                       | `getEntriesMetadataToHydrate()` |
| `packages/internal/store/src/modules/entry/store.ts`                     | 元数据 hydrate、正文 lazy load  |
| `packages/internal/store/src/hydrate.ts`                                 | Phase 1 / Phase 2 拆分          |
| `packages/internal/store/src/hydrate-deferred.ts`                        | 后台 Phase 2 调度               |
| `packages/internal/store/src/modules/entry-embedding/semantic-search.ts` | `entryIds` 过滤                 |
| `apps/desktop/layer/renderer/src/store/search/library-search.ts`         | 两阶段搜索 + 快照 deps          |

---

## 6. 验证方式

### 6.1 启动（正式版测试包）

```
1. 完全退出 Focal → 重开
2. 帮助 → 打开日志文件
3. 确认：
   - hydrate total < 3000ms（Phase 1）
   - [perf] hydrate.deferred total ~15000ms（Phase 2，不挡 UI）
   - App is ready 与 hydrate total 接近
```

### 6.2 搜索

```
1. Phase 2 完成后，搜「华为」→ [perf] search semantic 应明显 < 全库基准
2. 搜「大模型推理优化」→ semantic 可能仍较高（全库扫描，符合设计）
3. Phase 2 backfill 过程中搜索 → 不应因 embedding upsert 连续重算
```

### 6.3 正文

```
1. Phase 1 后立即点开长文 → 正文应正常显示（lazy load）
2. 滚动列表 → 不应加载正文
```

---

## 7. 后续（P2，按需）

| 项                                          | 触发条件                  |
| ------------------------------------------- | ------------------------- |
| Web Worker 跑 `buildSemanticScoreByEntryId` | 语义搜索仍 > 50ms         |
| sqlite-vec / HNSW                           | 库 > 1 万 embedding       |
| 向量二进制存储（非 JSON）                   | 启动 Phase 2 仍 > 10s     |
| 设置页「智能索引加载中」提示                | 用户反馈 Phase 2 窗口困惑 |

---

## 8. 决策记录

| 日期       | 决策                       | 理由                             |
| ---------- | -------------------------- | -------------------------------- |
| 2026-07-12 | 不做 perf 明细也可开工     | 正式版已证实 17s ≈ hydration     |
| 2026-07-12 | dev 占比不可外推           | 并行 hydrate + 数据量差 40 倍    |
| 2026-07-12 | P0 + P1 同批交付           | 启动与搜索是不同瓶颈，改动不冲突 |
| 2026-07-12 | 正文 lazy load 与 P0 绑定  | 否则本地模式打开文章空白         |
| 2026-07-12 | 无语义关键词时保持全库扫描 | 意译查询正确性优先于速度         |
