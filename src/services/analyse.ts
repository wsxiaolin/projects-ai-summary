import axios from 'axios';
import { OpenAI } from 'openai';
import { config } from '../config';
import { LLMResult } from '../types/data';

const systemPrompt =
  `你是结构化学术分类助手。正在执行结构化信息提取任务。必须且只能输出无格式纯文本的JSON对象，确保JSON.parse可直接解析。
  <forbid>绝对禁止任何非JSON内容，包括：1)自然语言说明 2)代码块标记 3)特殊符号。</forbid>
  格式死亡红线：①缺失字段立即报错 ②数值未加引号视为格式错误 ③数组元素必须双引号包裹。示范正确格式：
  {"summary":"...","Subject1":["工学"],"Subject2":["机械设计及理论"],"keywords":["流体力学"],"readability":0.72}`;

const useOpenAI = Boolean(config.openaiApiKey);
const aiClient = useOpenAI
  ? new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiBaseUrl,
      dangerouslyAllowBrowser: true
    })
  : null;

/**
 * 使用统一AI服务分析内容（用于学科分类）
 * @param text - 要分析的文本内容
 * @param model - AI模型名称，如果未提供则使用配置中的默认模型
 * @returns 分析结果
 */
export async function analyzeContentWithModel(text: string, model?: string): Promise<LLMResult> {
  // 参数验证：检查text不能为空
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('[OpenAI] 参数验证失败：text 参数不能为空');
  }

  const actualModel = model || config.model;
  
  try {
    console.log(`[AI] 发送请求 - 模型: ${actualModel}, 文本长度: ${text.length}`);
    
    const response = await openaiChatCompletion({
      model: actualModel,
      temperature: 0.2,
      tools: [
        {
          type: 'function',
          function: {
            name: 'json_output',
            description: '返回结构化的JSON格式数据',
            parameters: {
              type: 'object',
              properties: {
                summary: {
                  type: 'string',
                  description: '作品摘要'
                },
                Subject1: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '学科门类，从以下学科选择:哲学，经济学，法学，教育学，文学，历史学，理学，工学，农学，医学，军事学，管理学，艺术学'
                },
                Subject2: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '一级学科分类'
                },
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '关键词列表，10-20个'
                },
                readability: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  description: '可读性评分，0.00到1.00之间的小数，[科普=0.3, 学报=0.6, 顶会=0.9]'
                }
              },
              required: ['summary', 'Subject1', 'Subject2', 'keywords', 'readability']
            }
          }
        }
      ],
      tool_choice: 'auto',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: '请分析下列作品并使用json_output工具返回结构化数据:' + text
        }
      ]
    });

    console.log('[AI] 响应成功');
    
    // 优先从工具调用获取JSON数据，否则从content获取
    let parsed = null;
    const toolCalls = response.choices?.[0]?.message?.tool_calls;
    
    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      const functionArgs = (toolCall as any).function?.arguments;
      const toolArgs = typeof functionArgs === 'string' 
        ? JSON.parse(functionArgs)
        : functionArgs;
      parsed = toolArgs;
      console.log('[AI] 从工具调用获取数据');
    } else {
      const raw = response.choices?.[0]?.message?.content ?? '';
      const cleaned = String(raw)
        .trim()
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '')
        .trim();

      parsed = JSON.parse(cleaned);
      console.log('[AI] 从content内容获取数据');
    }

    // 验证必需字段不为空
    if (!parsed.summary || typeof parsed.summary !== 'string' || parsed.summary.trim().length === 0) {
      throw new Error('[OpenAI] 参数验证失败：summary 不能为空');
    }
    if (!Array.isArray(parsed.Subject1) || parsed.Subject1.length === 0) {
      throw new Error('[OpenAI] 参数验证失败：Subject1 不能为空');
    }
    if (!Array.isArray(parsed.Subject2) || parsed.Subject2.length === 0) {
      throw new Error('[OpenAI] 参数验证失败：Subject2 不能为空');
    }
    if (!Array.isArray(parsed.keywords) || parsed.keywords.length === 0) {
      throw new Error('[OpenAI] 参数验证失败：keywords 不能为空');
    }
    if (typeof parsed.readability !== 'number' || parsed.readability < 0 || parsed.readability > 1) {
      throw new Error('[OpenAI] 参数验证失败：readability 必须是0-1之间的数字');
    }

    return {
      summary: parsed.summary,
      Subject1: parsed.Subject1,
      Subject2: parsed.Subject2,
      keywords: parsed.keywords,
      readability: Number(parsed.readability)
    };
  } catch (error: any) {
    console.error('[OpenAI] 错误 - 状态码:', error.status);
    console.error('[OpenAI] 错误信息:', error.message);
    console.error('[OpenAI] 错误详情:', error.response?.data);
    throw error;
  }
}


export async function analyzeContent(text: string): Promise<LLMResult> {
  return analyzeContentWithModel(text);
}


export interface OpenAIChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    tool_call_id?: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI格式的聊天完成函数
 * @param request - OpenAI格式的请求对象
 * @returns OpenAI格式的响应对象
 */
export async function openaiChatCompletion(
  request: OpenAIChatCompletionRequest
): Promise<OpenAIChatCompletionResponse> {
  // 参数验证
  if (!request.model || !request.messages?.length) {
    throw new Error('Invalid request: model and messages are required');
  }

  try {
    const provider = useOpenAI ? 'OpenAI' : 'Spark';
    console.log(`[AI] 使用 ${provider} 发送请求 - 模型: ${request.model}, 消息数: ${request.messages.length}`);

    if (useOpenAI && aiClient) {
      const response = await aiClient.chat.completions.create(request as any);
      console.log('[AI] OpenAI 响应成功');
      return response as unknown as OpenAIChatCompletionResponse;
    }

    const sparkRequest = {
      model: request.model,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens,
      tools: request.tools,
      tool_choice: request.tool_choice,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };

    const response = await axios.post(
      config.apiEndpoint,
      sparkRequest,
      {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('[AI] Spark 响应成功');

    const sparkResponse = response.data;
    const messageId = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let toolCalls = undefined;
    let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop';
    
    const sparkToolCalls = sparkResponse?.choices?.[0]?.message?.tool_calls;
    if (sparkToolCalls && sparkToolCalls.length > 0) {
      toolCalls = sparkToolCalls.map((tc: any, index: number) => ({
        id: `call_${Date.now()}_${index}`,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: typeof tc.function.arguments === 'string' 
            ? tc.function.arguments 
            : JSON.stringify(tc.function.arguments)
        }
      }));
      finishReason = 'tool_calls';
    }

    const openaiResponse: OpenAIChatCompletionResponse = {
      id: messageId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: sparkResponse?.choices?.[0]?.message?.content ?? null,
          tool_calls: toolCalls
        },
        finish_reason: finishReason
      }],
      usage: {
        prompt_tokens: sparkResponse?.usage?.prompt_tokens ?? 0,
        completion_tokens: sparkResponse?.usage?.completion_tokens ?? 0,
        total_tokens: sparkResponse?.usage?.total_tokens ?? 0
      }
    };

    return openaiResponse;
  } catch (error: any) {
    console.error('[AI] 错误 - 状态码:', error.response?.status ?? error.status);
    console.error('[AI] 错误信息:', error.response?.statusText ?? error.message);
    console.error('[AI] 响应数据:', JSON.stringify(error.response?.data ?? error, null, 2));
    throw error;
  }
}

/**
 * OpenAI兼容服务层
 * 提供标准的OpenAI API接口，底层使用统一AI服务
 */

/**
 * 创建聊天完成（兼容OpenAI格式）
 * @param request - OpenAI格式的请求
 * @returns OpenAI格式的响应
 */
export async function createChatCompletion(
  request: OpenAIChatCompletionRequest
): Promise<OpenAIChatCompletionResponse> {
  return openaiChatCompletion(request);
}

/**
 * 简化的聊天函数（类似OpenAI的chat.completions.create）
 * @param model - 模型名称
 * @param messages - 消息数组
 * @param options - 其他选项
 * @returns 响应内容
 */
export async function chat(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    max_tokens?: number;
    tools?: any[];
    tool_choice?: any;
  } = {}
): Promise<string> {
  const request: OpenAIChatCompletionRequest = {
    model,
    messages: messages as any,
    temperature: options.temperature,
    max_tokens: options.max_tokens,
    tools: options.tools,
    tool_choice: options.tool_choice
  };

  const response = await openaiChatCompletion(request);
  return response.choices[0].message.content || '';
}

/**
 * 使用工具调用的聊天函数
 * @param model - 模型名称
 * @param messages - 消息数组
 * @param tools - 工具定义
 * @param options - 其他选项
 * @returns 工具调用结果或普通响应
 */
export async function chatWithTools(
  model: string,
  messages: Array<{ role: string; content: string }>,
  tools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>,
  options: {
    temperature?: number;
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  } = {}
): Promise<{ content: string | null; tool_calls?: any[] }> {
  const request: OpenAIChatCompletionRequest = {
    model,
    messages: messages as any,
    temperature: options.temperature ?? 0.7,
    tools,
    tool_choice: options.tool_choice ?? 'auto'
  };

  const response = await openaiChatCompletion(request);
  const choice = response.choices[0];
  
  return {
    content: choice.message.content,
    tool_calls: choice.message.tool_calls
  };
}
