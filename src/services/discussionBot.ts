// @ts-expect-error
import pl from 'plweb';

import { config } from '../config';
import { SearchFilters, searchRecords } from '../db/repository';
import { chatBrieflyWithGroq, expandKeywordsWithGroq } from './groqIntent';

function parseNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tokenizeKeywords(value: string): string[] {
  return value
    .split(/[,\s|，；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseQuery(content: string): SearchFilters | null {
  const message = content.trim();
  if (!message) return null;

  if (message.startsWith('#查询')) {
    const payload = message.replace(/^#查询\s*/, '');
    const chunks = payload.split(/\s+/).map((item) => item.trim()).filter(Boolean);
    const filters: SearchFilters = {};

    for (const chunk of chunks) {
      const parts = chunk.split(/[=:：]/);
      const key = parts.shift()?.trim().toLowerCase();
      const rawValue = parts.join(':').trim();
      if (!key || !rawValue) continue;

      if (key === '关键字' || key === '关键词' || key === 'kw' || key === 'keyword') {
        filters.keywords = tokenizeKeywords(rawValue);
      } else if (key === '作者' || key === 'author') {
        filters.author = rawValue;
      } else if (key === '年份' || key === 'year') {
        filters.year = parseNumber(rawValue);
      } else if (key === '年份范围' || key === 'range') {
        const [from, to] = rawValue.split('-').map((item) => parseNumber(item.trim()));
        filters.yearFrom = from;
        filters.yearTo = to;
      } else if (key === 'limit') {
        filters.limit = parseNumber(rawValue);
      }
    }

    return filters;
  }

  const keywordMatch = message.match(/^#查词[:：](.+)$/);
  if (keywordMatch) {
    return {
      keywords: tokenizeKeywords(keywordMatch[1]).slice(0, 6),
      limit: 20,
    };
  }

  const authorMatch = message.match(/^#查作者[:：](.+)$/);
  if (authorMatch) {
    return {
      author: authorMatch[1].trim(),
      limit: 20,
    };
  }

  const yearMatch = message.match(/^#查年份[:：](\d{4})(?:-(\d{4}))?$/);
  if (yearMatch) {
    if (yearMatch[2]) {
      return {
        yearFrom: Number(yearMatch[1]),
        yearTo: Number(yearMatch[2]),
        limit: 20,
      };
    }

    return {
      year: Number(yearMatch[1]),
      limit: 20,
    };
  }

  if (!message.startsWith('#')) {
    const keywords = tokenizeKeywords(message);
    if (keywords.length > 0) {
      return {
        keywords,
        limit: 20,
      };
    }
  }

  return null;
}

function helpMessage(): string {
  return [
    '支持的查询方式：',
    '1. 直接输入关键词，例如：电磁学 光学',
    '2. #查词: 电磁学 光学',
    '3. #查作者: 张三',
    '4. #查年份: 2024 或 #查年份: 2021-2024',
    '5. #查询 关键词=电磁学|光学 作者=张三 年份范围=2021-2024 limit=8',
  ].join('\n');
}

function parseJsonArray(raw: string): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function maybeExpandFilters(
  content: string,
  filters: SearchFilters,
): Promise<{ expanded: SearchFilters; extraKeywords: string[] }> {
  const originalKeywords =
    filters.keywords?.map((value) => value.trim()).filter(Boolean) ?? [];
  if (originalKeywords.length === 0) {
    return { expanded: filters, extraKeywords: [] };
  }

  const { extraKeywords } = await expandKeywordsWithGroq(content, originalKeywords);
  if (extraKeywords.length === 0) {
    return { expanded: filters, extraKeywords: [] };
  }

  return {
    expanded: {
      ...filters,
      keywords: [...originalKeywords, ...extraKeywords].slice(0, 10),
    },
    extraKeywords,
  };
}

function buildQuerySummary(filters: SearchFilters, extraKeywords: string[]): string[] {
  const lines: string[] = [];

  if (filters.keywords?.length) {
    lines.push(`关键词: ${filters.keywords.join(', ')}`);
  }
  if (extraKeywords.length) {
    lines.push(`扩展词: ${extraKeywords.join(', ')}`);
  }
  if (filters.author) {
    lines.push(`作者: ${filters.author}`);
  }
  if (typeof filters.year === 'number') {
    lines.push(`年份: ${filters.year}`);
  }
  if (typeof filters.yearFrom === 'number' || typeof filters.yearTo === 'number') {
    lines.push(`年份范围: ${filters.yearFrom ?? '不限'} - ${filters.yearTo ?? '不限'}`);
  }

  return lines;
}

async function buildNoMatchMessage(
  content: string,
  filters: SearchFilters,
  extraKeywords: string[],
): Promise<string> {
  const lines = ['没查到数据库里的匹配记录。', ...buildQuerySummary(filters, extraKeywords), '', helpMessage()];
  const chat = await chatBrieflyWithGroq(content);
  console.log('[Bot] Groq chat response:', chat);
  if (chat) {
    lines.push('', `顺便聊一句: ${chat}`);
  }

  return lines.join('\n');
}

async function processQueryMessage(content: string): Promise<string> {
  const filters = parseQuery(content);
  if (!filters) return helpMessage();

  const { expanded, extraKeywords } = await maybeExpandFilters(content, filters);
  const rows = await searchRecords(expanded);

  if (rows.length === 0) {
    return buildNoMatchMessage(content, filters, extraKeywords);
  }

  const querySummary = buildQuerySummary(filters, extraKeywords);
  const resultLines = rows.map((record) => {
    const keywords = parseJsonArray(record.keyWords).slice(0, 4).join(', ');
    const summary = record.summary ? `${record.summary.slice(0, 100)}${record.summary.length > 100 ? '...' : ''}` : '无摘要';

    return [
      `<discussion=${record.id}>${record.name}</discussion> | ${record.userName} | ${record.year}`,
      `摘要: ${summary}`,
      `关键词: ${keywords || '无'}`,
    ].join('\n');
  });

  const header = [
    '【查询内容】',
    ...(querySummary.length > 0 ? querySummary : ['未指定过滤条件']),
    '',
    `【查询结果】共 ${rows.length} 条`,
  ].join('\n');

  return `<size=28>${header}\n${resultLines.join('\n\n')}</size>`;
}

function createBotInstance() {
  return new pl.Bot(
    config.plUsername,
    config.plPassword,
    async (msg: { Content: string }) => {
      try {
        return await processQueryMessage(msg.Content);
      } catch (error) {
        console.error(
          '[Bot] Query failed:',
          error instanceof Error ? error.message : String(error),
        );
        return '处理查询时出错，请稍后重试。';
      }
    },
    (msg: any) => {
      console.log(
        `[Bot] captured ${msg.ID} from ${msg.Nickname}: ${String(msg.Content).slice(0, 50)}`,
      );
    },
    (msg: any) => {
      console.log(`[Bot] replied ${msg.ID}`);
    },
    (finished: Set<string>) => {
      console.log(`[Bot] cycle finished, processed=${finished.size}`);
    },
  );
}

export async function runDiscussionBot(): Promise<void> {
  const bot = createBotInstance();

  console.log('[Bot] initializing...');
  await bot.init(config.discussionId, 'Discussion', {
    ignoreReplyToOters: true,
    readHistory: true,
    replyRequired: false,
  });

  console.log('[Bot] polling started');
  const intervalId = setInterval(async () => {
    try {
      await bot.run();
    } catch (error) {
      console.error(
        '[Bot] polling error:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }, 5000);

  process.once('SIGINT', () => {
    console.log('[Bot] stopping');
    clearInterval(intervalId);
    process.exit(0);
  });

  await new Promise<void>(() => {});
}

export async function runDiscussionBotOnce(): Promise<void> {
  const bot = createBotInstance();

  console.log('[Bot] initializing...');
  await bot.init(config.discussionId, 'Discussion', {
    ignoreReplyToOters: true,
    readHistory: true,
    replyRequired: false,
  });

  console.log('[Bot] running once');
  await bot.run();
  console.log('[Bot] done');
}
