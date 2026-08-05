export type StopReason = 'max-iterations' | 'user-aborted' | 'task-complete' | 'consecutive-failures';

export interface StopState {
  iteration: number;
  userAborted?: boolean;
  taskComplete?: boolean;
  consecutiveFailures?: number;
}

export interface StopResult {
  shouldStop: boolean;
  reason?: StopReason;
  message?: string;
}

export interface StopConditionOptions {
  maxIterations?: number;
  maxConsecutiveFailures?: number;
}

export class StopCondition {
  private readonly maxIterations?: number;
  private readonly maxConsecutiveFailures?: number;

  constructor(options: StopConditionOptions = {}) {
    this.maxIterations = options.maxIterations;
    this.maxConsecutiveFailures = options.maxConsecutiveFailures;
  }

  evaluate(state: StopState): StopResult {
    if (state.userAborted) {
      return stop('user-aborted', 'User aborted the run.');
    }

    if (state.taskComplete) {
      return stop('task-complete', 'Task is complete.');
    }

    if (this.reachedMaxIterations(state.iteration)) {
      return stop('max-iterations', `Reached maximum iteration count of ${this.maxIterations}.`);
    }

    if (this.reachedMaxConsecutiveFailures(state.consecutiveFailures ?? 0)) {
      return stop(
        'consecutive-failures',
        `Reached maximum consecutive failure count of ${this.maxConsecutiveFailures}.`,
      );
    }

    return { shouldStop: false };
  }

  shouldStop(state: StopState): StopResult {
    return this.evaluate(state);
  }

  check(state: StopState): StopResult {
    return this.evaluate(state);
  }

  private reachedMaxIterations(iteration: number): boolean {
    return typeof this.maxIterations === 'number' && iteration >= this.maxIterations;
  }

  private reachedMaxConsecutiveFailures(consecutiveFailures: number): boolean {
    return (
      typeof this.maxConsecutiveFailures === 'number' &&
      consecutiveFailures >= this.maxConsecutiveFailures
    );
  }
}

function stop(reason: StopReason, message: string): StopResult {
  return {
    shouldStop: true,
    reason,
    message,
  };
}
