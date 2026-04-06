import fs from 'fs';
import path from 'path';

import { config } from '../config';
import { queryById, upsertOne } from '../db/repository';
import { DataRecord } from '../types/data';

export interface AdminRecord {
  id: string;
  name: string;
  contentLength: number;
  userID: string;
  userName: string;
  editorID: string;
  editorName: string;
  year: number;
  summary: string;
  primaryDiscipline: string[];
  secondaryDiscipline: string[];
  keyWords: string[];
  readability: number;
  taggingModel: string;
}

export interface DatabasePatchOperation {
  operation: 'upsert';
  id: string;
  updatedAt: string;
  record: DataRecord;
  diff: Partial<DataRecord>;
}

export interface DatabasePatchFile {
  version: 1;
  generatedAt: string;
  operations: DatabasePatchOperation[];
}

const RECORD_FIELDS: Array<keyof DataRecord> = [
  'id',
  'name',
  'contentLength',
  'userID',
  'userName',
  'editorID',
  'editorName',
  'year',
  'summary',
  'primaryDiscipline',
  'secondaryDiscipline',
  'keyWords',
  'readability',
  'taggingModel',
];

function parseArrayField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    return trimmed
      .split(/[,\n|，；;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function stringifyArrayField(value: unknown): string {
  return JSON.stringify(parseArrayField(value));
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function serializeRecordForAdmin(record: DataRecord): AdminRecord {
  return {
    id: record.id,
    name: record.name,
    contentLength: record.contentLength,
    userID: record.userID,
    userName: record.userName,
    editorID: record.editorID,
    editorName: record.editorName,
    year: record.year,
    summary: record.summary,
    primaryDiscipline: parseArrayField(record.primaryDiscipline),
    secondaryDiscipline: parseArrayField(record.secondaryDiscipline),
    keyWords: parseArrayField(record.keyWords),
    readability: record.readability,
    taggingModel: record.taggingModel,
  };
}

export function coerceAdminRecord(input: Record<string, unknown>): DataRecord {
  return {
    id: String(input.id ?? '').trim(),
    name: String(input.name ?? '').trim(),
    contentLength: toNumber(input.contentLength, 0),
    userID: String(input.userID ?? '').trim(),
    userName: String(input.userName ?? '').trim(),
    editorID: String(input.editorID ?? '').trim(),
    editorName: String(input.editorName ?? '').trim(),
    year: toNumber(input.year, 0),
    summary: String(input.summary ?? '').trim(),
    primaryDiscipline: stringifyArrayField(input.primaryDiscipline),
    secondaryDiscipline: stringifyArrayField(input.secondaryDiscipline),
    keyWords: stringifyArrayField(input.keyWords),
    readability: toNumber(input.readability, 0),
    taggingModel: String(input.taggingModel ?? '').trim(),
  };
}

function diffRecord(
  current: DataRecord | null,
  next: DataRecord,
): Partial<DataRecord> {
  if (!current) {
    return { ...next };
  }

  const diff: Partial<DataRecord> = {};
  for (const field of RECORD_FIELDS) {
    if (current[field] !== next[field]) {
      (diff as Record<string, string | number>)[field] = next[field];
    }
  }

  return diff;
}

export async function buildPatchOperation(
  next: DataRecord,
): Promise<DatabasePatchOperation> {
  const current = (await queryById(next.id))[0] ?? null;

  return {
    operation: 'upsert',
    id: next.id,
    updatedAt: new Date().toISOString(),
    record: next,
    diff: diffRecord(current, next),
  };
}

export function formatPatchFile(patchFile: DatabasePatchFile): string {
  return `${JSON.stringify(patchFile, null, 2)}\n`;
}

export function getPatchFilePath(): string {
  return path.resolve(config.dbPatchFile);
}

export function loadPatchFile(filePath = getPatchFilePath()): DatabasePatchFile {
  if (!fs.existsSync(filePath)) {
    return {
      version: 1,
      generatedAt: new Date(0).toISOString(),
      operations: [],
    };
  }

  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) {
    return {
      version: 1,
      generatedAt: new Date(0).toISOString(),
      operations: [],
    };
  }

  const parsed = JSON.parse(raw) as DatabasePatchFile;
  return {
    version: 1,
    generatedAt: parsed.generatedAt ?? new Date(0).toISOString(),
    operations: Array.isArray(parsed.operations) ? parsed.operations : [],
  };
}

export function mergePatchOperation(
  patchFile: DatabasePatchFile,
  operation: DatabasePatchOperation,
): DatabasePatchFile {
  const operations = patchFile.operations.filter((item) => item.id !== operation.id);
  operations.push(operation);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    operations,
  };
}

export function savePatchFile(
  patchFile: DatabasePatchFile,
  filePath = getPatchFilePath(),
): string {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, formatPatchFile(patchFile), 'utf8');
  return resolved;
}

export async function appendOperationToPatchFile(
  operation: DatabasePatchOperation,
  filePath = getPatchFilePath(),
): Promise<DatabasePatchFile> {
  const current = loadPatchFile(filePath);
  const next = mergePatchOperation(current, operation);
  savePatchFile(next, filePath);
  return next;
}

export async function applyPatchFile(
  patchFile: DatabasePatchFile,
): Promise<number> {
  let applied = 0;

  for (const operation of patchFile.operations) {
    if (operation.operation !== 'upsert') continue;
    await upsertOne(operation.record);
    applied += 1;
  }

  return applied;
}
