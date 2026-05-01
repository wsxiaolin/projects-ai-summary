import fs from 'fs';
import path from 'path';
import util from 'util';

import { config } from '../config';
import { createUserWithCredentials } from '../pl/client';

type RunStatus = 'success' | 'failure' | 'interrupted';
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'AI';

type ConsoleMethod = (...args: unknown[]) => void;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatTimestamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatMonthFile(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}.txt`;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((value) =>
      typeof value === 'string'
        ? value
        : util.inspect(value, {
            depth: 6,
            breakLength: 120,
            maxArrayLength: 50,
            maxStringLength: 10000,
          }),
    )
    .join(' ');
}

function truncateTail(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `...\n${value.slice(-(maxChars - 4))}`;
}

async function updateRemoteLogSummary(content: string): Promise<void> {
  if (
    !config.logSummaryId ||
    !config.logSummaryUsername ||
    !config.logSummaryPassword
  ) {
    return;
  }

  try {
    const user = await createUserWithCredentials(
      config.logSummaryUsername,
      config.logSummaryPassword,
    );
    
    // 使用Promise.race创建带超时的API调用
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Update remote log summary timeout')), 30000); // 30秒超时
    });
    
    const updatePromise = (async () => {
      const summary = await user.projects.getSummary(
        config.logSummaryId,
        config.logSummaryCategory,
      );
      const experiment = await user.experiment.get(
        config.logSummaryId,
        config.logSummaryCategory,
      );

      const summaryData = summary?.Data ?? {};
      const workspace = experiment?.Data ?? experiment;

      await user.experiment.update(
        {
          ...summaryData,
          Description: [content],
        },
        workspace,
      );
    })();
    
    // 竞争执行，哪个先完成就返回哪个的结果
    await Promise.race([updatePromise, timeoutPromise]);
  } catch (error) {
    console.error(`[Logger] Failed to update summary: ${error instanceof Error ? error.message : String(error)}`);
    // 不抛出错误，只是记录错误，这样不会导致程序挂起
  }
}

export class RunLogger {
  readonly runId: string;
  readonly runName: string;
  readonly startedAt: Date;

  private readonly logFilePath: string;
  private readonly lines: string[] = [];
  private readonly originalConsole: {
    log: ConsoleMethod;
    warn: ConsoleMethod;
    error: ConsoleMethod;
    info: ConsoleMethod;
  };

  private attached = false;
  private finalized = false;

  constructor(runName: string) {
    this.runName = runName;
    this.startedAt = new Date();
    this.runId = `${this.startedAt
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '')}`;

    fs.mkdirSync(config.logDirectory, { recursive: true });
    this.logFilePath = path.join(config.logDirectory, formatMonthFile(this.startedAt));

    this.originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
    };
  }

  attachGlobalConsole(): void {
    if (this.attached) return;
    this.attached = true;

    console.log = (...args: unknown[]) => {
      this.write('INFO', formatArgs(args));
      this.originalConsole.log(...args);
    };

    console.warn = (...args: unknown[]) => {
      this.write('WARN', formatArgs(args));
      this.originalConsole.warn(...args);
    };

    console.error = (...args: unknown[]) => {
      this.write('ERROR', formatArgs(args));
      this.originalConsole.error(...args);
    };

    console.info = (...args: unknown[]) => {
      this.write('INFO', formatArgs(args));
      this.originalConsole.info(...args);
    };
  }

  detachGlobalConsole(): void {
    if (!this.attached) return;
    this.attached = false;

    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.info = this.originalConsole.info;
  }

  info(message: string): void {
    this.write('INFO', message);
  }

  warn(message: string): void {
    this.write('WARN', message);
  }

  error(message: string): void {
    this.write('ERROR', message);
  }

  ai(label: string, content: string): void {
    this.write('AI', `${label}\n${content}`);
  }

  async finalize(status: RunStatus, error?: unknown): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;

    if (error) {
      this.write('ERROR', `Run failed: ${formatArgs([error])}`);
    }

    const finishedAt = new Date();
    this.write(
      'INFO',
      `Run finished with status=${status} durationMs=${finishedAt.getTime() - this.startedAt.getTime()}`,
    );

    this.detachGlobalConsole();

    const summaryBody = this.buildSummaryBody(status, finishedAt);
    try {
      await updateRemoteLogSummary(summaryBody);
      if (config.logSummaryId) {
        this.originalConsole.info(
          `[Logger] Updated summary ${config.logSummaryCategory}:${config.logSummaryId}`,
        );
      }
    } catch (summaryError) {
      this.originalConsole.error(
        `[Logger] Failed to update summary: ${formatArgs([summaryError])}`,
      );
    }
  }

  private buildSummaryBody(status: RunStatus, finishedAt: Date): string {
    const header = [
      `Run: ${this.runName}`,
      `Run ID: ${this.runId}`,
      `Status: ${status}`,
      `Started: ${this.startedAt.toISOString()}`,
      `Finished: ${finishedAt.toISOString()}`,
      `Log file: ${this.logFilePath}`,
      '',
      'Details:',
    ].join('\n');

    const details = this.lines.join('\n');
    const maxDetails = Math.max(config.logSummaryMaxChars - header.length - 1, 200);
    return `${header}\n${truncateTail(details, maxDetails)}`;
  }

  private write(level: LogLevel, message: string): void {
    const line = `[${formatTimestamp(new Date())}] [${this.runName}] [${this.runId}] [${level}] ${message}`;
    this.lines.push(line);
    fs.appendFileSync(this.logFilePath, `${line}\n`, 'utf8');
  }
}

let activeRunLogger: RunLogger | null = null;

export function getActiveRunLogger(): RunLogger | null {
  return activeRunLogger;
}

export function logAiTrace(label: string, content: string): void {
  activeRunLogger?.ai(label, content);
}

export async function runWithRunLogger(
  runName: string,
  task: (logger: RunLogger) => Promise<void>,
): Promise<void> {
  const logger = new RunLogger(runName);
  activeRunLogger = logger;
  logger.attachGlobalConsole();
  logger.info(`Run started: ${runName}`);

  const onSigint = async () => {
    await logger.finalize('interrupted');
    process.exit(130);
  };

  const onSigterm = async () => {
    await logger.finalize('interrupted');
    process.exit(143);
  };

  process.prependOnceListener('SIGINT', onSigint);
  process.prependOnceListener('SIGTERM', onSigterm);

  try {
    await task(logger);
    await logger.finalize('success');
  } catch (error) {
    await logger.finalize('failure', error);
    throw error;
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    activeRunLogger = null;
  }
}
