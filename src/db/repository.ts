import { all, run } from './client';
import { DataRecord } from '../types/data';

export interface SearchFilters {
  keywords?: string[];
  author?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  limit?: number;
}

function toRecordParams(record: DataRecord): Array<string | number> {
  return [
    record.id,
    record.name,
    record.contentLength,
    record.userID,
    record.userName,
    record.editorID,
    record.editorName,
    record.year,
    record.summary,
    record.primaryDiscipline,
    record.secondaryDiscipline,
    record.keyWords,
    record.readability,
    record.taggingModel,
  ];
}

export async function initTable(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS data (
      id TEXT PRIMARY KEY,
      name TEXT,
      contentLength INTEGER,
      userID TEXT,
      userName TEXT,
      editorID TEXT,
      editorName TEXT,
      year INTEGER,
      summary TEXT,
      primaryDiscipline TEXT,
      secondaryDiscipline TEXT,
      keyWords TEXT,
      readability REAL,
      taggingModel TEXT
    );
  `);

  const columns = await all<{ name: string }>('PRAGMA table_info(data)');
  const hasTaggingModel = columns.some((column) => column.name === 'taggingModel');

  if (!hasTaggingModel) {
    await run('ALTER TABLE data ADD COLUMN taggingModel TEXT');
  }

  await run(
    `UPDATE data
     SET taggingModel = ?
     WHERE taggingModel IS NULL OR TRIM(taggingModel) = ''`,
    ['spark 3.5 max'],
  );
}

export async function queryById(id: string): Promise<DataRecord[]> {
  return all<DataRecord>('SELECT * FROM data WHERE id = ?', [id]);
}

export async function queryByIds(ids: string[]): Promise<DataRecord[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  return all<DataRecord>(`SELECT * FROM data WHERE id IN (${placeholders})`, ids);
}

export async function listRecords(limit = 50, offset = 0): Promise<DataRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);

  return all<DataRecord>(
    'SELECT * FROM data ORDER BY year DESC, readability ASC, id ASC LIMIT ? OFFSET ?',
    [safeLimit, safeOffset],
  );
}

export async function insertOne(data: DataRecord): Promise<void> {
  await run(
    `INSERT INTO data (
      id, name, contentLength, userID, userName, editorID, editorName,
      year, summary, primaryDiscipline, secondaryDiscipline, keyWords, readability, taggingModel
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    toRecordParams(data)
  );
}

export async function upsertOne(data: DataRecord): Promise<void> {
  await run(
    `INSERT OR REPLACE INTO data (
      id, name, contentLength, userID, userName, editorID, editorName,
      year, summary, primaryDiscipline, secondaryDiscipline, keyWords, readability, taggingModel
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    toRecordParams(data),
  );
}

export async function searchRecords(filters: SearchFilters): Promise<DataRecord[]> {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.keywords && filters.keywords.length > 0) {
    conditions.push(
      '(' +
        filters.keywords
          .map(
            () =>
              '(name LIKE ? OR keyWords LIKE ? OR primaryDiscipline LIKE ? OR secondaryDiscipline LIKE ? OR userName LIKE ? OR summary LIKE ?)'
          )
          .join(' OR ') +
        ')'
    );

    for (const key of filters.keywords) {
      const wildcard = `%${key}%`;
      params.push(wildcard, wildcard, wildcard, wildcard, wildcard, wildcard);
    }
  }

  if (filters.author) {
    conditions.push('(userName LIKE ? OR editorName LIKE ?)');
    const wildcard = `%${filters.author}%`;
    params.push(wildcard, wildcard);
  }

  if (typeof filters.year === 'number') {
    conditions.push('year = ?');
    params.push(filters.year);
  }

  if (typeof filters.yearFrom === 'number') {
    conditions.push('year >= ?');
    params.push(filters.yearFrom);
  }

  if (typeof filters.yearTo === 'number') {
    conditions.push('year <= ?');
    params.push(filters.yearTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 20);

  params.push(limit);

  // 如果有关键词，需要计算匹配优先级（summary 优先级最低）
  // 使用 CASE 语句计算匹配分数：name > keyWords > discipline > userName > summary
  const selectClause = filters.keywords && filters.keywords.length > 0
    ? `*, CASE 
        WHEN name LIKE ? THEN 1
        WHEN keyWords LIKE ? THEN 2
        WHEN primaryDiscipline LIKE ? OR secondaryDiscipline LIKE ? THEN 3
        WHEN userName LIKE ? THEN 4
        WHEN summary LIKE ? THEN 5
        ELSE 6
      END AS matchPriority`
    : '*';

  let query = `SELECT ${selectClause} FROM data ${whereClause}`;

  if (filters.keywords && filters.keywords.length > 0) {
    const firstKeyword = `%${filters.keywords[0]}%`;
    params.pop(); // 移除 limit
    params.push(firstKeyword, firstKeyword, firstKeyword, firstKeyword, firstKeyword, firstKeyword);
    query += ` ORDER BY matchPriority ASC, year DESC, readability ASC LIMIT ?`;
    params.push(limit);
  } else {
    query += ` ORDER BY year DESC, readability ASC LIMIT ?`;
  }

  return all<DataRecord>(query, params);
}
