import { createUser } from '../pl/client';
import { analyzeContent } from './spark';
import { insertOne, queryById } from '../db/repository';
import { DataRecord } from '../types/data';

// 并发控制器：限制最多并发 N 个操作
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrencyLimit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<T>[] = [];

  for (const [index, task] of tasks.entries()) {
    const promise = task().then((result) => {
      results[index] = result;
      return result;
    });

    executing.push(promise);

    if (executing.length >= concurrencyLimit) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex((p) => p === promise),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}

function toRecord(project: any, summary: any, llm: any): DataRecord {
  return {
    id: project.ID,
    name: project.Subject,
    contentLength: summary.Data.Description.join('').length,
    userID: summary.Data.User?.ID ?? '',
    userName: summary.Data.User?.Nickname ?? '',
    editorID: summary.Data.Editor?.ID ?? '',
    editorName: summary.Data.Editor?.Nickname ?? '',
    year: new Date(summary.Data.CreationDate).getFullYear(),
    summary: llm.summary,
    primaryDiscipline: JSON.stringify(llm.Subject1),
    secondaryDiscipline: JSON.stringify(llm.Subject2),
    keyWords: JSON.stringify(llm.keywords),
    readability: llm.readability
  };
}

export async function collectByTag(tag: string): Promise<{ inserted: number; skipped: number }> {
  const user = await createUser();
  const list = await user.projects.query('Experiment', { tags: [tag], take: -100, skip: 100});
  let inserted = 0;
  let skipped = 0;
  
  const items = list.Data.$values ?? [];
  const batchSize = 10;

  // 分批处理：每批10个作品
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    console.log(`[collectByTag] 开始处理第 ${batchNum} 批 (共${Math.ceil(items.length / batchSize)}批)`);
    
    // 当前批的待分析数据
    const sourcesToAnalyze: Array<{ item: any; summary: any; text: string }> = [];
    let batchSkipped = 0;

    for (const item of batch) {
      // 检查ID是否已经被检查过处理过，如果已处理则跳过API请求
      const exist = await queryById(item.ID);
      if (exist.length > 0) {
        console.log(`[collectByTag] ID已检查过，跳过: ${item.ID}`);
        batchSkipped += 1;
        continue;
      }

      const summary = await user.projects.getSummary(item.ID, 'Experiment');
      const text = summary.Data.Description.join('');
      if (!text.trim()) {
        console.log(`[collectByTag] 内容为空，跳过: ${item.ID}`);
        batchSkipped += 1;
        continue;
      }

      sourcesToAnalyze.push({ item, summary, text });
    }

    // 并发调用API分析（当前批）
    if (sourcesToAnalyze.length > 0) {
      console.log(`[collectByTag] 第 ${batchNum} 批: 开始并发分析 ${sourcesToAnalyze.length} 条记录...`);
      const analyzeTasks = sourcesToAnalyze.map(({ item, summary, text }) => async () => {
        console.log(`[collectByTag] 分析ID: ${item.ID}`);
        try {
          const llm = await analyzeContent(text);
          return { item, summary, llm, error: null };
        } catch (error) {
          console.error(`[collectByTag] API分析失败，跳过ID: ${item.ID}`, error instanceof Error ? error.message : String(error));
          return { item, summary, llm: null, error };
        }
      });

      const analyzeResults = await runWithConcurrency(analyzeTasks, 10);

      // 累积插入任务（当前批）
      const insertTasks: (() => Promise<void>)[] = [];
      for (const result of analyzeResults) {
        if (result.error || !result.llm) {
          batchSkipped += 1;
          continue;
        }
        
        const record = toRecord(result.item, result.summary, result.llm);
        insertTasks.push(async () => {
          await insertOne(record);
          console.log('[DB] 成功写入:', record.id);
        });
      }

      // 并发执行数据库插入（当前批）
      if (insertTasks.length > 0) {
        console.log(`[collectByTag] 第 ${batchNum} 批: 开始并发插入 ${insertTasks.length} 条记录...`);
        const insertResults = await runWithConcurrency(insertTasks, 10);
        inserted += insertResults.length;
      }
    }

    skipped += batchSkipped;
    
    // 批次间延迟，避免频繁请求
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`[collectByTag] 完成! 插入: ${inserted}, 跳过: ${skipped}`);
  return { inserted, skipped };
}

export async function backfillByDiscussionIds(ids: string[]): Promise<{ inserted: number; skipped: number }> {
  const user = await createUser();
  let inserted = 0;
  let skipped = 0;
  
  const batchSize = 10;

  // 分批处理：每批10个ID
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    console.log(`[backfillByDiscussionIds] 开始处理第 ${batchNum} 批 (共${Math.ceil(ids.length / batchSize)}批)`);
    
    // 当前批的待分析数据
    const sourcesToAnalyze: Array<{ id: string; summary: any; text: string }> = [];
    let batchSkipped = 0;

    for (const id of batch) {
      // 检查ID是否已经被检查过，如果已处理则跳过，不再发请求到API
      const exist = await queryById(id);
      if (exist.length > 0) {
        console.log(`[backfillByDiscussionIds] ID已检查过，跳过API请求: ${id}`);
        batchSkipped += 1;
        continue;
      }

      console.log(`[backfillByDiscussionIds] 开始处理ID: ${id}`);
      const summary = await user.projects.getSummary(id, 'Discussion');
      const text = summary.Data.Description.join('');
      if (!text.trim()) {
        console.log(`[backfillByDiscussionIds] 内容为空，跳过: ${id}`);
        batchSkipped += 1;
        continue;
      }

      sourcesToAnalyze.push({ id, summary, text });
    }

    // 并发调用API分析（当前批）
    if (sourcesToAnalyze.length > 0) {
      console.log(`[backfillByDiscussionIds] 第 ${batchNum} 批: 开始并发分析 ${sourcesToAnalyze.length} 条记录...`);
      const analyzeTasks = sourcesToAnalyze.map(({ id, summary, text }) => async () => {
        console.log(`[backfillByDiscussionIds] 分析ID: ${id}`);
        try {
          const llm = await analyzeContent(text);
          return { id, summary, llm, error: null };
        } catch (error) {
          console.error(`[backfillByDiscussionIds] API分析失败，跳过ID: ${id}`, error instanceof Error ? error.message : String(error));
          return { id, summary, llm: null, error };
        }
      });

      const analyzeResults = await runWithConcurrency(analyzeTasks, 10);

      // 累积插入任务（当前批）
      const insertTasks: (() => Promise<void>)[] = [];
      for (const result of analyzeResults) {
        if (result.error || !result.llm) {
          batchSkipped += 1;
          continue;
        }

        const record = {
          id: result.id,
          name: result.summary.Data.Subject ?? result.id,
          contentLength: sourcesToAnalyze.find((s) => s.id === result.id)?.text.length ?? 0,
          userID: result.summary.Data.User?.ID ?? '',
          userName: result.summary.Data.User?.Nickname ?? '',
          editorID: result.summary.Data.Editor?.ID ?? '',
          editorName: result.summary.Data.Editor?.Nickname ?? '',
          year: new Date(result.summary.Data.CreationDate).getFullYear(),
          summary: result.llm.summary,
          primaryDiscipline: JSON.stringify(result.llm.Subject1),
          secondaryDiscipline: JSON.stringify(result.llm.Subject2),
          keyWords: JSON.stringify(result.llm.keywords),
          readability: result.llm.readability
        };

        insertTasks.push(async () => {
          await insertOne(record);
          console.log('[DB] 成功写入记录:', record.id);
        });
      }

      // 并发执行数据库插入（当前批）
      if (insertTasks.length > 0) {
        console.log(`[backfillByDiscussionIds] 第 ${batchNum} 批: 开始并发插入 ${insertTasks.length} 条记录...`);
        const insertResults = await runWithConcurrency(insertTasks, 10);
        inserted += insertResults.length;
      }
    }

    skipped += batchSkipped;
    
    // 批次间延迟，避免频繁请求
    if (i + batchSize < ids.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`[backfillByDiscussionIds] 完成! 插入: ${inserted}, 跳过: ${skipped}`);
  return { inserted, skipped };
}
