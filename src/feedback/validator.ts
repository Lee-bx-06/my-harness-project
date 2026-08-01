export interface FeedbackLocation {
  file: string;
  line: number;
  column?: number;
}

export interface Feedback {
  type: 'success' | 'failure';
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  location?: FeedbackLocation;
}

export class TestValidator {
  parse(output: string): Feedback[] {
    return this.extractFeedback(output);
  }

  validate(output: string): Feedback[] {
    return this.extractFeedback(output);
  }

  private extractFeedback(output: string): Feedback[] {
    const lines = output.split(/\r?\n/);
    const feedback: Feedback[] = [];
    let pendingFramework: 'jest' | 'mocha' | undefined;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();

      if (line.startsWith('FAIL ')) {
        pendingFramework = 'jest';
        continue;
      }

      const mochaFailure = line.match(/^\d+\)\s+(.+)$/);
      if (mochaFailure) {
        pendingFramework = 'mocha';
        continue;
      }

      if (pendingFramework && isErrorLine(line)) {
        const location = findLocation(lines.slice(index + 1));

        feedback.push({
          type: 'failure',
          category: classifyMessage(line),
          message: line,
          location,
        });
        pendingFramework = undefined;
        continue;
      }

      if (pendingFramework && line === '') {
        pendingFramework = undefined;
      }
    }

    return feedback;
  }
}

function classifyMessage(message: string): Feedback['category'] {
  if (/syntaxerror/i.test(message)) {
    return 'syntax';
  }

  if (/typeerror/i.test(message)) {
    return 'type';
  }

  if (/lint/i.test(message)) {
    return 'lint';
  }

  if (/performance|timeout/i.test(message)) {
    return 'performance';
  }

  return 'logic';
}

function isErrorLine(line: string): boolean {
  return /^((Type|Syntax)Error:|Error:)/.test(line);
}

function findLocation(lines: string[]): FeedbackLocation | undefined {
  for (const rawLine of lines) {
    const line = rawLine.trim();

    const stackMatch = line.match(/\(([^()]+):(\d+):(\d+)\)$/);
    if (stackMatch) {
      return {
        file: stackMatch[1],
        line: Number(stackMatch[2]),
        column: Number(stackMatch[3]),
      };
    }

    const inlineMatch = line.match(/^at\s+(.+):(\d+):(\d+)$/);
    if (inlineMatch) {
      return {
        file: inlineMatch[1],
        line: Number(inlineMatch[2]),
        column: Number(inlineMatch[3]),
      };
    }
  }

  return undefined;
}
