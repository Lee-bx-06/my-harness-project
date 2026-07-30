import path from 'node:path';
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

  check(action: Action): SandboxCheckResult {
    const directoryResult = this.checkDirectoryBoundary(action);
    if (!directoryResult.allowed) {
      return directoryResult;
    }

    const commandResult = this.checkBlockedCommand(action);
    if (!commandResult.allowed) {
      return commandResult;
    }

    const networkResult = this.checkNetworkAccess(action);
    if (!networkResult.allowed) {
      return networkResult;
    }

    return {
      allowed: true,
    };
  }

  private checkDirectoryBoundary(action: Action): SandboxCheckResult {
    if (!action.type.startsWith('file.')) {
      return allow();
    }

    const filePath = action.parameters.path;
    const allowedDirectories = this.options.allowedDirectories ?? [];

    if (typeof filePath !== 'string' || allowedDirectories.length === 0) {
      return allow();
    }

    const resolvedPath = normalizePath(filePath);
    const isAllowed = allowedDirectories.some((directory) =>
      isWithinDirectory(resolvedPath, normalizePath(directory)),
    );

    if (isAllowed) {
      return allow();
    }

    return {
      allowed: false,
      violation: {
        type: 'directory-boundary',
        value: filePath,
      },
      reason: `Path is outside the configured allowed directories: ${filePath}`,
    };
  }

  private checkBlockedCommand(action: Action): SandboxCheckResult {
    const command = getShellCommand(action);
    if (command === undefined) {
      return allow();
    }

    const executable = command.trim().split(/\s+/, 1)[0]?.toLowerCase();
    const blockedCommand = (this.options.blockedCommands ?? []).find(
      (entry) => entry.toLowerCase() === executable,
    );

    if (blockedCommand === undefined) {
      return allow();
    }

    return {
      allowed: false,
      violation: {
        type: 'blocked-command',
        value: blockedCommand,
      },
      reason: `Blocked command cannot be executed: ${blockedCommand}`,
    };
  }

  private checkNetworkAccess(action: Action): SandboxCheckResult {
    if (this.options.networkAccess !== false) {
      return allow();
    }

    const command = getShellCommand(action);
    if (command === undefined || !/\b(?:curl|wget)\b/i.test(command)) {
      return allow();
    }

    return {
      allowed: false,
      violation: {
        type: 'network-access',
      },
      reason: 'Network access is disabled for this sandbox.',
    };
  }
}

function allow(): SandboxCheckResult {
  return {
    allowed: true,
  };
}

function getShellCommand(action: Action): string | undefined {
  if (action.type !== 'shell.exec') {
    return undefined;
  }

  const command = action.parameters.command;
  return typeof command === 'string' ? command : undefined;
}

function normalizePath(input: string): string {
  return path.resolve(input).toLowerCase();
}

function isWithinDirectory(candidatePath: string, directoryPath: string): boolean {
  return candidatePath === directoryPath || candidatePath.startsWith(`${directoryPath}${path.sep}`);
}
