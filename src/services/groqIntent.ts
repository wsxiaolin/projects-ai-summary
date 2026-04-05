import axios from 'axios';
import { config } from '../config';

export interface QueryExpansionResult {
  extraKeywords: string[];
  reason?: string;
}

const GENERIC_KEYWORDS = new Set([
  '学术',
  '研究',
  '论文',
  '科学',
  '技术',
  '理论',
  '实验',
  '方法',
  '分析',
  '模型',
  'study',
  'research',
  'paper',
  'science',
  'technology',
  'method',
  'analysis',
  'model',
]);

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map(v => v.trim()).filter(Boolean)));
}

function safeJsonParse(content: string): QueryExpansionResult | null {
  try {
    const parsed = JSON.parse(content) as QueryExpansionResult;
    if (!parsed || !Array.isArray(parsed.extraKeywords)) return null;
    return {
      extraKeywords: uniq(parsed.extraKeywords).slice(0, 5),
      reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : undefined,
    };
  } catch {
    return null;
  }
}

interface GroqChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

function getGroqChatCompletionsUrl(): string | null {
  if (!config.groqApiKey) return null;
  return `${config.groqBaseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function getGroqErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const apiMessage =
      typeof error.response?.data?.error?.message === 'string'
        ? error.response.data.error.message.trim()
        : undefined;
    if (status && apiMessage) return `${status} ${apiMessage}`;
    if (status) return `${status} ${error.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

function extractHanChars(value: string): string[] {
  return Array.from(value).filter(char => /[\u4E00-\u9FFF]/u.test(char));
}

function isSafeExpandedKeyword(candidate: string, input: string, originalKeywords: string[]): boolean {
  const normalized = candidate.trim();
  if (!normalized) return false;
  if (GENERIC_KEYWORDS.has(normalized.toLowerCase())) return false;

  const originalText = `${input} ${originalKeywords.join(' ')}`;
  const originalHan = new Set(extractHanChars(originalText));
  const candidateHan = Array.from(new Set(extractHanChars(normalized)));

  if (candidateHan.length > 0 && originalHan.size > 0) {
    const overlapCount = candidateHan.filter(char => originalHan.has(char)).length;
    const minOverlap = originalHan.size === 1 || candidateHan.length === 1 ? 1 : 2;
    return overlapCount >= minOverlap;
  }

  return true;
}

export async function expandKeywordsWithGroq(input: string, originalKeywords: string[]): Promise<QueryExpansionResult> {
  const url = getGroqChatCompletionsUrl();
  if (!url) return { extraKeywords: [] };

  const prompt = [
    '你是查询词扩展器。',
    '任务：基于用户原始输入，给出最多5个“可能同义/模糊匹配”的额外关键词。如果用户输入为自然语言，拆分为可用关键词',
    '硬约束：不能改变查询意图，不得把学科改成关键词，不得把作者改成关键词。',
    '硬约束：只允许输出与原词高度相关的近义词、别名、简称、常见变体；如果没有安全候选，返回空数组。',
    '硬约束：只返回 JSON，格式为 {"extraKeywords": string[], "reason": string}。',
    `用户原始输入: ${input}`,
    `已有关键词: ${originalKeywords.join(', ') || '(无)'}`,
  ].join('\n');

  try {
    const resp = await axios.post<GroqChatCompletionResponse>(
      url,
      {
        model: config.groqModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '只输出 JSON，不要输出 markdown。extraKeywords 仅保留短词，避免长句。',
          },
          { role: 'user', content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${config.groqApiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'pl-s-2-groq-intent/1.0',
        },
        timeout: 15000,
      },
    );

    const content = resp.data.choices?.[0]?.message?.content ?? '';
    const parsed = safeJsonParse(content);
    if (!parsed) {
      console.warn('[Groq] 关键词扩展返回了非预期 JSON，将使用原查询。');
      return { extraKeywords: [] };
    }

    const deduped = uniq(
      parsed.extraKeywords.filter(candidate => {
        if (!isSafeExpandedKeyword(candidate, input, originalKeywords)) return false;
        return !originalKeywords.some(origin => origin.toLowerCase() === candidate.toLowerCase());
      }),
    ).slice(0, 5);
    console.log('[Groq] 获取关键词扩展结果:', deduped, parsed.reason ?? '');
    return { extraKeywords: deduped, reason: parsed.reason };
  } catch (error) {
    console.warn('[Groq] 关键词扩展失败，将使用原查询:', getGroqErrorMessage(error));
    return { extraKeywords: [] };
  }
}
