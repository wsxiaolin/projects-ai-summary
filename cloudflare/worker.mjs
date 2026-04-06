import { generatedAt, records } from "./data/records.mjs";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

const MAX_LIMIT = 50;
const GENERIC_KEYWORDS = new Set([
  "study",
  "research",
  "paper",
  "science",
  "technology",
  "method",
  "analysis",
  "model",
  "学术",
  "研究",
  "论文",
  "科学",
  "技术",
  "方法",
  "分析",
  "模型",
]);

function optionalNumber(value) {
  if (value == null || value === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function tokenizeKeywords(value) {
  return String(value || "")
    .split(/[,\s|，；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniq(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function includesIgnoreCase(value, query) {
  return String(value || "").toLowerCase().includes(String(query || "").toLowerCase());
}

function fieldMatches(record, keyword) {
  return [
    record.name,
    record.summary,
    record.userName,
    ...(record.keyWords || []),
    ...(record.primaryDiscipline || []),
    ...(record.secondaryDiscipline || []),
  ].some((value) => includesIgnoreCase(value, keyword));
}

function matchPriority(record, keyword) {
  if (includesIgnoreCase(record.name, keyword)) return 1;
  if ((record.keyWords || []).some((value) => includesIgnoreCase(value, keyword))) return 2;
  if (
    (record.primaryDiscipline || []).some((value) => includesIgnoreCase(value, keyword)) ||
    (record.secondaryDiscipline || []).some((value) => includesIgnoreCase(value, keyword))
  ) {
    return 3;
  }
  if (includesIgnoreCase(record.userName, keyword)) return 4;
  if (includesIgnoreCase(record.summary, keyword)) return 5;
  return 6;
}

function bestPriority(record, keywords) {
  if (keywords.length === 0) return 99;
  return keywords.reduce((best, keyword) => Math.min(best, matchPriority(record, keyword)), 99);
}

function matchCount(record, keywords) {
  return keywords.reduce((count, keyword) => count + (fieldMatches(record, keyword) ? 1 : 0), 0);
}

function parseExpansionContent(content, originalKeywords) {
  try {
    const parsed = JSON.parse(String(content || ""));
    if (!parsed || !Array.isArray(parsed.extraKeywords)) return [];

    return uniq(parsed.extraKeywords)
      .filter((candidate) => {
        const normalized = candidate.toLowerCase();
        if (!normalized || GENERIC_KEYWORDS.has(normalized)) return false;
        return !originalKeywords.some((keyword) => keyword.toLowerCase() === normalized);
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function expandKeywordsWithGroq(env, keywords) {
  const groqApiKey = env?.GROQ_API_KEY;
  if (!groqApiKey || keywords.length === 0) return [];

  const groqBaseUrl = String(env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const groqModel = String(env.GROQ_KEYWORD_MODEL || env.GROQ_MODEL || "llama-3.1-8b-instant");

  try {
    const response = await fetch(`${groqBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "pl-search-cloudflare/1.0",
      },
      body: JSON.stringify({
        model: groqModel,
        temperature: 0.2,
        max_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              '你是搜索纠错与对齐助手。只输出 JSON：{"extraKeywords": string[]}。只允许返回拼写纠错、同一实体别名、跨语言对齐、用户真实会搜索的等价短语。禁止泛化到更大领域，禁止长句。',
          },
          {
            role: "user",
            content: `原始关键词：${keywords.join(" | ")}`,
          },
        ],
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return parseExpansionContent(content, keywords);
  } catch {
    return [];
  }
}

async function searchSnapshot(params, env) {
  const keywords = tokenizeKeywords(params.get("keywords")).slice(0, 8);
  const author = params.get("author");
  const year = optionalNumber(params.get("year"));
  const yearFrom = optionalNumber(params.get("yearFrom"));
  const yearTo = optionalNumber(params.get("yearTo"));
  const limit = Math.min(Math.max(Number(params.get("limit") || 20), 1), MAX_LIMIT);
  const aiExpand = params.get("aiExpand");
  const shouldAiExpand = aiExpand !== "0" && aiExpand !== "false";
  const extraKeywords = shouldAiExpand ? await expandKeywordsWithGroq(env, keywords) : [];
  const effectiveKeywords = uniq([...keywords, ...extraKeywords]);

  const filtered = records
    .filter((record) => {
      const recordYear = Number(record.year);
      if (effectiveKeywords.length && !effectiveKeywords.some((keyword) => fieldMatches(record, keyword))) {
        return false;
      }
      if (author && !includesIgnoreCase(record.userName, author) && !includesIgnoreCase(record.editorName, author)) {
        return false;
      }
      if (Number.isFinite(year) && recordYear !== year) return false;
      if (Number.isFinite(yearFrom) && recordYear < yearFrom) return false;
      if (Number.isFinite(yearTo) && recordYear > yearTo) return false;
      return true;
    })
    .map((record) => ({
      ...record,
      _priority: bestPriority(record, effectiveKeywords),
      _matchCount: matchCount(record, effectiveKeywords),
    }))
    .sort((left, right) => {
      if (left._priority !== right._priority) return left._priority - right._priority;
      if (left._matchCount !== right._matchCount) return right._matchCount - left._matchCount;
      if (left.year !== right.year) return right.year - left.year;
      return left.readability - right.readability;
    })
    .slice(0, limit)
    .map(({ _priority, _matchCount, ...record }) => record);

  return {
    keywords,
    extraKeywords,
    records: filtered,
  };
}

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...jsonHeaders,
          "access-control-allow-methods": "GET,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (request.method !== "GET") {
      return ok({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/" || url.pathname === "/api/meta") {
      return ok({
        service: "pl-search-cloudflare",
        generatedAt,
        totalRecords: records.length,
        maxLimit: MAX_LIMIT,
        aiKeywordExpansion: Boolean(env?.GROQ_API_KEY),
        endpoints: ["/api/search?keywords=...", "/api/record?id=..."],
      });
    }

    if (url.pathname === "/api/search") {
      const result = await searchSnapshot(url.searchParams, env);
      return ok({
        generatedAt,
        count: result.records.length,
        keywords: result.keywords,
        extraKeywords: result.extraKeywords,
        aiExpanded: result.extraKeywords.length > 0,
        records: result.records,
      });
    }

    if (url.pathname === "/api/record") {
      const id = url.searchParams.get("id");
      if (!id) return ok({ error: "id is required" }, 400);

      const record = records.find((item) => item.id === id);
      if (!record) return ok({ error: "Not found" }, 404);
      return ok({ record, generatedAt });
    }

    return ok({ error: "Not found" }, 404);
  },
};
