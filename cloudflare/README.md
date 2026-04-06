# Cloudflare Query API

这个目录提供一个可直接部署到 Cloudflare Workers 的只读查询 API。

## 文件

- `worker.mjs`：Workers 入口，提供 `/api/meta`、`/api/search`、`/api/record`
- `data/records.mjs`：由本地数据库导出的静态快照
- `wrangler.toml`：Workers 配置

## 部署准备

```bash
npm run build
npm run export-cloudflare
npx wrangler login
npx wrangler deploy --config cloudflare/wrangler.toml
```

要给Worker配置secret`GROQ_API_KEY`,其余可选变量：

- `GROQ_BASE_URL`，默认 `https://api.groq.com/openai/v1`
- `GROQ_KEYWORD_MODEL`，默认 `llama-3.1-8b-instant`
- `GROQ_MODEL`，如果没单独配 `GROQ_KEYWORD_MODEL`，会回退用它

如果没有配置 `GROQ_API_KEY`，API 仍可正常使用，只是不会做 AI 扩词。


## API

- `GET /api/meta`：返回服务信息、快照生成时间、总记录数、单次最大返回条数，以及当前是否启用了 AI 扩词。

- `GET /api/search`: 支持参数：keywords, author, year, yearFrom, yearTo, limit, aiExpand

- `GET /api/record?id=...`: 返回单条记录。
