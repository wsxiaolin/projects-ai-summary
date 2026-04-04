import dotenv from 'dotenv';

dotenv.config();

export const config = {
  databasePath: process.env.DB_PATH ?? './data.db',
  plUsername: process.env.PL_USERNAME ?? process.env.USERNAME ?? '',
  plPassword: process.env.PL_PASSWORD ?? process.env.PASSWORD ?? '',
  discussionTags: (process.env.PL_DISCUSSION_TAG ?? '精选').split(',').map(t => t.trim()),
  discussionId: process.env.PL_DISCUSSION_ID ?? '69a59f0eca7ceb749317ef7c',
  discussionTypes: (process.env.PL_DISCUSSION_TYPE ?? 'Discussion').split(',').map(t => t.trim()),
  
  // 数据收集参数
  skip: parseInt(process.env.SKIP ?? '0', 10),
  take: parseInt(process.env.TAKE ?? '-100', 10),
  
  // AI 服务配置（自动选择 OpenAI 或 Spark）
  // 优先使用 OpenAI，若无则使用 Spark
  apiKey: process.env.OPENAI_API_KEY ?? process.env.SPARK_API_PASSWORD ?? '',
  model: process.env.OPENAI_MODEL ?? process.env.SPARK_MODEL ?? 'gpt-3.5-turbo',
  apiBaseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  apiEndpoint:
    process.env.SPARK_ENDPOINT ?? 'https://spark-api-open.xf-yun.com/v1/chat/completions',
  
  // 提供商判断（自动）
  provider: process.env.OPENAI_API_KEY ? 'openai' : 'spark',

  // 向后兼容（保留旧参数访问）
  get discussionTag() { return this.discussionTags[0]; },
  get discussionType() { return this.discussionTypes[0]; },
  get openaiApiKey() { return process.env.OPENAI_API_KEY ?? ''; },
  get openaiModel() { return process.env.OPENAI_MODEL ?? 'gpt-3.5-turbo'; },
  get openaiBaseUrl() { return process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'; },
  get sparkApiPassword() { return process.env.SPARK_API_PASSWORD ?? ''; },
  get sparkModel() { return process.env.SPARK_MODEL ?? 'generalv3.5'; },
  get sparkEndpoint() { return process.env.SPARK_ENDPOINT ?? 'https://spark-api-open.xf-yun.com/v1/chat/completions'; }
};


export function assertEnv(): void {
  const missing: string[] = [];
  if (!config.plUsername) missing.push('PL_USERNAME');
  if (!config.plPassword) missing.push('PL_PASSWORD');

  // 检查至少有一个AI服务的API key
  if (!config.apiKey) {
    missing.push('OPENAI_API_KEY or SPARK_API_PASSWORD');
  }

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}