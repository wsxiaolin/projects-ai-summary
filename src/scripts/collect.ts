import { assertEnv, config } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { collectByTagWithOptions } from '../services/collector';

function parseArgs(): { tag: string; type: string; skip: number; model?: string; take: number } {
  const args: string[] = process.argv.slice(2);
  let tag: string | undefined;
  let type: string | undefined;
  let skip: number | undefined;
  let model: string | undefined;
  let take: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tag' && i + 1 < args.length) {
      tag = args[i + 1];
      i++;
    } else if (arg === '--type' && i + 1 < args.length) {
      type = args[i + 1];
      i++;
    } else if (arg === '--skip' && i + 1 < args.length) {
      skip = parseInt(args[i + 1], 10);
      if (isNaN(skip)) {
        console.error('错误: --skip 参数必须是数字');
        process.exit(1);
      }
      i++;
    } else if (arg === '--model' && i + 1 < args.length) {
      model = args[i + 1];
      i++;
    } else if (arg === '--take' && i + 1 < args.length) {
      take = parseInt(args[i + 1], 10);
      if (isNaN(take)) {
        console.error('错误: --take 参数必须是数字');
        process.exit(1);
      }
      i++;
    }
  }

  if (!tag) {
    console.error('错误: 必须指定 --tag 参数');
    console.error('使用方法: npm run flexible-collect -- --tag "标签名" [--type 类型] [--skip 数字] [--model 模型名] [--take 数字]');
    process.exit(1);
  }

  // 使用环境变量配置中的默认值，命令行参数优先
  return {
    tag,
    type: type ?? config.discussionType,
    skip: skip ?? config.skip,
    model,
    take: take ?? config.take
  };
}

async function main() {
  const { tag, type, skip, model, take } = parseArgs();
  
  console.log(`[flexible-collect] 开始收集数据`);
  console.log(`  标签: ${tag}`);
  console.log(`  类型: ${type}`);
  console.log(`  跳过: ${skip}`);
  console.log(`  模型: ${model || config.model} (默认: ${config.model})`);
  console.log(`  获取数量: ${take}`);

  assertEnv();
  await initDatabase();
  await initTable();
  
  const result = await collectByTagWithOptions(tag, type, skip, model, take);
  console.log('[flexible-collect] 完成!', result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});