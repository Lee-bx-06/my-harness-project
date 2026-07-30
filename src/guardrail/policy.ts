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

  evaluate(_action: Action): PolicyEvaluationResult {
    void this.rules;

    return {
      decision: 'allow',
    };
  }
}
