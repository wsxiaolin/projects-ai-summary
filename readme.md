# Physics-Lab-Search-Engine

基于 `physics-lab-web-api` + SQLite + OpenAI/讯飞星火 的作品收录与查询机器人。

## 物理实验室查询格式（Bot）

#查词: 电磁学,光学
#查作者: 用户名
#查年份: 2024
#查年份: 2021-2024
#查难度: 0.2-0.6
#查学科: 理学
#查询 关键词=电磁学,光学 作者=张三 年份范围=2021-2024 难度=0.2-0.8 学科=理学 limit=8

## github ci 云端配置

请创建 `.env`：

```env
PL_USERNAME=
PL_PASSWORD=
SPARK_API_PASSWORD=
SPARK_MODEL=generalv3.5
SPARK_ENDPOINT=https://spark-api-open.xf-yun.com/v1/chat/completions
PL_DISCUSSION_TAG=精选,知识库
PL_DISCUSSION_ID=69a59f0eca7ceb749317ef7c // BOT运行所在的ID
PL_DISCUSSION_TYPE=Experiment,Discussion
DB_PATH=./data.db
SKIP=0
TAKE=200
```

## 本地克隆后可用脚本如下
```
npm run update-db
npm run run-bot
npm run discipline-stats
npm run flexible-collect -- --tag "精选" --skip 100 --model "gpt-3.5-turbo" --take -50
npm run run-bot-once
```
