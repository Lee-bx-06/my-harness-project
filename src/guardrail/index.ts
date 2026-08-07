import type { Action } from '../llm/base';
import { HITLStateMachine, type HITLDecision } from './hitl';
import { PolicyEvaluator, type PolicyRule } from './policy';
import { Sandbox, type SandboxViolation } from './sandbox';
import {
  ThreatDetector,
  type ThreatDetectionResult,
  type ThreatMatch,
} from './threatDetector';

export type GuardrailDecision = 'allow' | 'deny';
export type GuardrailDecisionSource =
  | 'guardrail'
  | 'threat-detector'
  | 'policy'
  | 'sandbox'
  | 'hitl';

export interface GuardrailOptions {
  threatDetector?: ThreatDetector;
  policyEvaluator?: PolicyEvaluator;
  sandbox?: Sandbox;
  hitl?: HITLStateMachine;
}

export interface GuardrailResult {
  decision: GuardrailDecision;
  source: GuardrailDecisionSource;
  reason?: string;
  threats?: ThreatMatch[];
  matchedPolicyRule?: PolicyRule;
  sandboxViolation?: SandboxViolation;
  hitlDecision?: HITLDecision;
}

export class Guardrail {
  private readonly threatDetector: ThreatDetector;
  private readonly policyEvaluator: PolicyEvaluator;
  private readonly sandbox: Sandbox;
  private readonly hitl: HITLStateMachine;

  constructor(options: GuardrailOptions = {}) {
    this.threatDetector = options.threatDetector ?? new ThreatDetector();
    this.policyEvaluator = options.policyEvaluator ?? new PolicyEvaluator();
    this.sandbox = options.sandbox ?? new Sandbox();
    this.hitl = options.hitl ?? new HITLStateMachine();
  }

  async evaluate(action: Action): Promise<GuardrailResult> {
    const threatResult = this.threatDetector.detect(action);
    const policyResult = this.policyEvaluator.evaluate(action);

    if (policyResult.decision === 'deny') {
      return this.denyForPolicy(policyResult, threatResult);
    }

    const sandboxResult = this.sandbox.check(action);
    if (!sandboxResult.allowed) {
      return this.denyForSandbox(sandboxResult, threatResult);
    }

    if (threatResult.recommendation === 'deny') {
      return this.denyForThreat(threatResult);
    }

    if (!requiresConfirmation(threatResult, policyResult)) {
      return this.allow(threatResult);
    }

    return this.confirm(action, policyResult, threatResult);
  }

  private denyForPolicy(
    policyResult: ReturnType<PolicyEvaluator['evaluate']>,
    threatResult: ThreatDetectionResult,
  ): GuardrailResult {
    return {
      decision: 'deny',
      source: 'policy',
      reason: policyResult.reason,
      threats: threatResult.threats,
      matchedPolicyRule: policyResult.matchedRule,
    };
  }

  private denyForSandbox(
    sandboxResult: ReturnType<Sandbox['check']>,
    threatResult: ThreatDetectionResult,
  ): GuardrailResult {
    return {
      decision: 'deny',
      source: 'sandbox',
      reason: sandboxResult.reason,
      threats: threatResult.threats,
      sandboxViolation: sandboxResult.violation,
    };
  }

  private denyForThreat(threatResult: ThreatDetectionResult): GuardrailResult {
    return {
      decision: 'deny',
      source: 'threat-detector',
      reason: threatResult.threats[0]?.reason,
      threats: threatResult.threats,
    };
  }

  private allow(threatResult: ThreatDetectionResult): GuardrailResult {
    return {
      decision: 'allow',
      source: 'guardrail',
      threats: threatResult.threats,
    };
  }

  private async confirm(
    action: Action,
    policyResult: ReturnType<PolicyEvaluator['evaluate']>,
    threatResult: ThreatDetectionResult,
  ): Promise<GuardrailResult> {
    const reason =
      policyResult.reason ?? threatResult.threats[0]?.reason ?? 'Action requires confirmation.';
    const hitlDecision = await this.hitl.requestConfirmation(action, reason);

    return {
      decision: hitlDecision.status === 'approved' ? 'allow' : 'deny',
      source: 'hitl',
      reason: hitlDecision.note ?? reason,
      threats: threatResult.threats,
      matchedPolicyRule: policyResult.matchedRule,
      hitlDecision,
    };
  }
}

function requiresConfirmation(
  threatResult: ThreatDetectionResult,
  policyResult: ReturnType<PolicyEvaluator['evaluate']>,
): boolean {
  return (
    threatResult.recommendation === 'require-confirmation' ||
    policyResult.decision === 'require-confirmation'
  );
}
