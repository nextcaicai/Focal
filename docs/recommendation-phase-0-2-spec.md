# Recommendation Phase 0-2 Spec

## 背景

Focal 当前的 `Recommended` 更接近“当前可见列表的过滤 + 排序”，还不是完整的个性化推荐系统。

现有质量分最初服务于推荐，但它解释的是“文章本身是否值得读”，不是“为什么推荐给这个用户”。后续推荐系统应把质量分降级为内部特征，而不是继续把质量分作为用户可见的核心产品概念。

本规格只覆盖 Phase 0-2：

- Phase 0：建立推荐诊断基线。
- Phase 1：拆分质量解释和推荐解释。
- Phase 2：扩展行为事件与事件 metadata。

后续的多兴趣簇、独立候选池、多样性重排、每日简报消费推荐结果，不在本规格内。

## 当前事实

当前 `Recommended` 流程：

```text
current visible entry ids
  -> filterRecommendedEntryIds()
  -> sortEntryIdsByRank()
  -> render entry list
```

当前推荐过滤包含：

- 已标记 `not_interested` 的条目不进入推荐。
- 已读且处理时间早于当天的条目不进入推荐。
- 已收藏且收藏时间早于当天的条目不进入推荐。
- 有质量分时，要求 `quality_score >= 50`。
- 没有质量分时，仅 24 小时内的新条目可进入推荐。

当前推荐排序包含：

- `quality_component`
- `freshness_component`
- `interest_component`
- `negative_interest_penalty`
- live state score：未读、已读、星标
- 发布时间和 entry id 兜底排序

当前质量分 hover 展示：

- quality score
- confidence
- summary
- content types
- six dimension scores
- positive / negative quality reasons

当前行为事件只有：

```ts
type BehaviorEventType = "favorite" | "read_complete" | "not_interested"
```

当前 `behavior_events` 表只有：

```text
id
entry_id
event_type
created_at
```

## 产品目标

### 用户目标

用户在 `Recommended` 中应该能理解：

- 为什么这篇文章被推荐。
- 为什么这篇文章排在这里。
- 为什么某些文章没有进入推荐。
- 自己的正常阅读行为如何让推荐变好。

### 产品目标

- 不再让用户误以为“推荐 = 质量分排序”。
- 保留质量分作为推荐内部特征，不在本阶段移除质量分数据。
- 为后续多兴趣画像、独立推荐候选池、每日简报打基础。
- 保持 `Latest` / 未来 `Browse > Recent` 的稳定时间线体验不受影响。

## 信息架构约束

长期目标中，推荐会从当前中间列排序模式迁到左侧 `Browse` tab 下。`Browse` 下的目标结构：

```text
Browse
  Search
  Daily Brief
  Recommended
  Recent
  Read Later
  Favorites
```

约束：

- `Recommended` 和 `Daily Brief` 是同级入口。
- `Recommended` 是个性化浏览/排序列表。
- `Daily Brief` 可以消费推荐排序结果，但它是按日期保存、按主题组织的简报快照。
- 本规格不实现 `Browse` IA 迁移，只保证 Phase 0-2 的数据结构和解释模型不会阻碍后续迁移。

## Phase 0: 推荐诊断基线

### 目标

不改变推荐结果，先让系统能解释当前结果。

### 范围

新增一个内部诊断能力，用于给定 entry id 后解释：

- 是否是当前候选条目。
- 是否通过推荐过滤。
- 如果未通过，具体过滤原因是什么。
- 如果通过，当前 rank record 是什么。
- live state score 是什么。
- 最终用于排序的分数是什么。

### 建议接口

共享层提供纯函数，避免 UI/store 直接拼诊断逻辑：

```ts
type RecommendedFilterReason =
  | "not_interested"
  | "stale_read"
  | "stale_starred"
  | "low_quality"
  | "unscored_expired"
  | "missing_reference_date"

type RecommendationDiagnostic = {
  entryId: string
  candidate: boolean
  included: boolean
  filterReason: RecommendedFilterReason | null
  rank: EntryRankRecord | null
  stateScore: number
  finalScore: number | null
}
```

### UI 表现

- 默认用户无感。
- 可先只作为开发调试能力。
- 不新增公开设置。
- 不改变现有质量分 hover。

### 对当前 Focal 的影响

- 推荐排序不变。
- 数据结构可以不变。
- 测试会更清楚地覆盖当前推荐过滤行为。

### 验收标准

- 可以解释任意当前可见条目为什么进入或不进入 `Recommended`。
- 可以解释进入推荐条目的最终排序分数。
- 现有推荐测试不回退。

## Phase 1: 推荐解释结构化

### 目标

把“内容质量解释”和“推荐排序解释”拆开，让质量分成为推荐解释中的一个因素，而不是推荐本身。

### 范围

扩展 `EntryRankRecord`，让推荐原因从简单文案升级为稳定结构。

现有质量分 hover 继续解释文章质量；推荐解释新增解释排序和过滤。

### 建议数据结构

保留现有字段，新增结构化字段时保持向后兼容：

```ts
type EntryRecommendationReasonType =
  | "quality"
  | "freshness"
  | "interest"
  | "negative_interest"
  | "state"
  | "filter"
  | "fallback"

type EntryRecommendationReason = {
  type: EntryRecommendationReasonType
  code: string
  impact: "positive" | "negative" | "neutral"
  label: string
  value?: number
}

type EntryRankExplanation = {
  recommendationReasons: EntryRecommendationReason[]
  filterReason?: RecommendedFilterReason | null
  finalScore?: number
  stateScore?: number
}
```

### UI 表现

在 `Recommended` 场景中，文章解释应拆成两块：

```text
Content Quality
Recommendation
```

示例文案：

```text
内容质量较高
最近发布
匹配你的兴趣
未读，优先展示
你标记过类似内容为不感兴趣，因此降权
```

不推荐文案：

```text
Quality score 87, so recommended
Score 0.734
cluster-positive match 0.81
```

### 对当前 Focal 的影响

- 现有质量分 hover 不必删除。
- 质量分从“单独解释”变为“推荐解释的一部分”。
- 用户会更清楚：质量高不等于一定排第一，推荐还会考虑新鲜度、兴趣、已读状态和负反馈。

### 验收标准

- 推荐解释可以展示质量、新鲜度、兴趣、负兴趣、状态等原因。
- 老的 `entry_rank_scores.data` 仍能正常读取。
- `EntryQualityScoreBadge` 不回退。
- `Recommended` 模式和非 `Recommended` 模式不会混淆解释。

## Phase 2: 扩展行为事件

### 目标

让正常阅读行为参与推荐，而不是只依赖收藏、读完、不感兴趣三个信号。

### 范围

扩展行为事件类型，并给 `behavior_events` 增加通用 metadata 字段。

不在本阶段实现多兴趣簇；现有兴趣画像可以继续使用当前更新逻辑，但要能接收更细的事件权重。

### 行为事件类型

建议扩展为：

```ts
type BehaviorEventType =
  | "open"
  | "read_progress"
  | "read_complete"
  | "favorite"
  | "read_later"
  | "hide"
  | "not_interested"
  | "quick_bounce"
```

### Metadata

新增通用 JSON metadata，不给每种事件加独立列：

```ts
type BehaviorEventMetadata = {
  progress?: number
  durationMs?: number
  source?: "list" | "reader" | "search" | "command"
  reason?: string
}
```

数据库迁移：

```text
behavior_events.metadata text nullable
```

### 记录规则

- `open`：进入阅读器时记录，单篇文章短时间内去重。
- `read_progress`：只在跨过 25%、50%、75% 等阈值时记录，避免滚动事件刷库。
- `read_complete`：达到读完阈值时记录。
- `quick_bounce`：短停留 + 低进度时派生，作为弱负反馈或统计信号。
- `favorite` / `read_later` / `hide` / `not_interested`：来自用户显式操作。

### 建议权重原则

- `open` 不应直接变成强兴趣。
- `read_progress` 低档位只作为弱信号，高档位才影响兴趣画像。
- `read_complete` 是强正向信号。
- `favorite` / `read_later` 是明确正向信号。
- `hide` / `not_interested` 是明确负向信号。
- `quick_bounce` 不应过度惩罚内容，更适合影响来源/曝光或作为弱负向信号。

### UI 表现

- 不新增大量按钮。
- 用户正常阅读即可让推荐变好。
- 现有“不感兴趣”继续作为显式纠正入口。
- 如果已有或后续加入“稍后读 / 隐藏”，它们自然成为推荐信号。

### 对当前 Focal 的影响

- 需要数据库迁移。
- 需要更新 behavior event store hydrate / persist。
- `record()` 需要接受 metadata。
- 需要更新行为权重和兴趣画像更新逻辑。
- 需要对被动行为做节流和去重，避免本地数据库快速膨胀。

### 验收标准

- 旧行为事件可以正常读取。
- 新事件可以写入并带 metadata。
- 阅读进度不会高频重复写入。
- `favorite`、`read_complete`、`not_interested` 的现有功能不回退。
- 推荐重算仍能在强行为后触发。

## 非目标

本规格不做：

- 删除质量分数据表。
- 删除质量分 hover。
- 实现多兴趣簇。
- 实现独立推荐候选池。
- 实现推荐迁移到 `Browse` tab。
- 实现每日简报。
- 引入远程 reranker 或新的 LLM 分类器。
- 实现 FTRL / 本地学习模型。

## 测试策略

优先测试外部行为，不测试内部实现细节。

建议测试：

- 推荐过滤原因覆盖所有当前规则。
- 推荐最终分数包含 live state score。
- 老 `EntryRankRecord` 数据能兼容读取。
- 新结构化 recommendation reasons 能正确生成。
- `behavior_events.metadata` 为空时旧数据不报错。
- `read_progress` 阈值去重有效。
- 显式行为仍触发兴趣画像更新和 rank recompute。

## 推进顺序

建议实现顺序：

```text
Phase 0 diagnostics
  -> Phase 1 structured explanation
  -> Phase 2 behavior event schema + event write path
```

Phase 0 和 Phase 1 可以先不改 UI，仅完成数据和解释能力。Phase 2 需要迁移和更多测试，建议单独成 PR。

## 风险

- 如果推荐解释直接复用质量分 hover，用户仍会误解“推荐 = 质量分”。
- 如果过早取消质量分硬门槛，冷启动可能退化。
- 如果被动阅读事件没有节流，数据库会膨胀。
- 如果行为权重过强，误点开会污染兴趣画像。
- 如果本阶段顺手做多兴趣簇，范围会快速失控。
