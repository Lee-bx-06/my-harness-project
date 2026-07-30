import type { Action } from '../llm/base';

export type SandboxViolationType =
  | 'directory-boundary'
  | 'blocked-command'
  | 'network-access';

export interface SandboxOptions {
  allowedDirectories?: string[];
  blockedCommands?: string[];
  networkAccess?: boolean;
}

export interface SandboxViolation {
  type: SandboxViolationType;
  value?: string;
}

export interface SandboxCheckResult {
  allowed: boolean;
  violation?: SandboxViolation;
  reason?: string;
}

export class Sandbox {
  constructor(private readonly options: SandboxOptions = {}) {}

  check(_action: Action): SandboxCheckResult {
    void this.options;

    return {
      allowed: true,
    };
  }
}
