import axios from "axios";
import { config } from "../config";

export interface QueryExpansionResult {
  extraKeywords: string[];
  reason?: string;
}

const GENERIC_KEYWORDS = new Set([
  "学术",
  "研究",
  "论文",
  "科学",
  "技术",
  "理论",
  "实验",
  "方法",
  "分析",
  "模型",
  "study",
  "research",
  "paper",
  "science",
  "technology",
  "method",
  "analysis",
  "model",
]);

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function safeJsonParse(content: string): QueryExpansionResult | null {
  try {
    const parsed = JSON.parse(content) as QueryExpansionResult;
    if (!parsed || !Array.isArray(parsed.extraKeywords)) return null;
    return {
      extraKeywords: uniq(parsed.extraKeywords).slice(0, 5),
      reason:
        typeof parsed.reason === "string" ? parsed.reason.trim() : undefined,
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
  return `${config.groqBaseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function getGroqErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const apiMessage =
      typeof error.response?.data?.error?.message === "string"
        ? error.response.data.error.message.trim()
        : undefined;
    if (status && apiMessage) return `${status} ${apiMessage}`;
    if (status) return `${status} ${error.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

// function extractHanChars(value: string): string[] {
//   return Array.from(value).filter(char => /[\u4E00-\u9FFF]/u.test(char));
// }

function isSafeExpandedKeyword(
  candidate: string,
  input: string,
  originalKeywords: string[],
): boolean {
  const normalized = candidate.trim();
  if (!normalized) return false;
  if (GENERIC_KEYWORDS.has(normalized.toLowerCase())) return false;

  // const originalText = `${input} ${originalKeywords.join(' ')}`;
  // const originalHan = new Set(extractHanChars(originalText));
  // const candidateHan = Array.from(new Set(extractHanChars(normalized)));

  // if (candidateHan.length > 0 && originalHan.size > 0) {
  //   const overlapCount = candidateHan.filter(char => originalHan.has(char)).length;
  //   if (overlapCount >= 1) {
  //       return true;
  //   } else {
  //       return true;
  //   }
  // }

  return true;
}

export async function expandKeywordsWithGroq(
  input: string,
  originalKeywords: string[],
): Promise<QueryExpansionResult> {
  const url = getGroqChatCompletionsUrl();
  if (!url) return { extraKeywords: [] };

  const prompt = `
  你是一个“搜索查询纠错与对齐引擎”，主要目标是修复和标准化用户输入，而不是进行知识扩展。

请输出 JSON：
{"extraKeywords": string[], "reason": string}

【核心原则】
优先进行“纠错”和“等价对齐”，禁止无关扩展。

【处理优先级】

1. 拼写纠错（最高优先级）
   - 修复拼写错误或近似词（如 Reump → Trump）
   - 可输出正确词及其常见中文/英文名称（如 特朗普 / Trump / Donald Trump）

2. 专有名词对齐
   - 如果是人名、术语、地名等：
     仅允许输出：
     - 标准全名（Trump → Donald Trump）
     - 常见别名或翻译（特朗普）
     - 英文/中文对应

3. 错别字纠正
   - 如 阿式园 → 阿氏圆 / 阿波罗尼斯圆

4. 缩写展开
   - NLP → 自然语言处理 / Natural Language Processing

【严格限制】

- ❌ 禁止上位概念扩展（如 阿氏圆 → 圆锥曲线）
- ❌ 禁止学科泛化（如 任意词 → 数学体系）
- ❌ 禁止基于词面联想进行扩展（如看到“圆”就扩展几何体系）
- ❌ 禁止生成与输入语义不直接等价或高度相关的词

【判断标准（非常关键）】

只有满足以下之一，才允许加入 extraKeywords：
- 拼写纠正结果
- 同一实体的不同表达（全名 / 简写 / 翻译）
- 明确的同义词或别名

否则：
→ 返回 []

【输出要求】

- 最多 5 个关键词
- 必须是短词或短语
- 不要为了凑数量输出

【示例（不可复用模式）】

输入: "Reump"
输出: {"extraKeywords": ["Trump", "特朗普", "Donald Trump"], "reason": "拼写纠错并提供标准名称"}

输入: "Trump"
输出: {"extraKeywords": ["Donald Trump", "特朗普"], "reason": "补充标准全名与中文翻译"}

输入: "阿式园"
输出: {"extraKeywords": ["阿氏圆", "阿波罗尼斯圆", "Apollonian circle"], "reason": "纠正错别字并提供标准术语"}


输入: "随便写点"
输出: {"extraKeywords": [], "reason": "无可纠错或对齐内容"}
  `;

  try {
    const resp = await axios.post<GroqChatCompletionResponse>(
      url,
      {
        model: config.groqModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "只输出 JSON，不要输出 markdown。extraKeywords 仅保留短词，避免长句。",
          },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${config.groqApiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "pl-s-2-groq-intent/1.0",
        },
        timeout: 15000,
      },
    );

    const content = resp.data.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonParse(content);
    if (!parsed) {
      console.warn("[Groq] 关键词扩展返回了非预期 JSON，将使用原查询。");
      return { extraKeywords: [] };
    }

    const deduped = uniq(
      parsed.extraKeywords.filter((candidate) => {
        if (!isSafeExpandedKeyword(candidate, input, originalKeywords))
          return false;
        return !originalKeywords.some(
          (origin) => origin.toLowerCase() === candidate.toLowerCase(),
        );
      }),
    ).slice(0, 10);
    console.log("[Groq] 获取关键词扩展结果:", deduped, parsed.reason ?? "");
    return { extraKeywords: deduped, reason: parsed.reason };
  } catch (error) {
    console.warn(
      "[Groq] 关键词扩展失败，将使用原查询:",
      getGroqErrorMessage(error),
    );
    return { extraKeywords: [] };
  }
}
