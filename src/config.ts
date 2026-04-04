import dotenv from 'dotenv';

dotenv.config();

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readEnvWithDefault(name: string, defaultValue: string): string {
  return readEnv(name) ?? defaultValue;
}

function readEnvList(name: string, fallback: string): string[] {
  return readEnvWithDefault(name, fallback)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

const openaiApiKey = readEnv('OPENAI_API_KEY');
const sparkApiPassword = readEnv('SPARK_API_PASSWORD');

export const config = {
  databasePath: readEnvWithDefault('DB_PATH', './data.db'),
  plUsername: readEnvWithDefault('PL_USERNAME', ''),
  plPassword: readEnvWithDefault('PL_PASSWORD', ''),
  discussionTags: readEnvList('PL_DISCUSSION_TAG', '精选'),
  discussionId: readEnvWithDefault('PL_DISCUSSION_ID', '69a59f0eca7ceb749317ef7c'),
  discussionTypes: readEnvList('PL_DISCUSSION_TYPE', 'Discussion'),
  
  // 数据收集参数
  skip: parseInt(readEnvWithDefault('SKIP', '0'), 10),
  take: parseInt(readEnvWithDefault('TAKE', '-100'), 10),
  
  // AI 服务配置（自动选择 OpenAI 或 Spark）
  // 优先使用 OpenAI，若无则使用 Spark
  apiKey: openaiApiKey ?? sparkApiPassword ?? '',
  model: readEnv('OPENAI_MODEL') ?? readEnv('SPARK_MODEL') ?? 'gpt-3.5-turbo',
  apiBaseUrl: readEnvWithDefault('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  apiEndpoint: readEnvWithDefault(
    'SPARK_ENDPOINT',
    'https://spark-api-open.xf-yun.com/v1/chat/completions',
  ),
  
  // 提供商判断（自动）
  provider: openaiApiKey ? 'openai' : 'spark',

  // 向后兼容（保留旧参数访问）
  get discussionTag() { return this.discussionTags[0]; },
  get discussionType() { return this.discussionTypes[0]; },
  get openaiApiKey() { return openaiApiKey ?? ''; },
  get openaiModel() { return readEnvWithDefault('OPENAI_MODEL', 'gpt-3.5-turbo'); },
  get openaiBaseUrl() { return readEnvWithDefault('OPENAI_BASE_URL', 'https://api.openai.com/v1'); },
  get sparkApiPassword() { return sparkApiPassword ?? ''; },
  get sparkModel() { return readEnvWithDefault('SPARK_MODEL', 'generalv3.5'); },
  get sparkEndpoint() {
    return readEnvWithDefault('SPARK_ENDPOINT', 'https://spark-api-open.xf-yun.com/v1/chat/completions');
  }
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
