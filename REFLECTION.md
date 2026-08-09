# REFLECTION.md

## 1. Superpowers 工作流的作用

本项目中最有价值的 Superpowers 环节是 spec-driven planning、TDD 和 review。Coding Agent Harness 很容易被做成“调用 LLM 的脚本”，但 `SPEC.md` 要求我把主循环、LLM 抽象、工具分发、治理护栏、反馈、记忆、配置和凭据安全拆成可验证机制；`PLAN.md` 又把它们拆成 T1 到 T11 的小任务，并记录验证命令和 commit hash。相比之下，部分流程文档和分支记录的形式感更强，维护成本不低。但它也提醒我：实现完成不等于作业完成，规格、实现、测试、CI、README、分发和过程证据都齐了，才算真正交付。

## 2. TDD 在 AI 协作中的作用

TDD 在这次协作中是放大器，不是阻碍。先写失败测试能把 AI 的目标钉住，避免它写出“看起来合理但机制不成立”的代码。例如 `ThreatDetector` 必须识别 `rm -rf /` 和 `git push --force`，`CredentialManager` 必须支持 keyring 适配器和加密文件回退，`Agent` 主循环必须串起 LLM 动作、guardrail、工具执行和反馈回灌。项目最终有 `npm test` 一键测试，覆盖 LLM、tools、guardrail、feedback、memory、config、security、CLI 和 main loop，`AGENT_LOG.md` 记录的完整结果是 110 个测试通过。早期加密工具只测加解密往返，后来补 Argon2id 测试后才逼出更符合计划的实现，这是测试不够细会导致偏移的具体例子。

## 3. SPEC / PLAN 对实现质量的影响

`SPEC.md` 写得最清楚的是“领域与机制设计”。它把 Coding 场景的工具、反馈信号、危险动作和记忆需求分开，并选择治理护栏作为重点维度，所以后续自然形成了 `ThreatDetector`、`PolicyEvaluator`、`Sandbox`、`HITLStateMachine` 等代码模块。这些机制离开真实 LLM 仍可用单元测试验证，符合 A 类项目“机制必须是代码”的要求。规格不清导致返工主要发生在交付侧：一开始写了 Docker 和原生发布包，但 PLAN 对发布链路拆得不够细，后期才补 `Dockerfile`、`scripts/package-binary.cjs`、CI 和 README 分发说明。如果重做，我会把“从零获取并运行项目”也作为早期任务来验证。

## 4. Subagent / 长任务协作体验

最适合交给 AI 的粒度是“一个模块、一个失败测试文件、一个清楚边界”。LLM 抽象、工具注册、文件工具、策略评估器、反馈分类器、记忆检索器、配置加载器这类任务都适合独立推进；AI 可以在这种粒度下稳定工作，因为上下文小、验收标准明确。高风险部分必须人工 review，包括 shell 执行、文件边界、git 操作、凭据存储和发布脚本。AI 能快速写封装，但是否会越权、泄露 key、执行破坏性命令，不能靠提示词保证，必须落到代码护栏和测试上。

## 5. Prompt / Context 策略

最有效的策略是只给必要上下文，并明确“要验证什么”。比起直接说“实现某模块”，更稳定的是给出 SPEC/PLAN 段落、目标文件、测试文件和禁止越界范围。例如 CLI 阶段聚焦 `src/cli/program.ts`、`bin/agent` 和 `tests/unit/cli/program.test.ts`；反馈 demo 阶段聚焦 `FeedbackLoop`、`TestValidator`、`FailureClassifier` 和集成 smoke test。安全相关文档还要区分“已实现”和“后续计划”，例如当前 `CredentialManager` 已有 keyring adapter 和加密文件回退，但真实 OS keyring 包接入仍应如实说明，不能为了文档好看而夸大。

## 6. 凭据安全与分发带来的工程思考

凭据安全要求迫使我把 API key 当成产品边界，而不是临时运行参数。项目使用 `OPENAI_API_KEY` 和 `llm.apiKeyEnv`，实现了 AES-256-GCM、Argon2id、`CredentialManager`，并在 `.gitignore` 排除 `.env`、数据库、日志和 `release/`。这说明安全不是 README 里一句提醒，而是 schema、存储、日志、CLI 和测试共同约束出来的行为。分发要求也暴露了“本地能跑不代表别人能跑”：Docker 提供环境一致性，原生发布包对用户更直接，但要处理平台启动器、Node 运行时和依赖复制。补齐这两条链路后，项目才更接近真实交付。

## 7. 对 Superpowers 方法论的批判性评价

Superpowers 的假设是：把目标拆成规格、计划、测试、review 和日志后，AI 就能在明确边界内长期推进。这个假设在本项目大体成立，尤其是模块化实现和 mock LLM 测试阶段。但它也要求开发者持续支付过程维护成本；单人项目里，写 SPEC、更新 PLAN、维护 AGENT_LOG、补 CI 和发布说明都很耗时。如果重做，我会更早建立“课程要求到仓库文件”的核对表，并把交付物完整性纳入主计划。我的判断是：Superpowers 不替代工程判断，但能固定住 AI 协作中最容易松掉的纪律，让“不清楚、没验证、不能交付”的问题更早暴露。

## 8. AI 辅助标注

本文基于 `SPEC.md`、`PLAN.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md`、README 和源码结构整理。AI 用于归纳项目过程、压缩表达和检查是否覆盖课程反思要点；最终案例选择、观点和结论由本人确认。
