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

function readEnvInt(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readEnvIntAtLeast(name: string, fallback: number, minimum: number): number {
  return Math.max(readEnvInt(name, fallback), minimum);
}

const openaiApiKey = readEnv('OPENAI_API_KEY');
const sparkApiPassword = readEnv('SPARK_API_PASSWORD');

const groqApiKey = readEnv('GROQ_API_KEY');

export const config = {
  databasePath: readEnvWithDefault('DB_PATH', './data.db'),
  dbPatchFile: readEnvWithDefault('DB_PATCH_FILE', './home/database.patch.json'),
  cloudflareExportFile: readEnvWithDefault('CLOUDFLARE_EXPORT_FILE', './cloudflare/data/records.mjs'),
  plUsername: readEnvWithDefault('PL_USERNAME', ''),
  plPassword: readEnvWithDefault('PL_PASSWORD', ''),
  discussionTags: readEnvList('PL_DISCUSSION_TAG', '精选'),
  discussionId: readEnvWithDefault('PL_DISCUSSION_ID', '69a59f0eca7ceb749317ef7c'),
  discussionTypes: readEnvList('PL_DISCUSSION_TYPE', 'Discussion'),
  
  // 新增：同步相关配置
  plBaseUrl: readEnvWithDefault('PL_BASE_URL', 'https://physics-api-cn.turtlesim.com'),
  plAdminUsername: readEnvWithDefault('PL_ADMIN_USERNAME', ''),
  plAdminPassword: readEnvWithDefault('PL_ADMIN_PASSWORD', ''),
  syncCategory: readEnvWithDefault('PL_SYNC_CATEGORY', 'Discussion'),
  syncSourceTag: readEnvWithDefault('PL_SYNC_SOURCE_TAG', '精选'),
  syncTagWhitelist: readEnvList('PL_SYNC_TAG_WHITELIST', '数学,物理学,化学,生物学,地理学,天文学,计算机科学,医学,电气工程,历史学,哲学,文学,艺术学'),
  
  // 数据收集参数
  skip: readEnvInt('SKIP', 0),
  take: readEnvInt('TAKE', -100),
  collectPageSize: readEnvIntAtLeast('COLLECT_PAGE_SIZE', 20, 1),
  collectBatchSize: readEnvIntAtLeast('COLLECT_BATCH_SIZE', 20, 1),
  collectAnalyzeConcurrency: readEnvIntAtLeast('COLLECT_ANALYZE_CONCURRENCY', 20, 1),
  collectInsertConcurrency: readEnvIntAtLeast('COLLECT_INSERT_CONCURRENCY', 20, 1),
  collectPageDelayMs: readEnvIntAtLeast('COLLECT_PAGE_DELAY_MS', 500, 0),
  collectBatchDelayMs: readEnvIntAtLeast('COLLECT_BATCH_DELAY_MS', 1000, 0),
  backfillBatchSize: readEnvIntAtLeast('BACKFILL_BATCH_SIZE', 10, 1),
  
  // AI 服务配置（自动选择 OpenAI 或 Spark）
  // 优先使用 OpenAI，若无则使用 Spark
  apiKey: openaiApiKey ?? sparkApiPassword ?? '',
  model: readEnv('OPENAI_MODEL') ?? readEnv('SPARK_MODEL') ?? 'gpt-3.5-turbo',
  apiBaseUrl: readEnvWithDefault('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  aiRequestTimeoutMs: readEnvInt('AI_REQUEST_TIMEOUT_MS', 45000),
  apiEndpoint: readEnvWithDefault(
    'SPARK_ENDPOINT',
    'https://spark-api-open.xf-yun.com/v1/chat/completions',
  ),
  
  // 提供商判断（自动）
  provider: openaiApiKey ? 'openai' : 'spark',


  // Groq（用于查询词模糊扩展，默认免费模型）
  groqApiKey: groqApiKey ?? '',
  groqModel: readEnvWithDefault('GROQ_MODEL', 'llama-3.1-8b-instant'),
  groqBaseUrl: readEnvWithDefault('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),
  groqChatModel: readEnv('GROQ_CHAT_MODEL') ?? 'openai/gpt-oss-120b',
  groqChatMaxTokens: readEnvInt('GROQ_CHAT_MAX_TOKENS', 120),
  logDirectory: readEnvWithDefault('LOG_DIR', './logs'),
  logSummaryId: readEnvWithDefault('PL_LOG_SUMMARY_ID', ''),
  logSummaryCategory: readEnvWithDefault('PL_LOG_SUMMARY_CATEGORY', 'Discussion'),
  logSummaryUsername: readEnvWithDefault('PL_LOG_SUMMARY_USERNAME', ''),
  logSummaryPassword: readEnvWithDefault('PL_LOG_SUMMARY_PASSWORD', ''),
  logSummaryMaxChars: readEnvInt('PL_LOG_SUMMARY_MAX_CHARS', 18000),

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
