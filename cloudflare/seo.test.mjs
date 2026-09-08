import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INDEXNOW_ENDPOINTS,
  SEO_CONSTANTS,
  buildBaiduBody,
  buildIndexNowPayload,
  buildRobotsTxt,
  buildSitemapIndexXml,
  buildStaticSitemapUrls,
  buildUrlSetXml,
  canonicalRequestPath,
  googleSitemapSubmitUrl,
  googleSiteUrl,
  isIndexNowKeyPath,
  maybeCanonicalRedirect,
  parseWorkId,
  parseWorksPage,
  renderCatalogItem,
  renderHomeNoscript,
  renderWorkPage,
  renderWorksIndex,
  runSeoSubmission,
  sitemapPageCount,
  sitemapPingUrls,
  submissionCursor,
  worksListPageCount,
} from "./seo.mjs";

test("parseWorkId accepts 24-hex ids", () => {
  assert.equal(parseWorkId("/w/66a473d59e258e6b2f529e29"), "66a473d59e258e6b2f529e29");
  assert.equal(parseWorkId("/w/66A473D59E258E6B2F529E29/"), "66a473d59e258e6b2f529e29");
  assert.equal(parseWorkId("/w/not-an-id"), null);
  assert.equal(parseWorkId("/works"), null);
});

test("sitemap splits 24570 works into 5 files", () => {
  assert.equal(sitemapPageCount(24570), 5);
  assert.equal(worksListPageCount(24570), 123);
});

test("robots and sitemap index cover all works", () => {
  const origin = "https://s.pltown.online";
  const robots = buildRobotsTxt(origin);
  assert.match(robots, /Allow: \/w\//);
  assert.match(robots, /User-agent: Googlebot/);
  assert.match(robots, /User-agent: Bingbot/);
  assert.match(robots, /User-agent: Yandex/);
  assert.match(robots, /User-agent: Baiduspider/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/\?q=/);
  assert.match(robots, /User-agent: Googlebot\nAllow: \/\nAllow: \/w\/\nAllow: \/works\nDisallow: \/api\/\nDisallow: \/\?q=/);
  assert.match(robots, /User-agent: Baiduspider\nAllow: \/\nAllow: \/w\/\nAllow: \/works\nDisallow: \/api\/\nDisallow: \/\?q=/);
  assert.match(robots, /Host: s\.pltown\.online/);
  assert.match(robots, /Sitemap: https:\/\/s\.pltown\.online\/sitemap\.xml/);

  const xml = buildSitemapIndexXml(origin, 24570, "2026-09-07T00:00:00.000Z");
  assert.match(xml, /sitemap-static\.xml/);
  assert.match(xml, /sitemap-works-1\.xml/);
  assert.match(xml, /sitemap-works-5\.xml/);
  assert.doesNotMatch(xml, /sitemap-works-6\.xml/);
});

test("static sitemap includes paginated works index", () => {
  const urls = buildStaticSitemapUrls("https://s.pltown.online", 24570, "2026-09-07T00:00:00.000Z");
  assert.equal(urls[0].loc, "https://s.pltown.online/");
  assert.equal(urls[1].loc, "https://s.pltown.online/works");
  assert.equal(urls.at(-1).loc, "https://s.pltown.online/works?page=123");
});

test("work page is crawlable HTML with canonical and json-ld", () => {
  const longSummary = "甲".repeat(220);
  const html = renderWorkPage("https://s.pltown.online", {
    id: "66a473d59e258e6b2f529e29",
    name: "力学实验 <script>",
    summary: longSummary,
    userName: "张三",
    year: 2024,
    source: "实验精选",
    keyWords: ["力学", "牛顿"],
    primaryDiscipline: ["物理"],
  });
  assert.match(html, /<link rel="canonical" href="https:\/\/s\.pltown\.online\/w\/66a473d59e258e6b2f529e29">/);
  assert.match(html, /hreflang="zh-CN"/);
  assert.match(html, /<h1 itemprop="name">力学实验 &lt;script&gt;<\/h1>/);
  assert.match(html, /itemprop="abstract"/);
  assert.ok(html.includes(longSummary));
  assert.match(html, /"abstract":/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /"@type":"CreativeWork"/);
  assert.match(html, /name="robots" content="index,follow/);
});

test("works index paginates and links to work pages", () => {
  const fullSummary = "乙".repeat(180);
  const html = renderWorksIndex({
    origin: "https://s.pltown.online",
    page: 2,
    total: 450,
    lastmod: "2026-09-07T00:00:00.000Z",
    records: [{ id: "66a473d59e258e6b2f529e29", name: "示例", userName: "李四", year: 2023, summary: fullSummary }],
  });
  assert.match(html, /rel="canonical" href="https:\/\/s\.pltown\.online\/works\?page=2"/);
  assert.match(html, /href="https:\/\/s\.pltown\.online\/w\/66a473d59e258e6b2f529e29"/);
  assert.match(html, /<h2 class="t" itemprop="name">示例<\/h2>/);
  assert.ok(html.includes(fullSummary));
  assert.ok(!html.includes(`${"乙".repeat(80)}…`));
  assert.match(html, /上一页/);
  assert.match(html, /下一页/);
});

test("home crawl block exposes title and full summary", () => {
  const html = renderHomeNoscript("https://s.pltown.online", [{
    id: "66a473d59e258e6b2f529e29",
    name: "天体运动",
    userName: "王五",
    year: 2025,
    summary: "完整摘要必须出现在首屏可抓 HTML 中。",
  }]);
  assert.match(html, /id="crawl-index"/);
  assert.match(html, /天体运动/);
  assert.match(html, /完整摘要必须出现在首屏可抓 HTML 中。/);
  assert.match(html, /itemprop="abstract"/);
  const item = renderCatalogItem("https://s.pltown.online", {
    id: "66a473d59e258e6b2f529e29",
    name: "主题标题",
    summary: "全文摘要内容",
  });
  assert.match(item, /主题标题/);
  assert.match(item, /全文摘要内容/);
});

test("Google sitemap submit URL uses Search Console API", () => {
  const origin = "https://s.pltown.online";
  const siteUrl = googleSiteUrl({ GOOGLE_SITE_URL: "sc-domain:pltown.online" }, origin);
  assert.equal(siteUrl, "sc-domain:pltown.online");
  const submit = googleSitemapSubmitUrl("https://s.pltown.online/", `${origin}/sitemap.xml`);
  assert.match(submit, /webmasters\/v3\/sites\//);
  assert.match(submit, /sitemaps\//);
  const pings = sitemapPingUrls(origin);
  assert.equal(pings.some((url) => url.includes("google.com/ping")), false);
  assert.ok(pings.some((url) => url.includes("bing.com/ping")));
  assert.ok(pings.some((url) => url.includes("yandex.com/ping") || url.includes("webmaster.yandex.com/ping")));
});

test("IndexNow payload and Baidu body stay within batch limits", () => {
  const urls = Array.from({ length: 3 }, (_, i) => `https://s.pltown.online/w/${String(i).padStart(24, "0")}`);
  const payload = buildIndexNowPayload("https://s.pltown.online", "8f3c1a6b9d2e4f70a1c5b8d3e6f90a12", urls);
  assert.equal(payload.host, "s.pltown.online");
  assert.equal(payload.keyLocation, "https://s.pltown.online/8f3c1a6b9d2e4f70a1c5b8d3e6f90a12.txt");
  assert.equal(payload.urlList.length, 3);
  assert.equal(buildBaiduBody(urls), urls.join("\n"));
  assert.ok(SEO_CONSTANTS.INDEXNOW_BATCH <= 9990);
  assert.ok(SEO_CONSTANTS.BAIDU_BATCH <= 1998);
});

test("urlset xml escapes locations", () => {
  const xml = buildUrlSetXml(["https://s.pltown.online/w/66a473d59e258e6b2f529e29"], "2026-09-07T00:00:00.000Z");
  assert.match(xml, /<loc>https:\/\/s\.pltown\.online\/w\/66a473d59e258e6b2f529e29<\/loc>/);
});

test("IndexNow key path matches public verification file", () => {
  assert.equal(isIndexNowKeyPath("/8f3c1a6b9d2e4f70a1c5b8d3e6f90a12.txt", "8f3c1a6b9d2e4f70a1c5b8d3e6f90a12"), true);
  assert.equal(isIndexNowKeyPath("/robots.txt", "8f3c1a6b9d2e4f70a1c5b8d3e6f90a12"), false);
});

test("submissionCursor waits after a completed sweep", () => {
  const now = Date.parse("2026-09-07T12:00:00.000Z");
  assert.deepEqual(submissionCursor({ cursor_id: "abc" }, now), { skip: false, cursor: "abc" });
  assert.deepEqual(submissionCursor({ last_run_at: "2026-09-07T11:00:00.000Z", last_status: "caught_up" }, now), { skip: true, cursor: "" });
  assert.deepEqual(submissionCursor({ last_run_at: "2026-09-07T11:00:00.000Z", last_status: "http_200" }, now), { skip: true, cursor: "" });
  assert.deepEqual(submissionCursor({ last_run_at: "2026-09-07T11:00:00.000Z", last_status: "http_403:quota" }, now), { skip: false, cursor: "" });
  assert.deepEqual(submissionCursor({ last_run_at: "2026-09-07T11:00:00.000Z" }, now), { skip: false, cursor: "" });
  assert.deepEqual(submissionCursor({ last_run_at: "2026-08-01T00:00:00.000Z", last_status: "caught_up" }, now), { skip: false, cursor: "" });
});

test("canonicalRequestPath collapses index and work aliases", () => {
  assert.equal(canonicalRequestPath("/index.html"), "/");
  assert.equal(canonicalRequestPath("/works/"), "/works");
  assert.equal(canonicalRequestPath("/w/66A473D59E258E6B2F529E29/"), "/w/66a473d59e258e6b2f529e29");
  assert.equal(canonicalRequestPath("/w/66a473d59e258e6b2f529e29"), "/w/66a473d59e258e6b2f529e29");
});

test("maybeCanonicalRedirect sends index.html and foreign hosts to the public origin", () => {
  const env = { SITE_ORIGIN: "https://s.pltown.online" };
  const index = maybeCanonicalRedirect(null, env, new URL("https://s.pltown.online/index.html"));
  assert.equal(index.status, 301);
  assert.equal(index.headers.get("location"), "https://s.pltown.online/");
  const workers = maybeCanonicalRedirect(null, env, new URL("https://pl-search-cloudflare.workers.dev/w/66A473D59E258E6B2F529E29"));
  assert.equal(workers.status, 301);
  assert.equal(workers.headers.get("location"), "https://s.pltown.online/w/66a473d59e258e6b2f529e29");
  assert.equal(maybeCanonicalRedirect(null, env, new URL("https://s.pltown.online/")), null);
  assert.equal(maybeCanonicalRedirect(null, env, new URL("https://s.pltown.online/api/meta")), null);
});

test("parseWorksPage defaults to 1", () => {
  assert.equal(parseWorksPage(new URL("https://s.pltown.online/works")), 1);
  assert.equal(parseWorksPage(new URL("https://s.pltown.online/works?page=4")), 4);
});

test("runSeoSubmission posts IndexNow and Baidu batches", async () => {
  const ids = Array.from({ length: 3 }, (_, i) => `66a473d59e258e6b2f529e2${i}`);
  const state = {};
  const env = {
    SITE_ORIGIN: "https://s.pltown.online",
    INDEXNOW_KEY: "8f3c1a6b9d2e4f70a1c5b8d3e6f90a12",
    BAIDU_ZHANZHANG_TOKEN: "baidu-token",
    GOOGLE_SA_JSON: "",
    DB: {
      batch: async () => {},
      prepare(sql) {
        return {
          bind(...args) {
            this.args = args;
            return this;
          },
          async first() {
            if (sql.includes("seo_index_state") && sql.includes("SELECT")) {
              return state[this.args[0]] || null;
            }
            return null;
          },
          async run() {
            if (sql.includes("INSERT INTO seo_index_state")) {
              state[this.args[0]] = {
                engine: this.args[0],
                cursor_id: this.args[1],
                last_run_at: this.args[2],
                last_status: this.args[3],
              };
            }
          },
          async all() {
            return { results: ids.map((id) => ({ id })) };
          },
        };
      },
    },
  };
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({ success: 3 });
      },
    };
  };

  const summary = await runSeoSubmission(env, { fetchImpl });
  assert.equal(summary.indexnow.status, 200);
  assert.equal(summary.baidu.status, 200);
  assert.equal(summary.google.status, "skipped");
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    assert.ok(calls.some((item) => String(item.url) === endpoint), endpoint);
  }
  assert.ok(calls.some((item) => String(item.url).includes("data.zz.baidu.com")));
  assert.ok(calls.some((item) => String(item.url).includes("webmaster.yandex.com/ping")));
  assert.equal(calls.some((item) => String(item.url).includes("google.com/ping")), false);
  const indexNow = calls.find((item) => String(item.url).includes("api.indexnow.org"));
  const body = JSON.parse(indexNow.init.body);
  assert.ok(body.urlList.includes("https://s.pltown.online/w/66a473d59e258e6b2f529e20"));
  assert.ok(body.urlList.includes("https://s.pltown.online/"));
});
