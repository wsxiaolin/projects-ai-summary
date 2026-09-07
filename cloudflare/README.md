# Cloudflare Search

`cloudflare/worker.mjs` 提供搜索 API，`cloudflare/public/index.html` 提供同源静态页面，查询数据来自 D1 binding `DB`。

## API

- `GET /api/meta`：数据总数、更新时间及功能状态
- `GET /api/search?keywords=力学&author=张三&yearStart=2020&yearEnd=2025&limit=20`
- `GET /api/record?id=<作品ID>`
- `GET /w/<作品ID>`：可被搜索引擎抓取的作品详情页
- `GET /works`：全部作品分页目录
- `GET /robots.txt`、`GET /sitemap.xml`：收录入口

## 数据同步

仓库根目录的 `data.db` 是权威快照。手动运行 GitHub Actions 工作流 `导入数据到Cloudflare D1` 时会依次执行：

1. `npm run export-d1`
2. 将 `cloudflare/d1/data.sql` 导入 D1
3. 校验 D1 行数
4. 部署 Worker 与静态页面

手动工作流 `收录作品到 Cloudflare D1` 会先收录新作品，再执行同一套同步和部署流程。定时触发当前关闭。

## Cloudflare 配置

- Worker：`pl-search-cloudflare`
- D1 database：`plworks`
- D1 binding：`DB`
- Assets binding：`ASSETS`
- 站点源：`SITE_ORIGIN=https://s.pltown.online`
- Cron：每 6 小时主动提交 sitemap / IndexNow / 百度

部署凭据由 GitHub Environment `pl-search` 提供。`CLOUDFLARE_API_TOKEN` 使用 Secret，`CLOUDFLARE_ACCOUNT_ID` 使用 Variable。

百度站长主动推送需要在 Cloudflare 控制台给 Worker 添加 Secret `BAIDU_ZHANZHANG_TOKEN`。IndexNow 公钥已写入 `wrangler.toml` 的 `INDEXNOW_KEY`。

部署后在 Cloudflare 控制台确认：

1. Workers & Pages → `pl-search-cloudflare` → Settings → Variables：`SITE_ORIGIN`、`INDEXNOW_KEY` 已在
2. 同一页 Secrets：添加 `BAIDU_ZHANZHANG_TOKEN`（百度搜索资源平台 → 普通收录 → 接口调用地址里的 token）
3. Triggers：Cron `18 */6 * * *` 已启用
4. 打开 `https://s.pltown.online/robots.txt` 与 `https://s.pltown.online/sitemap.xml`

搜索引擎控制台（各做一次）：

1. Google Search Console 添加 `https://s.pltown.online`，提交 `https://s.pltown.online/sitemap.xml`
2. Bing Webmaster Tools 添加同一站点并提交同一 sitemap（IndexNow 会继续自动推）
3. 百度搜索资源平台添加站点并开启「普通收录」主动推送
