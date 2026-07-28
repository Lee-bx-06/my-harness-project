import { spawn } from 'node:child_process';
import type { Tool, ToolResult } from './registry';

export class TestTool {
  getTools(): Tool[] {
    return [
      {
        name: 'test.run',
        description: 'Run a test command and return structured test results.',
        execute: (parameters) => this.run(parameters),
      },
    ];
  }

  private async run(parameters: Record<string, unknown>): Promise<ToolResult> {
    const input = readTestRunInput(parameters);
    if (!input.success) {
      return input;
    }

    const execution = await executeCommand(input.command, input.cwd);
    const parsed = parseTestOutput(`${execution.stdout}\n${execution.stderr}`);
    const data: TestRunData = {
      ...parsed,
      stdout: execution.stdout,
      stderr: execution.stderr,
      exitCode: execution.exitCode,
      signal: execution.signal,
      passed: execution.exitCode === 0 && parsed.failedCount === 0,
    };

    if (!data.passed) {
      return failure(`Tests failed with exit code ${execution.exitCode}.`, data);
    }

    return {
      success: true,
      data,
    };
  }
}

interface TestRunInput {
  success: true;
  command: string;
  cwd?: string;
}

interface CommandExecution {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

interface TestRunData extends ParsedTestOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  passed: boolean;
}

interface ParsedTestOutput {
  framework: 'jest' | 'mocha' | 'unknown';
  total: number;
  passedCount: number;
  failedCount: number;
  failures: TestFailure[];
}

interface TestFailure {
  name: string;
  message: string;
}

type FailureResult = Extract<ToolResult, { success: false }>;

function readTestRunInput(parameters: Record<string, unknown>): TestRunInput | FailureResult {
  if (typeof parameters.command !== 'string' || parameters.command.trim() === '') {
    return failure('command must be a non-empty string.');
  }

  if (parameters.cwd !== undefined && typeof parameters.cwd !== 'string') {
    return failure('cwd must be a string when provided.');
  }

  return {
    success: true,
    command: parameters.command,
    cwd: parameters.cwd,
  };
}

function executeCommand(command: string, cwd?: string): Promise<CommandExecution> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      stderr += `${error.message}\n`;
      resolve({
        stdout,
        stderr,
        exitCode: null,
        signal: null,
      });
    });

    child.on('close', (exitCode, signal) => {
      resolve({
        stdout,
        stderr,
        exitCode,
        signal,
      });
    });
  });
}

function parseTestOutput(output: string): ParsedTestOutput {
  const jest = parseJestOutput(output);
  if (jest) {
    return jest;
  }

  const mocha = parseMochaOutput(output);
  if (mocha) {
    return mocha;
  }

  return {
    framework: 'unknown',
    total: 0,
    passedCount: 0,
    failedCount: 0,
    failures: [],
  };
}

function parseJestOutput(output: string): ParsedTestOutput | undefined {
  const summary = output.match(/Tests:\s*(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/i);
  if (!summary) {
    return undefined;
  }

  return {
    framework: 'jest',
    failedCount: Number(summary[1] ?? 0),
    passedCount: Number(summary[2] ?? 0),
    total: Number(summary[3]),
    failures: parseJestFailures(output),
  };
}

function parseJestFailures(output: string): TestFailure[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('FAIL '))
    .map((line) => {
      const name = line.slice('FAIL '.length).trim();
      return {
        name,
        message: line,
      };
    });
}

function parseMochaOutput(output: string): ParsedTestOutput | undefined {
  const passing = output.match(/^\s*(\d+)\s+passing\b/im);
  const failing = output.match(/^\s*(\d+)\s+failing\b/im);

  if (!passing && !failing) {
    return undefined;
  }

  const passedCount = Number(passing?.[1] ?? 0);
  const failedCount = Number(failing?.[1] ?? 0);

  return {
    framework: 'mocha',
    total: passedCount + failedCount,
    passedCount,
    failedCount,
    failures: parseMochaFailures(output),
  };
}

function parseMochaFailures(output: string): TestFailure[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const failure = line.match(/^\d+\)\s+(.+)$/);
      if (!failure) {
        return undefined;
      }

      return {
        name: failure[1].trim(),
        message: line,
      };
    })
    .filter((failure): failure is TestFailure => failure !== undefined);
}

function failure(error: string, data?: unknown): FailureResult {
  return {
    success: false,
    error,
    data,
  };
}
