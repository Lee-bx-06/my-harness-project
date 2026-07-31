import type { Action } from '../llm/base';
import { HITLStateMachine, type HITLDecision } from './hitl';
import { PolicyEvaluator, type PolicyRule } from './policy';
import { Sandbox, type SandboxViolation } from './sandbox';
import { ThreatDetector, type ThreatMatch } from './threatDetector';

export type GuardrailDecision = 'allow' | 'deny';
export type GuardrailDecisionSource = 'guardrail' | 'threat-detector' | 'policy' | 'sandbox' | 'hitl';

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
      return {
        decision: 'deny',
        source: 'policy',
        reason: policyResult.reason,
        threats: threatResult.threats,
        matchedPolicyRule: policyResult.matchedRule,
      };
    }

    const sandboxResult = this.sandbox.check(action);
    if (!sandboxResult.allowed) {
      return {
        decision: 'deny',
        source: 'sandbox',
        reason: sandboxResult.reason,
        threats: threatResult.threats,
        sandboxViolation: sandboxResult.violation,
      };
    }

    if (threatResult.recommendation === 'deny') {
      return {
        decision: 'deny',
        source: 'threat-detector',
        reason: threatResult.threats[0]?.reason,
        threats: threatResult.threats,
      };
    }

    const needsConfirmation =
      threatResult.recommendation === 'require-confirmation' ||
      policyResult.decision === 'require-confirmation';

    if (!needsConfirmation) {
      return {
        decision: 'allow',
        source: 'guardrail',
        threats: threatResult.threats,
      };
    }

    const reason = policyResult.reason ?? threatResult.threats[0]?.reason ?? 'Action requires confirmation.';
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
