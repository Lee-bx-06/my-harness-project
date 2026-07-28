import { spawn } from 'node:child_process';
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

function executeCommand(command: string, cwd?: string, timeoutMs?: number): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      detached: process.platform !== 'win32',
      shell: true,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            terminateProcess(child.pid);
          }, timeoutMs);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timer) {
        clearTimeout(timer);
      }

      resolve(
        failure(`Failed to execute command. ${error.message}`, {
          stdout,
          stderr,
          exitCode: null,
        }),
      );
    });

    child.on('close', (exitCode, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timer) {
        clearTimeout(timer);
      }

      const data = {
        stdout,
        stderr,
        exitCode,
        signal,
      };

      if (timedOut) {
        resolve(failure(`Command timed out after ${timeoutMs}ms.`, data));
        return;
      }

      if (exitCode !== 0) {
        resolve(failure(`Command exited with code ${exitCode}.`, data));
        return;
      }

      resolve({
        success: true,
        data,
      });
    });
  });
}

function terminateProcess(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }

  try {
    process.kill(-pid);
  } catch {
    try {
      process.kill(pid);
    } catch {
      // The process may have already exited between timeout and termination.
    }
  }
}

function failure(error: string, data?: unknown): FailureResult {
  return {
    success: false,
    error,
    data,
  };
}
