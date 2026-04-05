// @ts-expect-error
import pl from 'plweb';
import { config } from '../config';
import { SearchFilters, searchRecords } from '../db/repository';
import { expandKeywordsWithGroq } from './groqIntent';

function parseNumber(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseQuery(content: string): SearchFilters | null {
  const msg = content.trim();

  // 1) 键值查询: #查询 关键词=电磁学,光学 作者=张三 年份=2024 limit=8
  if (msg.startsWith('#查询')) {
    const payload = msg.replace(/^#查询\s*/, '');
    const chunks = payload.split(/\s+/).map((x) => x.trim()).filter(Boolean);
    const filters: SearchFilters = {};

    for (const chunk of chunks) {
      const [rawKey, ...rest] = chunk.split(/[=:：]/);
      const rawValue = rest.join(':').trim();
      const key = rawKey.trim();
      if (!rawValue) continue;

      if (key === '关键词' || key === 'kw') {
        filters.keywords = rawValue.split(/[，,|]/).map((x) => x.trim()).filter(Boolean);
      } else if (key === '作者') {
        filters.author = rawValue;
      } else if (key === '年份') {
        filters.year = parseNumber(rawValue);
      } else if (key === '年份范围') {
        const [from, to] = rawValue.split('-').map((v) => parseNumber(v.trim()));
        filters.yearFrom = from;
        filters.yearTo = to;
      } else if (key === 'limit') {
        filters.limit = parseNumber(rawValue);
      }
    }

    return filters;
  }

  // 2) 兼容老格式: #查词: 电磁学,光学
  const keywordMatch = msg.match(/^#查词[:：](.+)$/);
  if (keywordMatch) {
    return {
      keywords: keywordMatch[1]
        .split(/[，,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 6),
      limit: 20
    };
  }

  // 3) 快捷格式: #查作者
  const authorMatch = msg.match(/^#查作者[:：](.+)$/);
  if (authorMatch) return { author: authorMatch[1].trim(), limit: 20 };

  const yearMatch = msg.match(/^#查年份[:：](\d{4})(?:-(\d{4}))?$/);
  if (yearMatch) {
    if (yearMatch[2]) {
      return {
        yearFrom: Number(yearMatch[1]),
        yearTo: Number(yearMatch[2]),
        limit: 20
      };
    }
    return { year: Number(yearMatch[1]), limit: 20 };
  }

  // 4) 默认查询：没有#指定时，把内容作为关键词在所有字段搜索，最多20条结果
  if (!msg.startsWith('#')) {
    const keywords = msg
      .split(/[，,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (keywords.length > 0) {
      return {
        keywords,
        limit: 20
      };
    }
  }

  return null;
}

function helpMessage(): string {
  return [
    '支持多种查询格式（最多返回20条结果）：',
    '1) 直接输入关键词（例如：电磁学）',
    '2) #查词: 电磁学,光学',
    '3) #查作者: 用户名',
    '4) #查年份: 2024 或 #查年份: 2021-2024',
    '5) #查询 关键词=电磁学,光学 作者=张三 年份范围=2021-2024 limit=15'
  ].join('\n');
}

async function maybeExpandFilters(content: string, filters: SearchFilters): Promise<{ expanded: SearchFilters; extraKeywords: string[] }> {
  const originalKeywords = filters.keywords?.map(x => x.trim()).filter(Boolean) ?? [];
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

async function processQueryMessage(content: string): Promise<string> {
  const filters = parseQuery(content);
  if (!filters) return helpMessage();

  const { expanded, extraKeywords } = await maybeExpandFilters(content, filters);
  const rows = await searchRecords(expanded);
  if (rows.length === 0) {
    return '未命中记录，请缩小条件或更换关键词。\n' + helpMessage();
  }

  // 构建查询信息摘要
  let queryInfo = '【查询内容】\n';
  if (filters.keywords && filters.keywords.length > 0) {
    queryInfo += `关键词: ${filters.keywords.join(', ')}\n`;
  }
  if (extraKeywords.length > 0) {
    queryInfo += `模糊扩展: ${extraKeywords.join(', ')}\n`;
  }
  if (filters.author) {
    queryInfo += `作者: ${filters.author}\n`;
  }
  if (filters.year) {
    queryInfo += `年份: ${filters.year}\n`;
  }
  if (filters.yearFrom || filters.yearTo) {
    queryInfo += `年份范围: ${filters.yearFrom ?? '不限'} - ${filters.yearTo ?? '不限'}\n`;
  }
  queryInfo += `\n【查询结果】(共${rows.length}条)\n`;

  // 构建结果列表，包含摘要和关键词
  const lines = rows.map((x) => {
    const keywords = x.keyWords ? JSON.parse(x.keyWords).slice(0, 3).join(', ') : '';
    const summary = x.summary ? x.summary.substring(0, 100) : '';
    return `<discussion=${x.id}>${x.name}</discussion> | ${x.userName} | ${x.year}
        📝 摘要: ${summary}${summary.length >= 50 ? '...' : ''}
        🔑 关键词: ${keywords}`;
  });

  return `<size=28>${queryInfo}${lines.join('\n\n')}</size>`;
}

export async function runDiscussionBot(): Promise<void> {
  const bot = new pl.Bot(
    config.plUsername,
    config.plPassword,
    // processFn：处理消息的函数
    async (msg: { Content: string }) => {
      try {
        return await processQueryMessage(msg.Content);
      } catch (error) {
        console.error('[Bot] 查询处理失败:', error instanceof Error ? error.message : String(error));
        return '处理查询时出错，请稍后重试。';
      }
    },
    // catched：捕获消息后的回调
    (msg: any) => {
      console.log(`[Bot] 捕获消息: ${msg.ID} 来自 ${msg.Nickname}: ${msg.Content.substring(0, 50)}`);
    },
    // replyed：成功回复后的回调
    (msg: any) => {
      console.log(`[Bot] 回复成功: ${msg.ID}`);
    },
    // finnished：任务队列清空后的回调
    (finnish: Set<string>) => {
      console.log(`[Bot] 本轮处理完成，已处理 ${finnish.size} 条消息`);
    }
  );

  try {
    console.log('[Bot] 初始化中...');
    await bot.init(config.discussionId, 'Discussion', {
      ignoreReplyToOters: true,
      readHistory: true,
      replyRequired: false
    });
    
    console.log('[Bot] 启动机器人...');
    // 开启轮询，间隔5秒检查一次新消息
    const intervalId = setInterval(async () => {
      try {
        await bot.run();
      } catch (error) {
        console.error('[Bot] 运行出错:', error instanceof Error ? error.message : String(error));
      }
    }, 5000);
    
    // 保持进程运行
    process.on('SIGINT', () => {
      console.log('[Bot] 机器人停止');
      clearInterval(intervalId);
      process.exit(0);
    });
  } catch (error) {
    console.error('[Bot] 启动失败:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * 运行讨论机器人一轮（处理一批消息后自动退出）
 */
export async function runDiscussionBotOnce(): Promise<void> {
  const bot = new pl.Bot(
    config.plUsername,
    config.plPassword,
    // processFn：处理消息的函数
    async (msg: { Content: string }) => {
      try {
        return await processQueryMessage(msg.Content);
      } catch (error) {
        console.error('[Bot] 查询处理失败:', error instanceof Error ? error.message : String(error));
        return '处理查询时出错，请稍后重试。';
      }
    },
    // catched：捕获消息后的回调
    (msg: any) => {
      console.log(`[Bot] 捕获消息: ${msg.ID} 来自 ${msg.Nickname}: ${msg.Content.substring(0, 50)}`);
    },
    // replyed：成功回复后的回调
    (msg: any) => {
      console.log(`[Bot] 回复成功: ${msg.ID}`);
    },
    // finnished：任务队列清空后的回调
    (finnish: Set<string>) => {
      console.log(`[Bot] 本轮处理完成，已处理 ${finnish.size} 条消息`);
    }
  );

  try {
    console.log('[Bot] 初始化中...');
    await bot.init(config.discussionId, 'Discussion', {
      ignoreReplyToOters: true,
      readHistory: true,
      replyRequired: false
    });
    
    console.log('[Bot] 运行一轮...');
    // 仅运行一次，不设置轮询
    await bot.run();
    
    console.log('[Bot] 一轮处理完成');
  } catch (error) {
    console.error('[Bot] 启动失败:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}
