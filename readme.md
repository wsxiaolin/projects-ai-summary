# Physics-Lab-Search-Engine

基于 `physics-lab-web-api` + SQLite + OpenAI / Spark / Groq 的作品收录、查询和补丁同步工具。有以下功能：

1，可以云端批量跑历史作品并由AI生成摘要
2，云端批量给物实作品加标签
3，一个物实机器人，定时获取物实的消息，把用户输入由AI联想后查询并返回
4，定时获取物实指定类型作品（可配置）拿摘要更新数据库
5，一个github pages页面，可视化编辑数据库，生成的纯文本补丁
6，一个ci，自动运用纯文本补丁
7，一个作品查询的cf workers，会自动在6和4时更新。目前只有最基础的查询功能，没有速率限制/AI联想查询
8，每次运行都会推送相关信息到物实一个作品的summary，类似于探针。当然也有日志。

## Bot 查询命令

在物实指定作品内可以通过留言查询，Bot会轮询回复（其实也是基于ci，频率很低的）

```bash
#查词: 电磁学 光学
#查作者: 用户名
#查年份: 2024
#查年份: 2021-2024
#查询 关键词=电磁学|光学 作者=张三 年份范围=2021-2024 limit=8
你也可以使用自然语言，会有AI预处理
```

## 环境变量

```
PL_USERNAME=
PL_PASSWORD=
PL_DISCUSSION_ID=69a59f0eca7ceb749317ef7c
PL_DISCUSSION_TAG=精选,知识库
PL_DISCUSSION_TYPE=Discussion,Experiment
PL_BASE_URL=https://physics-api-cn.turtlesim.com

PL_ADMIN_USERNAME=
PL_ADMIN_PASSWORD=
PL_SYNC_CATEGORY=Discussion
PL_SYNC_SOURCE_TAG=精选
PL_SYNC_TAG_WHITELIST=数学,物理学,化学,生物学,地理学,天文学,计算机科学,医学,电气工程,历史学,哲学,文学,艺术学

SKIP=0
TAKE=-100
DB_PATH=./data.db
DB_PATCH_FILE=./home/database.patch.json
CLOUDFLARE_EXPORT_FILE=./cloudflare/data/records.mjs
LOG_DIR=./logs

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

SPARK_API_PASSWORD=
SPARK_MODEL=generalv3.5
SPARK_ENDPOINT=https://spark-api-open.xf-yun.com/v1/chat/completions

GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120B
GROQ_CHAT_MODEL=openai/gpt-oss-120B
GROQ_CHAT_MAX_TOKENS=120

DB_PATCH_FILE=./home/database.patch.json

CLOUDFLARE_EXPORT_FILE=./cloudflare/data/records.mjs
LOG_DIR=./logs
PL_LOG_SUMMARY_ID=
PL_LOG_SUMMARY_CATEGORY=Discussion
PL_LOG_SUMMARY_USERNAME=
PL_LOG_SUMMARY_PASSWORD=
PL_LOG_SUMMARY_MAX_CHARS=18000


## Cloudflare API 配置
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
```

## GitHub Actions

工作流位于 `.github/workflows/`：

- `run-bot-query.yml`
  - 执行 `npm run run-bot-once`
- `update-database.yml`
  - 执行 `npm run apply-db-patch`
  - 执行 `npm run update-db`
  - 执行 `npm run export-cloudflare`
- `/apply-database-patch.yml`
  - 执行：`npm run apply-db-patch`
  - 执行: `npm run export-cloudflare`
  - 自动部署 Worker
  - 将更新后的 `data.db` 和 `cloudflare/data/records.mjs` 提交回仓库


## 本地命令

```bash
npm run update-db
npm run apply-db-patch
npm run export-cloudflare
npm run run-bot
npm run run-bot-once
npm run discipline-stats
npm run flexible-collect -- --tag "精选" --take -50
npm run sync-selected-tags
npm run sync-all-tags
npm run build
```
