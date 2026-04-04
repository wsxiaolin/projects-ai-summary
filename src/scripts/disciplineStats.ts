import { initDatabase } from '../db/client';
import { initTable, searchRecords } from '../db/repository';
import { DataRecord } from '../types/data';
import { all } from '../db/client';

interface DisciplineStats {
  primary: Map<string, number>;
  secondary: Map<string, number>;
  keywords: Map<string, number>;
}

function parseJsonArrayField(field: string): string[] {
  if (!field || field.trim() === '') {
    return [];
  }
  
  try {
    // 尝试解析JSON数组
    const parsed = JSON.parse(field);
    if (Array.isArray(parsed)) {
      return parsed.map(item => String(item).trim()).filter(item => item.length > 0);
    }
    return [String(parsed).trim()].filter(item => item.length > 0);
  } catch (error) {
    // 如果不是JSON格式，按原始方式处理
    return field
      .split(/[,\uff0c;]/) 
      .map(kw => kw.trim())
      .filter(kw => kw.length > 0);
  }
}

async function getAllRecords(): Promise<DataRecord[]> {
  return all<DataRecord>('SELECT * FROM data');
}

async function getDisciplineStats(): Promise<DisciplineStats> {
  await initDatabase();
  await initTable();
  const allRecords = await getAllRecords();

  console.log(`共找到 ${allRecords.length} 条记录`);

  const stats: DisciplineStats = {
    primary: new Map<string, number>(),
    secondary: new Map<string, number>(),
    keywords: new Map<string, number>()
  };

  // 统计一级学科和二级学科
  for (const record of allRecords) {
    // 统计一级学科
    const primaryDisciplines = parseJsonArrayField(record.primaryDiscipline);
    for (const discipline of primaryDisciplines) {
      const count = stats.primary.get(discipline) || 0;
      stats.primary.set(discipline, count + 1);
    }

    // 统计二级学科
    const secondaryDisciplines = parseJsonArrayField(record.secondaryDiscipline);
    for (const discipline of secondaryDisciplines) {
      const count = stats.secondary.get(discipline) || 0;
      stats.secondary.set(discipline, count + 1);
    }

    // 统计关键词/标签
    const keywords = parseJsonArrayField(record.keyWords);
    for (const keyword of keywords) {
      const count = stats.keywords.get(keyword) || 0;
      stats.keywords.set(keyword, count + 1);
    }
  }

  return stats;
}

function sortMapByValue(map: Map<string, number>): [string, number][] {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

async function main() {
  try {
    console.log('正在统计学科和标签数据...');
    const stats = await getDisciplineStats();

    console.log('\n=== 一级学科统计 ===');
    const sortedPrimary = sortMapByValue(stats.primary);
    sortedPrimary.forEach(([discipline, count]) => {
      console.log(`${discipline}: ${count}`);
    });

    console.log('\n=== 二级学科统计 ===');
    const sortedSecondary = sortMapByValue(stats.secondary);
    sortedSecondary.forEach(([discipline, count]) => {
      console.log(`${discipline}: ${count}`);
    });

    console.log('\n=== 常见标签统计 (前50个) ===');
    const sortedKeywords = sortMapByValue(stats.keywords);
    const topKeywords = sortedKeywords.slice(0, 50);
    topKeywords.forEach(([keyword, count]) => {
      console.log(`${keyword}: ${count}`);
    });

    console.log(`\n总计: ${stats.primary.size} 个一级学科, ${stats.secondary.size} 个二级学科, ${stats.keywords.size} 个不同标签`);
    console.log(`数据库中共有 ${sortedPrimary.reduce((sum, [, count]) => sum + count, 0)} 条作品记录`);
  } catch (error) {
    console.error('统计过程中出现错误:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}