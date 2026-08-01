export interface ClassificationResult {
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  suggestion: string;
}

export class FailureClassifier {
  classify = (message: string): ClassificationResult => classifyMessage(message);

  analyze = (message: string): ClassificationResult => classifyMessage(message);
}

function classifyMessage(message: string): ClassificationResult {
  if (/syntaxerror|unexpected token|parse/i.test(message)) {
    return {
      category: 'syntax',
      message,
      suggestion: 'Check the syntax and fix the parse error or unmatched token.',
    };
  }

  if (/typeerror|not assignable|type/i.test(message)) {
    return {
      category: 'type',
      message,
      suggestion: 'Review the type annotation or type assignment causing the mismatch.',
    };
  }

  if (/lint|eslint|prettier|no-console|format/i.test(message)) {
    return {
      category: 'lint',
      message,
      suggestion: 'Run linting and remove the reported style or lint violation.',
    };
  }

  if (/performance|timeout|slow|exceeded/i.test(message)) {
    return {
      category: 'performance',
      message,
      suggestion: 'Investigate the slow path and optimize the operation or timeout.',
    };
  }

  return {
    category: 'logic',
    message,
    suggestion: 'Review the assertion or control flow and correct the expected behavior.',
  };
}
