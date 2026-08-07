import type { Action } from '../llm/base';

export type HITLMode = 'interactive' | 'non-interactive';
export type HITLState = 'pending' | 'require-confirmation' | 'approved' | 'rejected';
export type HITLDecisionStatus = 'approved' | 'rejected';

export interface HITLOptions {
  mode?: HITLMode;
  timeoutMs?: number;
}

export interface HITLRequest {
  action: Action;
  reason: string;
}

export interface HITLDecision {
  status: HITLDecisionStatus;
  note?: string;
}

interface PendingConfirmation {
  resolve: (decision: HITLDecision) => void;
  timeout: NodeJS.Timeout;
}

export class HITLStateMachine {
  readonly mode: HITLMode;
  readonly timeoutMs: number;
  state: HITLState = 'pending';
  currentRequest?: HITLRequest;
  private pendingConfirmation?: PendingConfirmation;

  constructor(options: HITLOptions = {}) {
    this.mode = options.mode ?? 'interactive';
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  requestConfirmation(action: Action, reason: string): Promise<HITLDecision> {
    if (this.mode === 'non-interactive') {
      this.state = 'rejected';
      this.currentRequest = undefined;

      return Promise.resolve({
        status: 'rejected',
        note: 'Confirmation rejected because HITL is running in non-interactive mode.',
      });
    }

    this.state = 'require-confirmation';
    this.currentRequest = {
      action,
      reason,
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.complete({
          status: 'rejected',
          note: `Confirmation timed out after ${this.timeoutMs}ms.`,
        });
      }, this.timeoutMs);

      this.pendingConfirmation = {
        resolve,
        timeout,
      };
    });
  }

  approve(note?: string): void {
    this.complete({
      status: 'approved',
      note,
    });
  }

  reject(note?: string): void {
    this.complete({
      status: 'rejected',
      note,
    });
  }

  private complete(decision: HITLDecision): void {
    if (this.pendingConfirmation === undefined) {
      return;
    }

    const pendingConfirmation = this.pendingConfirmation;
    clearTimeout(pendingConfirmation.timeout);
    this.pendingConfirmation = undefined;
    this.currentRequest = undefined;
    this.state = decision.status;
    pendingConfirmation.resolve(decision);
  }
}
