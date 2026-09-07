# Physics Lab Search

物理实验室作品搜索服务。线上仅保留 Cloudflare Worker、静态搜索页面和 D1 数据库；仓库保留作品收录程序，自动调度当前关闭。

## 架构

- `cloudflare/public/index.html`：Cloudflare 静态搜索页面
- `cloudflare/worker.mjs`：搜索 API 与可选的 Groq 查询词扩展
- Cloudflare D1 `plworks`：线上查询数据源
- `data.db`：仓库内权威数据快照
- `src/scripts/updateDatabase.ts`：作品收录入口
- `src/scripts/exportD1Sql.ts`：将 `data.db` 导出为 D1 SQL

收录程序遍历 `Experiment` 与 `Discussion` 两种内容类型，不使用查询 Tag 过滤。收录记录的 `source` 来源字段根据作品详情返回的 `Tags` 判断：`Experiment + 精选` 为“实验精选”，`Discussion + 精选` 为“黑洞精选”，`Discussion + 小说` 或 `小说专区` 为“黑洞小说”，其余组合为“其他”。带有“小作品”标签的作品会被过滤。

## GitHub Actions

工作流使用 GitHub Environment `pl-search`。

- `导入数据到Cloudflare D1`：手动将现有 `data.db` 导入 D1并部署 Worker
- `收录作品到 Cloudflare D1`：手动收录新作品、更新 `data.db`、覆盖 D1并部署 Worker

两个工作流都仅支持 `workflow_dispatch`。自动收录的实现已保留，定时触发当前关闭。

## 环境配置

敏感值使用 GitHub Environment Secrets：

```text
CLOUDFLARE_API_TOKEN
PL_USERNAME
PL_PASSWORD
OPENAI_API_KEY
```

`OPENAI_API_KEY` 用于全部 AI 分析请求。

普通配置使用 GitHub Environment Variables：

```text
CLOUDFLARE_ACCOUNT_ID
D1_DATABASE_ID=1ff32e2b-ab3c-4f78-aa15-9313e095e237
DB_PATH=./data.db
D1_EXPORT_FILE=./cloudflare/d1/data.sql
PL_BASE_URL=https://physics-api-cn.turtlesim.com
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
AI_REQUEST_TIMEOUT_MS=45000
SKIP=0
TAKE=-100
COLLECT_PAGE_SIZE=20
COLLECT_BATCH_SIZE=20
COLLECT_ANALYZE_CONCURRENCY=5
COLLECT_INSERT_CONCURRENCY=5
COLLECT_PAGE_DELAY_MS=0
COLLECT_BATCH_DELAY_MS=0
```

Worker 的 Groq 查询扩展由 Cloudflare Worker Secret `GROQ_API_KEY` 控制，模型可通过 Cloudflare Variables `GROQ_KEYWORD_MODEL`、`GROQ_MODEL` 和 `GROQ_BASE_URL` 配置。

## 本地命令

```bash
npm ci
npm run build
npm test
npm run update-db
npm run flexible-collect -- --take -50
npm run export-d1
```

线上服务：`https://s.pltown.online`

作品详情：`https://s.pltown.online/w/<作品ID>`
全部作品：`https://s.pltown.online/works`
Sitemap：`https://s.pltown.online/sitemap.xml`

Worker Cron 每 6 小时主动 ping Google/Bing sitemap，并用 IndexNow 提交作品 URL。百度推送需要 Worker Secret `BAIDU_ZHANZHANG_TOKEN`。

## 埋点与日志

Worker 启动时自动在 D1 `plworks` 创建三张表（无需额外控制台操作）：

- `events`：前端埋点事件（搜索、打开作品、卡片展开、筛选等）
- `search_terms`：搜索词统计（服务端 `/api/search` 时记录，按词聚合计数）
- `error_logs`：API 异常日志（catch 时写入，含 path / message / stack）

前端通过 `navigator.sendBeacon` 上报 `POST /api/track`（body：`{event, data}`），Worker 异步写入 D1。

查询统计接口（只读，供分析用）：

```text
GET /api/stats?type=terms    搜索词 TOP50（term, count, last_searched_at）
GET /api/stats?type=events   事件类型聚合 TOP50（event, count, last_ts）
GET /api/stats?type=errors   最近 50 条错误日志（id, ts, path, message, extra）
```
