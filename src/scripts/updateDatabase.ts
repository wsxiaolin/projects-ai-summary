import { assertEnv, config } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { collectByTagWithOptions } from '../services/collector';

async function main() {
  assertEnv();
  await initDatabase();
  await initTable();
  
  let totalInserted = 0;
  let totalSkipped = 0;
  
  // 双层遍历：讨论类型 × 讨论标签
  for (const discussionType of config.discussionTypes) {
    for (const tag of config.discussionTags) {
      console.log(`\n[update-db] 收集: 类型=${discussionType}, 标签=${tag}`);
      const result = await collectByTagWithOptions(tag, discussionType, config.skip, undefined, config.take);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      console.log(`[update-db]   结果: 插入=${result.inserted}, 跳过=${result.skipped}`);
    }
  }
  
  console.log(`\n[update-db] 总结: 插入=${totalInserted}, 跳过=${totalSkipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
