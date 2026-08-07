import { runShellCommand } from './command';
import type { Tool, ToolResult } from './registry';

export class ShellTool {
  getTools(): Tool[] {
    return [
      {
        name: 'shell.exec',
        description: 'Execute a shell command and capture stdout and stderr.',
        execute: (parameters) => this.exec(parameters),
      },
    ];
  }

  private async exec(parameters: Record<string, unknown>): Promise<ToolResult> {
    const input = readShellExecInput(parameters);
    if (!input.success) {
      return input;
    }

    return executeCommand(input.command, input.cwd, input.timeoutMs);
  }
}

interface ShellExecInput {
  success: true;
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

type FailureResult = Extract<ToolResult, { success: false }>;

function readShellExecInput(parameters: Record<string, unknown>): ShellExecInput | FailureResult {
  if (typeof parameters.command !== 'string' || parameters.command.trim() === '') {
    return failure('command must be a non-empty string.');
  }

  if (parameters.cwd !== undefined && typeof parameters.cwd !== 'string') {
    return failure('cwd must be a string when provided.');
  }

  if (
    parameters.timeoutMs !== undefined &&
    (!Number.isInteger(parameters.timeoutMs) ||
      typeof parameters.timeoutMs !== 'number' ||
      parameters.timeoutMs < 0)
  ) {
    return failure('timeoutMs must be a non-negative integer when provided.');
  }

  return {
    success: true,
    command: parameters.command,
    cwd: parameters.cwd,
    timeoutMs: parameters.timeoutMs,
  };
}

async function executeCommand(command: string, cwd?: string, timeoutMs?: number): Promise<ToolResult> {
  const result = await runShellCommand(command, { cwd, timeoutMs });
  const data = {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    signal: result.signal,
  };

  if (result.timedOut) {
    return failure(`Command timed out after ${timeoutMs}ms.`, data);
  }

  if (result.exitCode !== 0) {
    return failure(`Command exited with code ${result.exitCode}.`, data);
  }

  return {
    success: true,
    data,
  };
}

function failure(error: string, data?: unknown): FailureResult {
  return {
    success: false,
    error,
    data,
  };
}
