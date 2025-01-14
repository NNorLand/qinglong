import PQueue, { QueueAddOptions } from 'p-queue-cjs';
import os from 'os';
import { AuthDataType, AuthModel } from '../data/auth';
import Logger from '../loaders/logger';

class TaskLimit {
  private oneLimit = new PQueue({ concurrency: 1 });
  private updateLogLimit = new PQueue({ concurrency: 1 });
  private cronLimit = new PQueue({ concurrency: Math.max(os.cpus().length, 4) });

  get cronLimitActiveCount() {
    return this.cronLimit.pending;
  }

  get cronLimitPendingCount() {
    return this.cronLimit.size;
  }

  constructor() {
    this.setCustomLimit();
  }

  private handleEvents() {
    this.cronLimit.on('add', () => {
      Logger.info(
        `[schedule][任务加入队列] 运行中任务数: ${this.cronLimitActiveCount}, 等待中任务数: ${this.cronLimitPendingCount}`,
      );
    })
    this.cronLimit.on('active', () => {
      Logger.info(
        `[schedule][开始处理任务] 运行中任务数: ${this.cronLimitActiveCount + 1}, 等待中任务数: ${this.cronLimitPendingCount}`,
      );
    })
    this.cronLimit.on('completed', (param) => {
      Logger.info(
        `[schedule][任务处理完成] 运行中任务数: ${this.cronLimitActiveCount - 1}, 等待中任务数: ${this.cronLimitPendingCount}, 参数 ${JSON.stringify(param)}`,
      );
    });
    this.cronLimit.on('error', error => {
      Logger.error(
        `[schedule][处理任务错误] 运行中任务数: ${this.cronLimitActiveCount}, 等待中任务数: ${this.cronLimitPendingCount}, 参数 ${JSON.stringify(error)}`,
      );
    });
    this.cronLimit.on('idle', () => {
      Logger.info(
        `[schedule][任务队列] 空闲中...`,
      );
    });
  }

  public async setCustomLimit(limit?: number) {
    if (limit) {
      this.cronLimit = new PQueue({ concurrency: limit });;
      this.handleEvents();
      return;
    }
    await AuthModel.sync();
    const doc = await AuthModel.findOne({
      where: { type: AuthDataType.systemConfig },
    });
    if (doc?.info?.cronConcurrency) {
      this.cronLimit = new PQueue({ concurrency: doc?.info?.cronConcurrency });
      this.handleEvents();
    }
  }

  public async runWithCronLimit<T>(fn: () => Promise<T>, options?: Partial<QueueAddOptions>): Promise<T | void> {
    return this.cronLimit.add(fn, options);
  }

  public runOneByOne<T>(fn: () => Promise<T>, options?: Partial<QueueAddOptions>): Promise<T | void> {
    return this.oneLimit.add(fn, options);
  }

  public updateDepLog<T>(fn: () => Promise<T>, options?: Partial<QueueAddOptions>): Promise<T | void> {
    return this.updateLogLimit.add(fn, options);
  }
}

export default new TaskLimit();
