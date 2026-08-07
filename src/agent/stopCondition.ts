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

type StopRule = (state: StopState) => StopResult | undefined;

export class StopCondition {
  private readonly maxIterations?: number;
  private readonly maxConsecutiveFailures?: number;

  constructor(options: StopConditionOptions = {}) {
    this.maxIterations = options.maxIterations;
    this.maxConsecutiveFailures = options.maxConsecutiveFailures;
  }

  evaluate(state: StopState): StopResult {
    for (const rule of this.rules()) {
      const result = rule(state);
      if (result) {
        return result;
      }
    }

    return { shouldStop: false };
  }

  shouldStop(state: StopState): StopResult {
    return this.evaluate(state);
  }

  check(state: StopState): StopResult {
    return this.evaluate(state);
  }

  private rules(): StopRule[] {
    return [
      stopWhenUserAborted,
      stopWhenTaskComplete,
      this.stopWhenMaxIterationsReached,
      this.stopWhenMaxConsecutiveFailuresReached,
    ];
  }

  private readonly stopWhenMaxIterationsReached: StopRule = (state) => {
    if (!this.reachedMaxIterations(state.iteration)) {
      return undefined;
    }

    return stop('max-iterations', `Reached maximum iteration count of ${this.maxIterations}.`);
  };

  private readonly stopWhenMaxConsecutiveFailuresReached: StopRule = (state) => {
    if (!this.reachedMaxConsecutiveFailures(state.consecutiveFailures ?? 0)) {
      return undefined;
    }

    return stop(
      'consecutive-failures',
      `Reached maximum consecutive failure count of ${this.maxConsecutiveFailures}.`,
    );
  };

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

function stopWhenUserAborted(state: StopState): StopResult | undefined {
  return state.userAborted ? stop('user-aborted', 'User aborted the run.') : undefined;
}

function stopWhenTaskComplete(state: StopState): StopResult | undefined {
  return state.taskComplete ? stop('task-complete', 'Task is complete.') : undefined;
}
