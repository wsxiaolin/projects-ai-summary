# Physics-Lab-Search-Engine

基于 `physics-lab-web-api` + SQLite + OpenAI/讯飞星火/Groq 的作品收录与查询机器人。

## Bot 查询命令

```
#查词: 电磁学,光学
#查作者: 用户名
#查年份: 2024
#查年份: 2021-2024
#查查询 关键词=电磁学,光学 作者=张三 limit=8
```

## 环境变量配置

创建 `.env` 文件：

```env
# 物实平台
PL_USERNAME=
PL_PASSWORD=
PL_DISCUSSION_ID=69a59f0eca7ceb749317ef7c
PL_DISCUSSION_TAG=精选,知识库
PL_DISCUSSION_TYPE=Discussion,Experiment
PL_BASE_URL=https://physics-api-cn.turtlesim.com

# 本地标签同步（管理员账号，可与上面的账号相同）
PL_ADMIN_USERNAME=
PL_ADMIN_PASSWORD=
PL_SYNC_CATEGORY=Discussion
PL_SYNC_SOURCE_TAG=精选
PL_SYNC_TAG_WHITELIST=数学,物理学,化学,生物学,地理学,天文学,计算机科学,医学,电气工程,历史学,哲学,文学,艺术学
# 可选：覆盖学科->讨论标签映射，JSON格式
# PL_SYNC_DISCIPLINE_TAG_MAP={"理论物理学":["物理学"],"应用数学":["数学"]}

# 数据收集
SKIP=0
TAKE=-100
DB_PATH=./data.db

# AI 服务（选择其一）
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://your-provider.com/v1

# 或使用讯飞星火
SPARK_API_PASSWORD=your_password
SPARK_MODEL=generalv3.5
SPARK_ENDPOINT=https://spark-api-open.xf-yun.com/v1/chat/completions

# 用于 bot 查询时的关键词模糊扩展
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.1-8b-instant
# GROQ_BASE_URL=https://api.groq.com/openai/v1
```

## GitHub Actions 工作流

两个自动化任务在 `.github/workflows/`：

**run-bot-query.yml**（每小时 0-16 时）
- 执行 `npm run run-bot-once`
- 需要 Secrets: PL_USERNAME, PL_PASSWORD, PL_DISCUSSION_*

**update-database.yml**（每 5 天）
- 执行 `npm run update-db` 并提交数据
- 需要上述 Secrets + AI 配置

在 GitHub Settings → Secrets and variables → Actions 中添加相应的 Secrets。

> 注意：工作流里如果某个 Secret 未设置，GitHub Actions 会把它注入为空字符串（不是 `undefined`）。
> 本项目会把空字符串视为“未配置”，因此请确保至少设置 `OPENAI_API_KEY` 或 `SPARK_API_PASSWORD` 其中之一。
> 另外请务必使用 `PL_USERNAME` / `PL_PASSWORD` 这两个名称，不要误用系统自带的 `USERNAME` / `PASSWORD` 环境变量。

## 本地命令

```bash
npm run update-db          # 更新数据库
npm run run-bot            # 启动机器人（持续运行）
npm run run-bot-once       # 运行一轮机器人
npm run discipline-stats   # 统计学科分布
npm run flexible-collect -- --tag "精选" --take -50  # 灵活收集
npm run sync-selected-tags # 用本地数据库学科信息补齐精选作品讨论标签
```
