import axios from "axios";
import { config } from "../config";
import { logAiTrace } from "./runLogger";

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
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      reasoning?: string | null;
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

function logGroqResponse(label: string, content: string): void {
  if (!content.trim()) return;
  logAiTrace(label, content);
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
  你是一个“搜索查询纠错与对齐引擎，用于把用户在搜索引擎的输入进行有理由的纠错和联想”。

请输出 JSON：
{"extraKeywords": string[], "reason": string}

你的目标是：让用户的查询更容易命中正确结果，而不是扩展知识范围。

【允许的扩展类型（仅限以下）】

1. 拼写纠错
   - Reump → Trump

2. 同一实体的不同表达
   - Trump → Donald Trump / 特朗普
   - 阿氏圆 → 阿波罗尼斯圆

3. 跨语言映射（非常重要）
   - galgame → 视觉小说 / visual novel
   - iPhone → 苹果手机

4. 领域内常用别称 / 习惯说法
   - 必须是用户真实可能搜索的等价表达
   - 例如：galgame ↔ 视觉小说

【复合语义拆解（重要）】

当输入为“多个概念组合”或“描述性短语”时，可以进行适度拆解与补全，以提升检索效果。

允许：
- 提取核心实体（如“秋水仙素”）
- 提取关键过程或对象（如“细胞分裂”）
- 补充直接相关的关键机制或结果（如“染色体加倍”）

要求：
- 所有补充词必须直接来源于原语义
- 必须是用户搜索时可能使用的关键词
- 不得扩展到更大的学科或无关领域

示例：

输入: "秋水仙素诱导分裂"
输出: {"extraKeywords": ["秋水仙素", "colchicine", "细胞分裂", "染色体加倍"], "reason": "拆解复合概念并补充关键检索词"}

输入: "DNA复制过程"
输出: {"extraKeywords": ["DNA复制", "半保留复制"], "reason": "提取核心概念"}

输入: "阿氏圆"
输出: {"extraKeywords": ["阿波罗尼斯圆"], "reason": "单一术语，不进行拆解"}
【严格禁止】

- ❌ 上位概念扩展（如 阿氏圆 → 圆锥曲线 ； ACG -> 游戏）
- ❌ 可能引发不相关的搜索结果：ACG变为动漫是可以的，但是动画就不行
- ❌ 学科扩展（如 扩展到数学/物理体系）
- ❌ 泛化分类（如 Trump → 政治人物）
- ❌ 仅因词面相似进行联想

【判断标准】

只有当新关键词满足以下条件之一，才允许输出：
- 与原词指向同一事物
- 或是用户在实际搜索中会互换使用的表达

否则：
→ 返回 []

【输出要求】

- 最多 5 个
- 简短词或短语
- 不要凑数量

【示例（不可复用模式）】

输入: "galgame"
输出: {"extraKeywords": ["视觉小说", "visual novel"], "reason": "领域内常用等价表达"}

输入: "Reump"
输出: {"extraKeywords": ["Trump", "特朗普", "Donald Trump"], "reason": "拼写纠错与名称对齐"}

输入: "阿氏圆"
输出: {"extraKeywords": ["阿波罗尼斯圆", "Apollonian circle"], "reason": "标准术语"}

输入: "阿氏圆的研究"
输出: {"extraKeywords": ["阿波罗尼斯圆"], "reason": "术语对齐"}

输入: "随便写点"
输出: {"extraKeywords": [], "reason": "无有效对齐"}
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
          {
            role: "user",
            content: `输入: ${input}`,
          },
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
    logGroqResponse(`Groq keyword-expansion model=${config.groqModel}`, content);
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

export async function chatBrieflyWithGroq(input: string): Promise<string | null> {
  const url = getGroqChatCompletionsUrl();
  if (!url) return null;

  try {
    const resp = await axios.post<GroqChatCompletionResponse>(
      url,
      {
        model: config.groqChatModel,
        temperature: 0.5,
        include_reasoning: false,
        max_tokens: config.groqChatMaxTokens,
        messages: [
          {
            role: "system",
            content:
              "你要尽可能满足用户的需求",
          },
          {
            role: "user",
            content: input,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${config.groqApiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "pl-s-2-groq-chat/1.0",
        },
        timeout: 15000,
      },
    );

    const choice = resp.data.choices?.[0];
    const message = choice?.message;
    const content = (message?.content ?? message?.reasoning ?? "").trim();

    if (!content) {
      console.warn(
        `[Groq] fallback chat returned empty content. model=${config.groqChatModel}, finish_reason=${choice?.finish_reason ?? "unknown"}`,
      );
    }

    logGroqResponse(`Groq fallback-chat model=${config.groqChatModel}`, content);
    return content || null;
  } catch (error) {
    console.warn("[Groq] fallback chat failed:", getGroqErrorMessage(error));
    return null;
  }
}
