# PLAN.md：Coding Agent Harness 实现计划

> 本计划基于 SPEC.md 生成，遵循 TDD 原则（先写失败测试，再实现，再重构）

---

## 任务总览

| 阶段 | 模块 | Task 数量 | 依赖关系 |
|------|------|-----------|----------|
| **P0** | 基础设置 | 2 | 无 |
| **P1** | LLM 抽象层 | 3 | P0 |
| **P2** | 工具分发 | 5 | P0 |
| **P3** | 治理护栏（重点） | 5 | P0, P2 |
| **P4** | 反馈闭环 | 3 | P0, P2 |
| **P5** | 记忆系统 | 2 | P0 |
| **P6** | 配置管理 | 2 | P0 |
| **P7** | 凭据安全 | 2 | P0 |
| **P8** | Agent 主循环 | 3 | P1-P7 |
| **P9** | CLI 入口 | 1 | P8 |
| **P10** | 机制演示 | 3 | P3-P4 |
| **P11** | CI/CD 配置 | 1 | 所有 |

---

## P0：基础设置

### T0.1：项目初始化与依赖安装

**目标**：初始化 TypeScript 项目，安装必要依赖

**涉及文件**：
- `package.json`
- `tsconfig.json`
- `.gitignore`

**预期实现要点**：
- 使用 `npm init -y` 初始化项目
- 安装依赖：`typescript`, `@types/node`, `zod`, `sqlite3`, `@types/sqlite3`, `commander`, `dotenv`, `crypto`
- 配置 TypeScript：`tsconfig.json` 设置 `target: ES2020`, `module: CommonJS`, `strict: true`

**验证步骤**：
- 运行 `npm install` 成功
- 运行 `npx tsc --noEmit` 无错误

### T0.2：目录结构创建

**目标**：创建项目目录结构

**涉及文件**：
- `src/` 目录及其子目录
- `tests/` 目录
- `config/` 目录
- `docs/` 目录

**预期实现要点**：
```
src/
├── agent/
├── llm/
├── tools/
├── guardrail/
├── feedback/
├── memory/
├── config/
├── security/
└── cli/
tests/
├── unit/
└── integration/
```

**验证步骤**：
- 运行 `ls -la src/` 确认所有目录创建成功

---

## P1：LLM 抽象层

### T1.1：定义 LLM 接口

**目标**：定义统一的 LLM 接口，支持多种实现

**涉及文件**：
- `src/llm/base.ts`

**预期实现要点**：
```typescript
interface LLMInterface {
  generate(messages: Message[]): Promise<string>;
  generateAction(messages: Message[]): Promise<Action>;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

**验证步骤**：
- 编写单元测试：`tests/unit/llm/base.test.ts`
- 测试接口定义是否正确

### T1.2：实现 Mock LLM

**目标**：实现 Mock LLM，用于离线测试

**涉及文件**：
- `src/llm/mock.ts`

**预期实现要点**：
- Mock LLM 根据预设规则返回响应
- 支持配置预设动作序列
- 支持模拟错误情况

**验证步骤**：
- 编写单元测试：`tests/unit/llm/mock.test.ts`
- 测试 Mock LLM 返回预设动作
- 测试 Mock LLM 模拟错误

### T1.3：实现 OpenAI LLM

**目标**：实现 OpenAI API 适配器

**涉及文件**：
- `src/llm/openai.ts`

**预期实现要点**：
- 使用 OpenAI 官方 SDK
- 处理 API 调用、错误、重试
- 解析 LLM 响应为 Action 对象

**验证步骤**：
- 编写单元测试：`tests/unit/llm/openai.test.ts`（使用 Mock HTTP 客户端）
- 测试 API 调用流程
- 测试错误处理和重试机制

---

## P2：工具分发

### T2.1：实现工具注册中心

**目标**：实现工具注册和分发机制

**涉及文件**：
- `src/tools/registry.ts`

**预期实现要点**：
- `ToolRegistry` 类管理所有工具
- `register` 方法注册工具
- `get` 方法根据类型获取工具
- `list` 方法列出所有可用工具

**验证步骤**：
- 编写单元测试：`tests/unit/tools/registry.test.ts`
- 测试工具注册、获取、列出

**提交记录**：
- Red: `405c2e1` - test: add failing tests for tool registry
- Red log: `a8c1876` - docs: add agent log for tool registry red phase
- Green: `d888198` - feat: implement tool registry

### T2.2：实现文件读写工具

**目标**：实现 `file.read`, `file.write`, `file.append` 工具

**涉及文件**：
- `src/tools/file.ts`

**预期实现要点**：
- `FileTool` 类实现文件操作
- 支持大文件分块读取
- 支持原子写入
- 参数校验和错误处理

**验证步骤**：
- 编写单元测试：`tests/unit/tools/file.test.ts`
- 测试文件读取、写入、追加
- 测试错误处理（文件不存在、权限不足）

**提交记录**：
- Red: `7e61127` - test: add failing tests for file tool
- Green: `0c48bfe` - feat: implement file tool

### T2.3：实现 Shell 命令工具

**目标**：实现 `shell.exec` 工具

**涉及文件**：
- `src/tools/shell.ts`

**预期实现要点**：
- `ShellTool` 类执行 shell 命令
- 支持超时控制
- 支持输出捕获（stdout/stderr）
- 支持工作目录设置

**验证步骤**：
- 编写单元测试：`tests/unit/tools/shell.test.ts`
- 测试命令执行、输出捕获
- 测试超时处理

**提交记录**：
- Red: `910e7fd` - test: add failing tests for shell tool
- Green: `096cd80` - feat: implement shell exec tool

### T2.4：实现测试运行工具

**目标**：实现 `test.run` 工具

**涉及文件**：
- `src/tools/test.ts`

**预期实现要点**：
- `TestTool` 类运行测试命令
- 解析测试框架输出（Jest、Mocha）
- 返回结构化测试结果

**验证步骤**：
- 编写单元测试：`tests/unit/tools/test.test.ts`
- 测试测试命令执行
- 测试输出解析

**提交记录**：
- Red: `baf0469` - test: add failing tests for test tool
- Green: `28772a2` - feat: implement test run tool

### T2.5：实现 Git 操作工具

**目标**：实现 `git.status`, `git.commit` 工具

**涉及文件**：
- `src/tools/git.ts`

**预期实现要点**：
- `GitTool` 类封装 git 命令
- 支持 git status、commit 操作
- 错误处理（非 git 仓库、未配置用户）

**验证步骤**：
- 编写单元测试：`tests/unit/tools/git.test.ts`
- 测试 git status、commit

**提交记录**：
- Red: `95e23d4` - test: add failing tests for git tool
- Green: `82faf8f` - feat: implement git tool
- Refactor: `2c87961` - refactor: extract shared command runner

---

## P3：治理护栏（重点模块）

### T3.1：实现威胁检测器

**目标**：实现危险动作识别器

**涉及文件**：
- `src/guardrail/threatDetector.ts`

**预期实现要点**：
- `ThreatDetector` 类识别危险动作
- 基于正则表达式匹配危险命令模式
- 支持多种危险类别：破坏性命令、强制推送、系统修改等
- 返回威胁级别和建议处理方式

**验证步骤**：
- 编写单元测试：`tests/unit/guardrail/threatDetector.test.ts`
- 测试识别 `rm -rf *`、`git push --force`、`git reset --hard`
- 测试安全命令不被误判

**提交记录**：
- Red: `a25fe9a` - test: add failing tests for threat detector
- Green: `90290cb` - feat: implement threat detector

### T3.2：实现策略评估器

**目标**：实现规则引擎，评估动作是否符合策略

**涉及文件**：
- `src/guardrail/policy.ts`

**预期实现要点**：
- `PolicyEvaluator` 类评估策略规则
- 支持优先级排序
- 支持组合条件（AND/OR）
- 返回评估结果：allow / deny / require-confirmation

**验证步骤**：
- 编写单元测试：`tests/unit/guardrail/policy.test.ts`
- 测试策略规则匹配
- 测试优先级处理
- 测试组合条件

**提交记录**：
- Red: `fdec5cf` - test: add failing tests for policy evaluator
- Green: `3544257` - feat: implement policy evaluator

### T3.3：实现沙箱管理

**目标**：实现目录白名单、命令黑名单、网络控制

**涉及文件**：
- `src/guardrail/sandbox.ts`

**预期实现要点**：
- `Sandbox` 类管理操作边界
- 目录白名单：只允许访问指定目录
- 命令黑名单：禁止执行指定命令
- 网络控制：允许/禁止对外网络访问

**验证步骤**：
- 编写单元测试：`tests/unit/guardrail/sandbox.test.ts`
- 测试目录越界操作被拦截
- 测试黑名单命令被拦截
- 测试网络访问控制

**提交记录**：
- Red: `1054c22` - test: add failing tests for sandbox management
- Green: `d587f69` - feat: implement sandbox management

### T3.4：实现 HITL 状态机

**目标**：实现 Human-in-the-Loop 状态机

**涉及文件**：
- `src/guardrail/hitl.ts`

**预期实现要点**：
- `HITLStateMachine` 类管理确认流程
- 状态：Pending → RequireConfirmation → Approved/Rejected
- 支持超时处理（默认 30 秒）
- 支持交互式和非交互式模式

**验证步骤**：
- 编写单元测试：`tests/unit/guardrail/hitl.test.ts`
- 测试状态转换（确认/拒绝）
- 测试超时处理
- 测试非交互式模式

**提交记录**：
- Red: `3f928ab` - test: add failing tests for HITL state machine
- Green: `a6e0e8a` - feat: implement HITL state machine

### T3.5：实现护栏主入口

**目标**：整合所有护栏组件，提供统一的护栏接口

**涉及文件**：
- `src/guardrail/index.ts`

**预期实现要点**：
- `Guardrail` 类作为护栏主入口
- 执行流程：威胁检测 → 策略评估 → 沙箱检查 → HITL 决策
- 返回统一的护栏决策结果

**验证步骤**：
- 编写单元测试：`tests/unit/guardrail/index.test.ts`
- 测试完整护栏流程
- 测试危险动作被拦截
- 测试安全动作被允许

**提交记录**：
- Red: `d4c1086` - test: add failing tests for guardrail entry
- Green: `c2e8128` - feat: implement guardrail entry point
- Refactor: `e9571eb` - refactor: guardrail entry flow

---

## P4：反馈闭环

### T4.1：实现测试结果校验器

**目标**：实现测试输出解析器，提取反馈信号

**涉及文件**：
- `src/feedback/validator.ts`

**预期实现要点**：
- `TestValidator` 类解析测试框架输出
- 支持 Jest、Mocha 输出格式
- 提取失败用例、错误位置、错误类型
- 返回结构化 Feedback 对象

**验证步骤**：
- 编写单元测试：`tests/unit/feedback/validator.test.ts`
- 测试解析成功测试输出
- 测试解析失败测试输出
- 测试提取错误位置和类型

**提交记录**：
- Red: `cdfc59b` - test: add failing tests for feedback validator
- Green: `32cf552` - feat: implement feedback validator
- Refactor: `ea88531` - refactor: clarify feedback validator parsing flow

### T4.2：实现失败分类器

**目标**：实现失败类型分类器

**涉及文件**：
- `src/feedback/classifier.ts`

**预期实现要点**：
- `FailureClassifier` 类分类失败类型
- 支持：语法错误、逻辑错误、类型错误、性能问题、lint 错误
- 基于错误信息模式匹配
- 返回分类结果和修复建议

**验证步骤**：
- 编写单元测试：`tests/unit/feedback/classifier.test.ts`
- 测试不同类型错误的分类
- 测试修复建议生成

**提交记录**：
- Red: `95f24bf` - test: add failing tests for classifier
- Green: `ebe2cd1` - feat: implement classifier
- Refactor: `0b0bf69` - refactor: T4.2

### T4.3：实现反馈回灌逻辑

**目标**：实现反馈结果回灌到上下文的逻辑

**涉及文件**：
- `src/feedback/loop.ts`

**预期实现要点**：
- `FeedbackLoop` 类管理反馈回灌
- 将反馈结果追加到会话上下文
- 控制反馈信息量（避免上下文过长）
- 支持反馈优先级排序

**验证步骤**：
- 编写单元测试：`tests/unit/feedback/loop.test.ts`
- 测试反馈追加到上下文
- 测试反馈信息量控制

**提交记录**：
- Red: `20d2119` - test: add failing test for loop
- Green: `fe7d4e1` - feat: T4.3
- Refactor: `3634cef` - refactor: T4.3

---

## P5：记忆系统

### T5.1：实现记忆存储

**目标**：实现记忆持久化存储

**涉及文件**：
- `src/memory/store.ts`

**预期实现要点**：
- `MemoryStore` 类使用 SQLite 存储记忆
- 支持三种记忆类型：session、project、long-term
- 支持 CRUD 操作
- 支持过期清理

**验证步骤**：
- 编写单元测试：`tests/unit/memory/store.test.ts`
- 测试记忆存储、读取、更新、删除
- 测试过期清理

**提交记录**：
- Red: `0a00ee1` - test: add failing tests for store
- Green: `6e9cde1` - feat: implement store
- Refactor: `06e74d3` - refactor: T5.1

### T5.2：实现记忆检索

**目标**：实现记忆检索机制

**涉及文件**：
- `src/memory/retriever.ts`

**预期实现要点**：
- `MemoryRetriever` 类检索相关记忆
- 基于关键词匹配
- 支持相关性排序
- 支持检索结果数量限制

**验证步骤**：
- 编写单元测试：`tests/unit/memory/retriever.test.ts`
- 测试关键词检索
- 测试相关性排序

**提交记录**：
- Red: `7919bb8` - test: add failing tests for retriever
- Green: `042d8f4` - feat: implement memory retriever
- Refactor: `04677cd` - refactor: T5.2

---

## P6：配置管理

### T6.1：定义配置 Schema

**目标**：定义配置文件的 schema

**涉及文件**：
- `src/config/schema.ts`

**预期实现要点**：
- 使用 Zod 定义配置 schema
- 包含：LLM 配置、护栏配置、反馈配置、记忆配置
- 支持默认值

**验证步骤**：
- 编写单元测试：`tests/unit/config/schema.test.ts`
- 测试配置验证
- 测试默认值

**提交记录**：
- Red: `45cc6df` - test: add failing tests for schema
- Green: `4bd7592` - feat: implement schema
- Refactor: `e3314aa` - refactor: T6.1

### T6.2：实现配置加载器

**目标**：实现配置文件加载和合并

**涉及文件**：
- `src/config/loader.ts`

**预期实现要点**：
- `ConfigLoader` 类加载配置文件
- 支持 JSON/YAML 格式
- 合并默认配置与用户配置
- 支持环境变量覆盖

**验证步骤**：
- 编写单元测试：`tests/unit/config/loader.test.ts`
- 测试配置文件加载
- 测试配置合并
- 测试环境变量覆盖

**提交记录**：
- Red: `7a11e1b` - test: add failing tests for loader
- Green: `3b20271` - feat: implement loader
- Refactor: `483262e` - refactor: T6.2

---

## P7：凭据安全

### T7.1：实现加密工具

**目标**：实现 AES-256-GCM 加密工具

**涉及文件**：
- `src/security/encryption.ts`

**预期实现要点**：
- `Encryption` 类提供加密/解密功能
- 使用 AES-256-GCM 算法
- 使用 Argon2id 进行密钥派生
- 支持盐值生成和存储

**验证步骤**：
- 编写单元测试：`tests/unit/security/encryption.test.ts`
- 测试加密解密循环
- 测试密钥派生

**提交记录**：
- Red: `494feb0` - test: add failing tests for encryption
- Red: `89ebb1d` - tests: add Argon2id test for encryption
- Green: `bf45751` - feat: implement encryption utility with Argon2id
- Refactor: `b20ca5d` - refactor: T7.1

### T7.2：实现凭据安全存储

**目标**：实现凭据的安全存储和管理

**涉及文件**：
- `src/security/credential.ts`

**预期实现要点**：
- `CredentialManager` 类管理凭据
- 优先使用操作系统钥匙串
- 备用加密文件存储
- 支持录入、读取、更新、清除操作

**验证步骤**：
- 编写单元测试：`tests/unit/security/credential.test.ts`
- 测试凭据存储和读取
- 测试凭据更新和清除

**提交记录**：
- Red: `27462f6` - add failing tests for credential
- Green: `0bb970e` - feat: implement credential
- Refactor: `0b6fd81` - refactor: T7.2

---

## P8：Agent 主循环

### T8.1：实现上下文管理器

**目标**：实现上下文组织和管理

**涉及文件**：
- `src/agent/context.ts`

**预期实现要点**：
- `ContextManager` 类管理会话上下文
- 组装 LLM 输入（system + user + assistant + tools + feedback）
- 控制上下文长度（摘要和裁剪）
- 支持上下文持久化

**验证步骤**：
- 编写单元测试：`tests/unit/agent/context.test.ts`
- 测试上下文组装
- 测试上下文长度控制

### T8.2：实现停机条件判定

**目标**：实现主循环的停机条件判定

**涉及文件**：
- `src/agent/stopCondition.ts`

**预期实现要点**：
- `StopCondition` 类判定是否停止循环
- 支持多种停机条件：最大迭代次数、用户终止、任务完成、连续失败
- 可配置停机条件参数

**验证步骤**：
- 编写单元测试：`tests/unit/agent/stopCondition.test.ts`
- 测试各种停机条件

### T8.3：实现 Agent 主循环

**目标**：实现完整的 Agent 主循环

**涉及文件**：
- `src/agent/mainLoop.ts`

**预期实现要点**：
- `Agent` 类实现主循环：
  1. 组织上下文
  2. 调用 LLM
  3. 解析动作
  4. 护栏检查
  5. 工具执行
  6. 反馈回灌
  7. 停机判定
- 支持事件回调（用于日志和监控）

**验证步骤**：
- 编写集成测试：`tests/integration/agent/mainLoop.test.ts`
- 使用 Mock LLM 测试完整循环
- 测试多轮迭代

---

## P9：CLI 入口

### T9.1：实现 CLI 命令行接口

**目标**：实现 CLI 入口，支持交互式和命令模式

**涉及文件**：
- `src/cli/index.ts`
- `bin/agent`

**预期实现要点**：
- 使用 Commander 实现 CLI
- 支持命令：
  - `agent run`：启动 Agent 会话
  - `agent credential`：管理凭据
  - `agent config`：管理配置
  - `agent tools`：列出可用工具
- 支持交互式模式和命令模式

**验证步骤**：
- 运行 `npm run build` 编译
- 运行 `./bin/agent --help` 验证帮助信息
- 运行 `./bin/agent credential --help` 验证凭据命令

---

## P10：机制演示

### T10.1：演示治理护栏拦截危险动作

**目标**：确定性复现护栏拦截危险动作的行为

**涉及文件**：
- `scripts/demo-guardrail.ts`

**预期实现要点**：
- 使用 Mock LLM 预设危险动作（如 `rm -rf /`）
- 演示护栏识别并拦截危险动作
- 输出拦截日志和决策过程

**验证步骤**：
- 运行 `npx ts-node scripts/demo-guardrail.ts`
- 验证危险动作被正确拦截

### T10.2：演示反馈闭环

**目标**：确定性复现反馈闭环使 Agent 自我修正的行为

**涉及文件**：
- `scripts/demo-feedback.ts`

**预期实现要点**：
- 使用 Mock LLM 预设失败测试场景
- 演示测试失败 → 反馈解析 → Agent 收到反馈 → 修正动作
- 输出反馈流程和修正结果

**验证步骤**：
- 运行 `npx ts-node scripts/demo-feedback.ts`
- 验证反馈闭环正常工作

### T10.3：演示重点维度（治理护栏）

**目标**：演示治理护栏的高级功能

**涉及文件**：
- `scripts/demo-guardrail-advanced.ts`

**预期实现要点**：
- 演示策略评估：不同策略规则的组合效果
- 演示沙箱边界：目录越界和命令黑名单
- 演示 HITL 状态机：确认/拒绝流程

**验证步骤**：
- 运行 `npx ts-node scripts/demo-guardrail-advanced.ts`
- 验证治理护栏的高级功能

---

## P11：CI/CD 配置

### T11.1：配置 GitHub Actions CI

**目标**：配置 CI 流水线，自动运行测试

**涉及文件**：
- `.github/workflows/ci.yml`

**预期实现要点**：
- 定义 `unit-test` job
- 安装依赖、编译、运行测试
- 配置 Node.js 20 环境
- 设置测试覆盖报告

**验证步骤**：
- 推送代码到 GitHub
- 查看 CI 执行结果
- 确认 `unit-test` job 通过

---

## 依赖关系图

```
P0 ──→ P1 ──→ P8
 ──→ P2 ──→ P3 ──→ P8
 ──→ P4 ──→ P8
 ──→ P5 ──→ P8
 ──→ P6 ──→ P8
 ──→ P7 ──→ P1 ──→ P8
P8 ──→ P9
P3, P4 ──→ P10
所有 ──→ P11
```

## 可并行任务

| 并行组 | 任务 |
|--------|------|
| Group 1 | T1.1, T2.1, T3.1, T4.1, T5.1, T6.1, T7.1 |
| Group 2 | T1.2, T2.2, T3.2, T4.2, T5.2, T6.2, T7.2 |
| Group 3 | T1.3, T2.3, T3.3, T4.3 |
| Group 4 | T2.4, T3.4 |
| Group 5 | T2.5, T3.5 |

---

## 完成标准

每个 Task 的完成标准：
1. 代码实现完成
2. 单元测试通过（覆盖率 ≥ 80%）
3. 代码审查通过（无 critical issue）
4. 在 PLAN.md 中标记完成并附 commit hash
## Progress Update

- P1 LLM abstraction layer: completed.
  - T1.1 base LLM interface: completed in `src/llm/base.ts`.
  - T1.2 Mock LLM: completed in `src/llm/mock.ts`.
  - T1.3 OpenAI LLM: completed in `src/llm/openai.ts`.
  - Tests: completed in `tests/unit/llm/*.test.ts`.
  - Verification: `npm run typecheck` and `npm test` pass.
  - Commit hash: `5ab799e74b4e3cd1f4ba45bd8b4bd966be738944`.

- P4 feedback loop: completed.
  - T4.1 test result validator: completed in `src/feedback/validator.ts`.
  - T4.2 failure classifier: completed in `src/feedback/classifier.ts`.
  - T4.3 feedback loop: completed in `src/feedback/loop.ts`.
  - Tests: completed in `tests/unit/feedback/*.test.ts`.
  - Verification: `npm run typecheck` and `npm test` pass.
  - Commit hashes: `cdfc59b`, `32cf552`, `ea88531`, `95f24bf`, `ebe2cd1`, `0b0bf69`, `20d2119`, `fe7d4e1`, `3634cef`.

- P5 memory system: completed.
  - T5.1 memory store: completed in `src/memory/store.ts`.
  - T5.2 memory retriever: completed in `src/memory/retriever.ts`.
  - Tests: completed in `tests/unit/memory/*.test.ts`.
  - Verification: `npm run typecheck` and `npm test` pass.
  - Commit hashes: `0a00ee1`, `6e9cde1`, `06e74d3`, `7919bb8`, `042d8f4`, `04677cd`.

- P6 configuration management: completed.
  - T6.1 configuration schema: completed in `src/config/schema.ts`.
  - T6.2 configuration loader: completed in `src/config/loader.ts`.
  - Tests: completed in `tests/unit/config/*.test.ts`.
  - Verification: `npm run typecheck` and `npm test` pass.
  - Commit hashes: `45cc6df`, `4bd7592`, `e3314aa`, `7a11e1b`, `3b20271`, `483262e`.

- P7 credential security: completed.
  - T7.1 encryption utility: completed in `src/security/encryption.ts`.
  - T7.2 credential manager: completed in `src/security/credential.ts`.
  - Tests: completed in `tests/unit/security/*.test.ts`.
  - Verification: `npm run typecheck` and `npm test` pass.
  - Commit hashes: `494feb0`, `89ebb1d`, `bf45751`, `b20ca5d`, `27462f6`, `0bb970e`, `0b6fd81`.
