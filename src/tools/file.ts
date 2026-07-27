import { appendFile, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Tool, ToolResult } from './registry';

export interface FileToolOptions {
  rootDir: string;
}

export class FileTool {
  private readonly rootDir: string;

  constructor(options: FileToolOptions) {
    this.rootDir = path.resolve(options.rootDir);
  }

  getTools(): Tool[] {
    return [
      {
        name: 'file.read',
        description: 'Read a UTF-8 text file.',
        execute: (parameters) => this.read(parameters),
      },
      {
        name: 'file.write',
        description: 'Write UTF-8 text content to a file atomically.',
        execute: (parameters) => this.write(parameters),
      },
      {
        name: 'file.append',
        description: 'Append UTF-8 text content to a file.',
        execute: (parameters) => this.append(parameters),
      },
    ];
  }

  private async read(parameters: Record<string, unknown>): Promise<ToolResult> {
    const pathResult = this.resolveInputPath(parameters.path);
    if (!pathResult.success) {
      return pathResult;
    }

    const offsetResult = readOptionalNonNegativeInteger(parameters.offset, 'offset');
    if (!offsetResult.success) {
      return offsetResult;
    }

    const lengthResult = readOptionalNonNegativeInteger(parameters.length, 'length');
    if (!lengthResult.success) {
      return lengthResult;
    }

    try {
      if (offsetResult.value === undefined && lengthResult.value === undefined) {
        const content = await readFile(pathResult.absolutePath, 'utf8');
        return {
          success: true,
          data: {
            path: pathResult.relativePath,
            content,
            bytesRead: Buffer.byteLength(content),
          },
        };
      }

      const offset = offsetResult.value ?? 0;
      const length = lengthResult.value;
      const file = await open(pathResult.absolutePath, 'r');

      try {
        const stats = await file.stat();
        const bytesToRead = length ?? Math.max(stats.size - offset, 0);
        const buffer = Buffer.alloc(bytesToRead);
        const { bytesRead } = await file.read(buffer, 0, bytesToRead, offset);
        const content = buffer.subarray(0, bytesRead).toString('utf8');

        return {
          success: true,
          data: {
            path: pathResult.relativePath,
            content,
            offset,
            bytesRead,
          },
        };
      } finally {
        await file.close();
      }
    } catch (error) {
      return failure(fileErrorMessage(error, `Failed to read "${pathResult.relativePath}".`));
    }
  }

  private async write(parameters: Record<string, unknown>): Promise<ToolResult> {
    const input = this.readWriteInput(parameters);
    if (!input.success) {
      return input;
    }

    const targetDir = path.dirname(input.absolutePath);
    const tempPath = path.join(
      targetDir,
      `.${path.basename(input.absolutePath)}.${process.pid}.${Date.now()}.tmp`,
    );

    try {
      await mkdir(targetDir, { recursive: true });
      await writeFile(tempPath, input.content, 'utf8');
      await rename(tempPath, input.absolutePath);

      return {
        success: true,
        data: {
          path: input.relativePath,
          bytesWritten: Buffer.byteLength(input.content),
        },
      };
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      return failure(fileErrorMessage(error, `Failed to write "${input.relativePath}".`));
    }
  }

  private async append(parameters: Record<string, unknown>): Promise<ToolResult> {
    const input = this.readWriteInput(parameters);
    if (!input.success) {
      return input;
    }

    try {
      await mkdir(path.dirname(input.absolutePath), { recursive: true });
      await appendFile(input.absolutePath, input.content, 'utf8');

      return {
        success: true,
        data: {
          path: input.relativePath,
          bytesWritten: Buffer.byteLength(input.content),
        },
      };
    } catch (error) {
      return failure(fileErrorMessage(error, `Failed to append "${input.relativePath}".`));
    }
  }

  private readWriteInput(parameters: Record<string, unknown>): WriteInput | FailureResult {
    const pathResult = this.resolveInputPath(parameters.path);
    if (!pathResult.success) {
      return pathResult;
    }

    if (typeof parameters.content !== 'string') {
      return failure('content must be a string.');
    }

    return {
      ...pathResult,
      content: parameters.content,
    };
  }

  private resolveInputPath(value: unknown): ResolvedPath | FailureResult {
    if (typeof value !== 'string' || value.trim() === '') {
      return failure('path must be a non-empty string.');
    }

    const relativePath = value.trim();
    const absolutePath = path.resolve(this.rootDir, relativePath);
    const relativeFromRoot = path.relative(this.rootDir, absolutePath);

    if (
      relativeFromRoot === '..' ||
      relativeFromRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeFromRoot)
    ) {
      return failure(`path "${relativePath}" is outside the configured root.`);
    }

    return {
      success: true,
      relativePath,
      absolutePath,
    };
  }
}

interface ResolvedPath {
  success: true;
  relativePath: string;
  absolutePath: string;
}

interface WriteInput extends ResolvedPath {
  content: string;
}

function readOptionalNonNegativeInteger(
  value: unknown,
  fieldName: string,
): { success: true; value?: number } | FailureResult {
  if (value === undefined) {
    return { success: true };
  }

  if (!Number.isInteger(value) || typeof value !== 'number' || value < 0) {
    return failure(`${fieldName} must be a non-negative integer.`);
  }

  return { success: true, value };
}

type FailureResult = Extract<ToolResult, { success: false }>;

function failure(error: string): FailureResult {
  return {
    success: false,
    error,
  };
}

function fileErrorMessage(error: unknown, fallback: string): string {
  if (isNodeError(error) && error.code === 'ENOENT') {
    return `${fallback} File not found.`;
  }

  if (isNodeError(error) && error.code === 'EACCES') {
    return `${fallback} Permission denied.`;
  }

  if (error instanceof Error) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
