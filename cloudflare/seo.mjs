const WORK_ID_RE = /^[0-9a-f]{24}$/i;
const SITEMAP_CHUNK = 5000;
const WORKS_PAGE_SIZE = 200;
const INDEXNOW_BATCH = 9990;
const BAIDU_BATCH = 1998;
const RESUBMIT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const SEO_CONSTANTS = {
  WORK_ID_RE,
  SITEMAP_CHUNK,
  WORKS_PAGE_SIZE,
  INDEXNOW_BATCH,
  BAIDU_BATCH,
};

export function siteOrigin(env, url) {
  const configured = String(env?.SITE_ORIGIN || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return url.origin;
}

export function parseWorkId(pathname) {
  const match = String(pathname || "").match(/^\/w\/([0-9a-fA-F]{24})\/?$/);
  return match ? match[1].toLowerCase() : null;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

export function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  }[ch]));
}

function asList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // fall through
  }
  return trimmed.split(/[,\n|，；;]/).map((item) => item.trim()).filter(Boolean);
}

export function workUrl(origin, id) {
  return `${origin}/w/${String(id).toLowerCase()}`;
}

export function truncateText(value, max = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function plUrls(id) {
  const encoded = encodeURIComponent(id);
  return {
    experiment: `https://plweb.turtlesim.com/#/p/Experiment/${encoded}`,
    discussion: `https://plweb.turtlesim.com/#/p/Discussion/${encoded}`,
  };
}

export function buildRobotsTxt(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    "Allow: /w/",
    "Allow: /works",
    "Disallow: /api/",
    "Disallow: /?q=",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapPageCount(total, chunk = SITEMAP_CHUNK) {
  return Math.max(1, Math.ceil(Math.max(total, 0) / chunk));
}

export function worksListPageCount(total, size = WORKS_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(total, 0) / size));
}

export function buildSitemapIndexXml(origin, workCount, lastmod) {
  const pages = sitemapPageCount(workCount);
  const last = lastmod || new Date().toISOString();
  const items = [
    sitemapIndexItem(`${origin}/sitemap-static.xml`, last),
  ];
  for (let i = 1; i <= pages; i += 1) {
    items.push(sitemapIndexItem(`${origin}/sitemap-works-${i}.xml`, last));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`;
}

function sitemapIndexItem(loc, lastmod) {
  return `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${escapeXml(lastmod)}</lastmod>\n  </sitemap>`;
}

export function buildUrlSetXml(urls, lastmod) {
  const last = lastmod || new Date().toISOString();
  const items = urls.map((entry) => {
    const loc = typeof entry === "string" ? entry : entry.loc;
    const mod = (typeof entry === "string" ? last : entry.lastmod) || last;
    const changefreq = typeof entry === "string" ? "weekly" : (entry.changefreq || "weekly");
    const priority = typeof entry === "string" ? "0.6" : (entry.priority || "0.6");
    return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${escapeXml(mod)}</lastmod>\n    <changefreq>${escapeXml(changefreq)}</changefreq>\n    <priority>${escapeXml(priority)}</priority>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</urlset>\n`;
}

export function buildStaticSitemapUrls(origin, workCount, lastmod) {
  const pages = worksListPageCount(workCount);
  const urls = [
    { loc: `${origin}/`, lastmod, changefreq: "daily", priority: "1.0" },
    { loc: `${origin}/works`, lastmod, changefreq: "daily", priority: "0.8" },
  ];
  for (let page = 2; page <= pages; page += 1) {
    urls.push({
      loc: `${origin}/works?page=${page}`,
      lastmod,
      changefreq: "daily",
      priority: "0.5",
    });
  }
  return urls;
}

export function buildWorkSitemapUrls(origin, ids) {
  return ids.map((id) => workUrl(origin, id));
}

export function parseWorksPage(url) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  return page;
}

export function buildIndexNowPayload(origin, key, urls) {
  const host = new URL(origin).host;
  return {
    host,
    key,
    keyLocation: `${origin}/${key}.txt`,
    urlList: urls,
  };
}

export function buildBaiduBody(urls) {
  return urls.join("\n");
}

function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function baseHead({ origin, title, description, canonical, extra = "", robots = "index,follow,max-image-preview:large", ogType = "website" }) {
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#f5f5f7">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="${escapeHtml(robots)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="sitemap" type="application/xml" href="${escapeHtml(origin)}/sitemap.xml">
<meta property="og:site_name" content="PL Town 作品库">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:type" content="${escapeHtml(ogType)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${extra}`;
}

const PAGE_CSS = `:root{--bg:#f5f5f7;--card:#fff;--ink:#1d1d1f;--ink2:#515154;--ink3:#86868b;--line:rgba(0,0,0,.08);--line2:rgba(0,0,0,.045);--accent:#d8492f;--accent-soft:#ffeae4;--radius:18px;--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font);background:var(--bg);color:var(--ink);min-height:100vh;font-size:15px;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:inherit}
.topbar{position:sticky;top:0;z-index:50;background:rgba(245,245,247,.78);backdrop-filter:blur(18px);border-bottom:1px solid var(--line2)}
.topbar-in{max-width:720px;margin:0 auto;padding:0 22px;height:54px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand-zh{font-size:17px;font-weight:700}
.nav{display:flex;gap:14px;font-size:13px;color:var(--ink3)}
.nav a{text-decoration:none}
.nav a:hover{color:var(--ink)}
.wrap{max-width:720px;margin:0 auto;padding:28px 22px 64px}
h1{font-size:clamp(26px,6vw,36px);letter-spacing:-.02em;line-height:1.25;overflow-wrap:anywhere}
.meta{margin-top:12px;color:var(--ink3);font-size:14px}
.card{margin-top:22px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.summary{color:var(--ink2);white-space:pre-wrap;overflow-wrap:anywhere}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.tag{font-size:12px;padding:4px 10px;border-radius:999px;background:#f3f3f5;color:var(--ink2);text-decoration:none}
.links{margin-top:18px;display:flex;flex-direction:column;gap:8px}
.links a{color:var(--accent);text-decoration:none}
.list{list-style:none;display:flex;flex-direction:column;gap:12px;margin-top:18px}
.list a{text-decoration:none}
.list li{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.list .t{font-weight:650}
.list .s{margin-top:4px;font-size:13px;color:var(--ink3)}
.pager{margin-top:22px;display:flex;gap:16px;font-size:14px}
.pager a{color:var(--accent);text-decoration:none}
.note{margin-top:18px;font-size:12px;color:var(--ink3)}
footer{margin-top:28px;font-size:12px;color:var(--ink3)}`;

export function renderWorkPage(origin, record) {
  const id = String(record.id || "").toLowerCase();
  const name = record.name || "未命名作品";
  const summary = record.summary || "PL Town 社区作品。";
  const description = truncateText(`${name}。${summary}`);
  const canonical = workUrl(origin, id);
  const author = record.userName || "匿名";
  const keywords = asList(record.keyWords);
  const primary = asList(record.primaryDiscipline);
  const secondary = asList(record.secondaryDiscipline);
  const subjects = [...primary, ...secondary];
  const links = plUrls(id);
  const year = record.year || "";
  const source = record.source || "其他";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name,
    url: canonical,
    description: truncateText(summary, 300),
    inLanguage: "zh-CN",
    author: { "@type": "Person", name: author },
    dateCreated: year ? String(year) : undefined,
    keywords: keywords.join(", "),
    about: subjects,
    publisher: { "@type": "Organization", name: "PL Town", url: origin },
    mainEntityOfPage: canonical,
  };
  const extra = `<meta name="author" content="${escapeHtml(author)}">
<meta name="keywords" content="${escapeHtml([source, ...keywords, ...subjects].filter(Boolean).join(","))}">
${jsonLdScript(jsonLd)}`;
  const tagLinks = [...keywords, ...subjects].slice(0, 16).map((item) => (
    `<a class="tag" href="${escapeHtml(origin)}/?q=${encodeURIComponent(item)}">${escapeHtml(item)}</a>`
  )).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
${baseHead({ origin, title: `${name} · PL Town 作品库`, description, canonical, extra, ogType: "article" })}
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="topbar"><div class="topbar-in">
  <div class="brand-zh">作品库</div>
  <nav class="nav">
    <a href="${escapeHtml(origin)}/">检索</a>
    <a href="${escapeHtml(origin)}/works">全部作品</a>
  </nav>
</div></header>
<main class="wrap">
  <p class="note">${escapeHtml(source)}${year ? ` · ${escapeHtml(year)}` : ""}</p>
  <h1>${escapeHtml(name)}</h1>
  <p class="meta">作者 ${escapeHtml(author)}${record.editorName ? ` · 编辑 ${escapeHtml(record.editorName)}` : ""} · ID ${escapeHtml(id)}</p>
  <article class="card">
    <p class="summary">${escapeHtml(summary)}</p>
    ${tagLinks ? `<div class="tags">${tagLinks}</div>` : ""}
    <div class="links">
      <a href="${escapeHtml(links.experiment)}" rel="noopener">在物理实验室以实验打开</a>
      <a href="${escapeHtml(links.discussion)}" rel="noopener">在物理实验室以讨论打开</a>
    </div>
  </article>
  <p class="note">本页供检索与收录；作品版权归原作者与社区所有。</p>
</main>
</body>
</html>`;
}

export function renderWorksIndex({ origin, page, total, records, lastmod }) {
  const pages = worksListPageCount(total);
  const safePage = Math.min(Math.max(page, 1), pages);
  const canonical = safePage === 1 ? `${origin}/works` : `${origin}/works?page=${safePage}`;
  const title = safePage === 1 ? "全部作品 · PL Town 作品库" : `全部作品 第 ${safePage} 页 · PL Town 作品库`;
  const description = `浏览 PL Town 已收录的 ${Number(total).toLocaleString("zh-CN")} 篇社区作品，第 ${safePage} / ${pages} 页。`;
  const prev = safePage > 1 ? (safePage === 2 ? `${origin}/works` : `${origin}/works?page=${safePage - 1}`) : "";
  const next = safePage < pages ? `${origin}/works?page=${safePage + 1}` : "";
  const extra = `${prev ? `<link rel="prev" href="${escapeHtml(prev)}">` : ""}
${next ? `<link rel="next" href="${escapeHtml(next)}">` : ""}
${jsonLdScript({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: canonical,
    inLanguage: "zh-CN",
    isPartOf: origin,
    dateModified: lastmod || undefined,
  })}`;
  const items = records.map((row) => {
    const href = workUrl(origin, row.id);
    const snippet = truncateText(row.summary || "", 80);
    return `<li><a href="${escapeHtml(href)}"><span class="t">${escapeHtml(row.name || "未命名作品")}</span></a><div class="s">${escapeHtml(row.userName || "匿名")}${row.year ? ` · ${escapeHtml(row.year)}` : ""}${snippet ? ` · ${escapeHtml(snippet)}` : ""}</div></li>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
${baseHead({ origin, title, description, canonical, extra })}
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="topbar"><div class="topbar-in">
  <div class="brand-zh">作品库</div>
  <nav class="nav"><a href="${escapeHtml(origin)}/">检索</a></nav>
</div></header>
<main class="wrap">
  <h1>全部作品</h1>
  <p class="meta">共 ${Number(total).toLocaleString("zh-CN")} 篇 · 第 ${safePage} / ${pages} 页</p>
  <ul class="list">${items}</ul>
  <nav class="pager">
    ${prev ? `<a href="${escapeHtml(prev)}">上一页</a>` : ""}
    ${next ? `<a href="${escapeHtml(next)}">下一页</a>` : ""}
  </nav>
</main>
</body>
</html>`;
}

export function renderNotFoundPage(origin) {
  const canonical = `${origin}/works`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
${baseHead({ origin, title: "作品未找到 · PL Town 作品库", description: "该作品不存在或尚未收录。", canonical, robots: "noindex,follow" })}
<style>${PAGE_CSS}</style>
</head>
<body>
<main class="wrap">
  <h1>作品未找到</h1>
  <p class="meta"><a href="${escapeHtml(origin)}/works">浏览全部作品</a> · <a href="${escapeHtml(origin)}/">返回检索</a></p>
</main>
</body>
</html>`;
}

export function htmlResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=3600" : "no-store",
      ...extraHeaders,
    },
  });
}

export function textResponse(body, type, cache = "public, max-age=3600") {
  return new Response(body, {
    headers: {
      "content-type": type,
      "cache-control": cache,
    },
  });
}

export async function ensureSeoTables(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS seo_index_state (
      engine TEXT PRIMARY KEY,
      cursor_id TEXT,
      last_run_at TEXT,
      last_status TEXT
    )`),
  ]);
}

async function readState(env, engine) {
  const row = await env.DB.prepare(
    "SELECT engine, cursor_id, last_run_at, last_status FROM seo_index_state WHERE engine = ?",
  ).bind(engine).first();
  return row || { engine, cursor_id: "", last_run_at: "", last_status: "" };
}

async function writeState(env, engine, cursorId, status) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO seo_index_state (engine, cursor_id, last_run_at, last_status) VALUES (?, ?, ?, ?)
     ON CONFLICT(engine) DO UPDATE SET cursor_id = excluded.cursor_id, last_run_at = excluded.last_run_at, last_status = excluded.last_status`,
  ).bind(engine, cursorId || "", now, String(status || "").slice(0, 500)).run();
}

async function nextIds(env, afterId, limit) {
  const sql = afterId
    ? "SELECT id FROM data WHERE id > ? ORDER BY id ASC LIMIT ?"
    : "SELECT id FROM data ORDER BY id ASC LIMIT ?";
  const binds = afterId ? [afterId, limit] : [limit];
  const stmt = env.DB.prepare(sql);
  const result = await stmt.bind(...binds).all();
  return (result?.results || []).map((row) => String(row.id));
}

export function submissionCursor(state, now = Date.now()) {
  if (state?.cursor_id) return { skip: false, cursor: state.cursor_id };
  if (!state?.last_run_at) return { skip: false, cursor: "" };
  const then = Date.parse(state.last_run_at);
  if (!Number.isFinite(then) || now - then >= RESUBMIT_AFTER_MS) {
    return { skip: false, cursor: "" };
  }
  return { skip: true, cursor: "" };
}

function isSubmitSuccess(status) {
  return status >= 200 && status < 300;
}

async function submitUrlBatch({ env, engine, origin, limit, includeHome, send }) {
  const state = await readState(env, engine);
  const { skip, cursor } = submissionCursor(state);
  if (skip) return { submitted: 0, status: "waiting_resubmit" };

  const ids = await nextIds(env, cursor, limit);
  const urls = ids.map((id) => workUrl(origin, id));
  if (!cursor && ids.length && includeHome) {
    urls.unshift(`${origin}/`, `${origin}/works`);
  }
  if (urls.length === 0) {
    await writeState(env, engine, "", "caught_up");
    return { submitted: 0, status: "caught_up" };
  }

  try {
    const result = await send(urls);
    const status = Number(result?.status || 0);
    if (!isSubmitSuccess(status)) {
      await writeState(env, engine, cursor, `http_${status}:${String(result?.body || "").slice(0, 180)}`);
      return { submitted: 0, status, body: result?.body, cursor };
    }
    const nextCursor = ids.length ? ids[ids.length - 1] : "";
    const done = ids.length < limit;
    await writeState(env, engine, done ? "" : nextCursor, `http_${status}`);
    return { submitted: urls.length, status, body: result?.body, cursor: done ? "" : nextCursor };
  } catch (error) {
    await writeState(env, engine, cursor, String(error?.message || error));
    return { submitted: 0, error: String(error?.message || error) };
  }
}

export async function runSeoSubmission(env, { fetchImpl = fetch } = {}) {
  const origin = siteOrigin(env, new URL("https://s.pltown.online"));
  const summary = { origin, indexnow: null, baidu: null, pings: [] };
  await ensureSeoTables(env);

  const sitemapUrl = `${origin}/sitemap.xml`;
  const pingTargets = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];
  for (const pingUrl of pingTargets) {
    try {
      const response = await fetchImpl(pingUrl, { method: "GET" });
      summary.pings.push({ url: pingUrl, status: response.status });
    } catch (error) {
      summary.pings.push({ url: pingUrl, error: String(error?.message || error) });
    }
  }

  const indexnowKey = String(env?.INDEXNOW_KEY || "").trim();
  if (indexnowKey) {
    summary.indexnow = await submitUrlBatch({
      env,
      engine: "indexnow",
      origin,
      limit: INDEXNOW_BATCH,
      includeHome: true,
      send: async (urls) => {
        const response = await fetchImpl("https://api.indexnow.org/indexnow", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(buildIndexNowPayload(origin, indexnowKey, urls)),
        });
        return { status: response.status };
      },
    });
  }

  const baiduToken = String(env?.BAIDU_ZHANZHANG_TOKEN || "").trim();
  if (baiduToken) {
    summary.baidu = await submitUrlBatch({
      env,
      engine: "baidu",
      origin,
      limit: BAIDU_BATCH,
      includeHome: true,
      send: async (urls) => {
        const endpoint = `http://data.zz.baidu.com/urls?site=${encodeURIComponent(origin)}&token=${encodeURIComponent(baiduToken)}`;
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: buildBaiduBody(urls),
        });
        const body = await response.text();
        return { status: response.status, body };
      },
    });
  }

  return summary;
}

export function isIndexNowKeyPath(pathname, key) {
  if (!key) return false;
  return pathname === `/${key}.txt`;
}

export function maybeCanonicalRedirect(request, env, url) {
  const origin = String(env?.SITE_ORIGIN || "").trim().replace(/\/+$/, "");
  if (!origin) return null;
  let canonicalHost;
  try {
    canonicalHost = new URL(origin).host;
  } catch {
    return null;
  }
  if (url.host === canonicalHost) return null;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return null;
  if (url.pathname.startsWith("/api/")) return null;
  const target = new URL(url.pathname + url.search, origin);
  return Response.redirect(target.toString(), 301);
}
