import type { Action } from '../llm/base';

export type PolicyDecision = 'allow' | 'deny' | 'require-confirmation';

export type PolicyCondition =
  | FieldPolicyCondition
  | AllPolicyCondition
  | AnyPolicyCondition;

export interface FieldPolicyCondition {
  field: string;
  equals?: unknown;
  matches?: string;
}

export interface AllPolicyCondition {
  all: PolicyCondition[];
}

export interface AnyPolicyCondition {
  any: PolicyCondition[];
}

export interface PolicyRule {
  id: string;
  decision: PolicyDecision;
  priority: number;
  condition: PolicyCondition;
  reason?: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  matchedRule?: PolicyRule;
  reason?: string;
}

export class PolicyEvaluator {
  constructor(private readonly rules: PolicyRule[] = []) {}

  evaluate(action: Action): PolicyEvaluationResult {
    const matchedRule = this.rules
      .filter((rule) => conditionMatches(rule.condition, action))
      .sort((left, right) => right.priority - left.priority)[0];

    if (!matchedRule) {
      return {
        decision: 'allow',
      };
    }

    return {
      decision: matchedRule.decision,
      matchedRule,
      reason: matchedRule.reason,
    };
  }
}

function conditionMatches(condition: PolicyCondition, action: Action): boolean {
  if ('all' in condition) {
    return condition.all.every((entry) => conditionMatches(entry, action));
  }

  if ('any' in condition) {
    return condition.any.some((entry) => conditionMatches(entry, action));
  }

  const value = getFieldValue(action, condition.field);

  if ('equals' in condition && value !== condition.equals) {
    return false;
  }

  if (condition.matches !== undefined) {
    return typeof value === 'string' && new RegExp(condition.matches).test(value);
  }

  return 'equals' in condition;
}

function getFieldValue(source: Action, fieldPath: string): unknown {
  return fieldPath.split('.').reduce<unknown>((value, field) => {
    if (!isRecord(value)) {
      return undefined;
    }

    return value[field];
  }, source);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
