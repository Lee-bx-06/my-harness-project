# my-harness-project

## 项目简介
一个基于 TypeScript 的 coding agent harness，面向“让 agent 在受控环境里执行代码任务”的场景。项目把 agent 执行链路拆成几层：CLI 入口负责启动与操作，LLM 层负责生成动作，tools 层负责文件、shell、git 和测试相关操作，guardrail 层负责威胁检测、策略判断、沙箱限制和人工确认，feedback 与 memory 层负责错误反馈和上下文管理，security 层负责凭据和加密能力。

这个仓库更像一套可扩展的 agent 基础设施，而不是单一业务应用。它适合用来验证 coding agent 的工作流设计、工具权限边界、危险命令拦截、上下文裁剪、反馈重试和测试策略，也方便后续替换 LLM 提供方、扩展工具集，或者把现有能力接到更完整的交互界面上。

## 安装

```bash
npm install
```

构建：

```bash
npm run build
```

类型检查：

```bash
npm run typecheck
```

测试：

```bash
npm test
```

## 运行

项目入口是 CLI，编译后由 `bin/agent` 指向 `dist/src/cli/index.js`。

开发/本地运行流程：

```bash
npm run build
node dist/src/cli/index.js --help
node dist/src/cli/index.js run --instruction "查看当前仓库状态并总结"
```

可用命令：

```bash
node dist/src/cli/index.js tools
node dist/src/cli/index.js config show
node dist/src/cli/index.js credential get <name>
node dist/src/cli/index.js credential set <name> <value>
node dist/src/cli/index.js credential clear <name>
```

说明：`run` 在不传 `--instruction` 时会提示交互模式尚未实现。

## 目录结构

```text
src/
  agent/        agent 主循环、上下文、停止条件
  cli/          命令行入口与命令定义
  config/       配置 schema 与加载器
  feedback/     反馈分类、校验与循环
  guardrail/    威胁检测、策略、沙箱、HITL
  llm/          LLM 抽象、OpenAI 实现、mock
  memory/       记忆存储与检索
  security/     凭据与加密
  tools/        shell / file / git / test 等工具
tests/          单元与集成测试
scripts/        测试运行、guardrail demo 脚本
bin/agent       CLI 启动器
dist/           TypeScript 编译产物
```

## 安全边界

这个项目的安全边界主要由 guardrail 和工具实现共同约束：

1. `file.*` 工具只允许访问配置的根目录内路径，越界路径会被拒绝。
2. `shell.exec` 会通过沙箱和威胁检测；默认对高风险命令给出确认要求或直接阻止。
3. `git.commit` 会先检查本地 `user.name` 和 `user.email`，避免在未配置身份的仓库里直接提交。
4. `Sandbox` 支持限制允许目录、阻止命令、关闭网络访问。
5. `ThreatDetector` 默认会标记 `rm`、`rm -rf`、`git push --force`、`git reset --hard` 这类危险动作。
6. `HITLStateMachine` 支持交互式确认；非交互模式下会拒绝需要人工确认的动作。

当前实现里，CLI 的 `credential` 和 `config` 子命令主要是命令壳，便于后续接入真实存储与配置编辑。

## key 配置

LLM 配置位于 `llm` 段，核心字段如下：

```yaml
llm:
  provider: openai
  model: gpt-4.1-mini
  apiKeyEnv: OPENAI_API_KEY
  maxTokens: 4096
  temperature: 0.2
```

环境变量覆盖项：

```text
AGENT_LLM_PROVIDER
AGENT_LLM_MODEL
AGENT_LLM_API_KEY_ENV
AGENT_LLM_MAX_TOKENS
AGENT_LLM_TEMPERATURE
AGENT_GUARDRAIL_ENABLED
AGENT_GUARDRAIL_ALLOW_NETWORK
AGENT_FEEDBACK_ENABLED
AGENT_FEEDBACK_MAX_RETRIES
AGENT_MEMORY_ENABLED
AGENT_MEMORY_MAX_HISTORY
```

补充说明：

1. `llm.apiKeyEnv` 是配置项，默认测试配置使用 `OPENAI_API_KEY`。
2. 当前 `OpenAILLM` 在未显式传入 `apiKey` 时，会读取进程环境变量 `OPENAI_API_KEY`。
3. 如果你要在 shell 里设置 key，可以直接导出对应环境变量，或自行加载 `.env`。

## 分发说明

推荐的分发方式是先编译再发布编译产物：

```bash
npm run build
```

编译后可分发的内容主要是：

1. `dist/` 下的 JS 和 `.d.ts` 产物。
2. `bin/agent` 作为 CLI 启动入口。
3. `package.json`、`package-lock.json` 以及运行时需要的配置文件。

如果要打包成 npm 包，发布前应确保 `dist/` 已生成，并且消费方安装依赖后可以直接运行 `bin/agent`。

## 配置示例

```yaml
llm:
  provider: openai
  model: gpt-4.1-mini
  apiKeyEnv: OPENAI_API_KEY
  maxTokens: 4096
  temperature: 0.2

guardrail:
  enabled: true
  requireConfirmation:
    - shell.exec
    - git.push
  allowedDirectories:
    - .
  blockedCommands:
    - rm -rf /
    - git push --force
  allowNetwork: false

feedback:
  enabled: true
  maxRetries: 3

memory:
  enabled: true
  maxHistory: 50
```
