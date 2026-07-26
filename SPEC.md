# SPEC.md：Coding Agent Harness 设计文档

> 项目类型：A · Coding Agent Harness（首选）
> 完整要求 = 本文件 + 《AI4SE 期末项目 · 通用要求》

---

## 1. 问题陈述

### 1.1 要解决的问题

当前的 AI 编码助手（如 GitHub Copilot、Cursor Agent）虽然能生成代码，但存在以下问题：

- **缺乏安全护栏**：Agent 可能执行危险操作（如 `rm -rf /`、删除数据库），没有机制拦截
- **缺乏客观反馈**：Agent 无法自动验证生成代码的正确性，依赖人工检查
- **上下文管理混乱**：跨会话记忆缺失，每次会话都从头开始
- **不可预测性**：相同提示可能产生不同结果，难以用于自动化场景

本项目旨在构建一个 **Coding Agent Harness**，将 LLM 封装成一个稳定、安全、可验证的自动化编码系统。

### 1.2 目标用户

- **独立开发者**：需要自动化完成重复性编码任务的开发者
- **开发团队**：需要标准化代码审查和测试流程的团队
- **DevOps 工程师**：需要自动化配置基础设施和 CI/CD 流程的工程师
- **教育场景**：需要自动批改编程作业的教学场景

### 1.3 为什么值得做

- **安全保障**：通过治理护栏防止危险操作
- **可验证性**：通过客观反馈信号验证代码正确性
- **效率提升**：自动化完成编码-测试-修正循环
- **可扩展性**：支持多种工具和 LLM 提供商的插件化架构

---

## 2. 用户故事

遵循 INVEST 原则，以下为 6 个核心用户故事：

### US-001：作为开发者，我希望 Agent 能读写代码文件，以便自动化完成编码任务

- **场景**：用户指定一个文件路径和修改内容，Agent 自动读取文件、应用修改、保存结果
- **验收标准**：文件读取成功、修改正确应用、文件保存成功

### US-002：作为开发者，我希望 Agent 在执行危险命令前暂停并请求人工确认，以便防止误操作

- **场景**：Agent 尝试执行 `rm -rf /` 或 `git push --force` 等危险命令
- **验收标准**：命令被拦截、显示警告信息、等待用户确认后才执行

### US-003：作为开发者，我希望 Agent 能运行测试并根据失败结果自我修正，以便确保代码质量

- **场景**：Agent 生成代码后自动运行测试，测试失败后分析错误并重新生成
- **验收标准**：测试执行成功、失败信息正确解析、Agent 收到反馈后尝试修正

### US-004：作为开发者，我希望 Agent 能记住跨会话的决策，以便保持上下文一致性

- **场景**：用户在会话 A 中定义了项目约定，会话 B 中 Agent 仍能遵守
- **验收标准**：历史决策被存储、需要时被检索、Agent 行为符合历史约定

### US-005：作为开发者，我希望能通过配置文件约束 Agent 的行为，以便定制化使用

- **场景**：用户通过 JSON/YAML 配置文件定义 Agent 的权限边界和工具列表
- **验收标准**：配置文件被正确解析、Agent 行为受配置约束

### US-006：作为团队负责人，我希望能查看 Agent 的操作日志，以便审计和追踪

- **场景**：用户查看 Agent 的操作历史、决策过程和执行结果
- **验收标准**：日志完整记录、支持按时间/类型筛选、可导出

---

## 3. 功能规约

### 3.1 模块结构

```
src/
├── agent/              # Agent 主循环
│   ├── mainLoop.ts     # 主循环：上下文 → 调用 LLM → 解析动作 → 执行 → 回灌
│   ├── context.ts      # 上下文管理
│   └── stopCondition.ts # 停机条件判定
├── llm/                # LLM 抽象层
│   ├── base.ts         # LLM 接口定义
│   ├── openai.ts       # OpenAI 实现
│   └── mock.ts         # Mock LLM 实现（用于测试）
├── tools/              # 工具分发
│   ├── registry.ts     # 工具注册中心
│   ├── file.ts         # 文件读写工具
│   ├── shell.ts        # Shell 命令执行工具
│   ├── test.ts         # 测试运行工具
│   └── git.ts          # Git 操作工具
├── guardrail/          # 治理护栏（重点模块）
│   ├── index.ts        # 护栏主入口
│   ├── threatDetector.ts # 危险动作识别
│   ├── sandbox.ts      # 沙箱边界管理
│   ├── hitl.ts         # HITL（Human-in-the-Loop）状态机
│   └── policy.ts       # 策略配置与评估
├── feedback/           # 反馈闭环
│   ├── validator.ts    # 校验器：解析测试/lint结果
│   ├── classifier.ts   # 失败分类器
│   └── loop.ts         # 反馈回灌逻辑
├── memory/             # 上下文与记忆
│   ├── store.ts        # 记忆存储
│   ├── retriever.ts    # 记忆检索
│   └── vector.ts       # 向量索引（可选）
├── config/             # 配置管理
│   ├── loader.ts       # 配置加载
│   └── schema.ts       # 配置 schema
└── security/           # 安全与凭据
    ├── credential.ts   # 凭据安全存储
    └── encryption.ts   # 加密工具
```

### 3.2 功能详细规约

#### 3.2.1 Agent 主循环

**输入**：用户指令、会话历史、可用工具列表、配置策略

**行为**：

1. 组织上下文：将用户指令、历史记录、工具描述、配置策略组装成 LLM 输入
2. 调用 LLM：通过 LLM 抽象层获取 Agent 的下一步动作
3. 解析动作：解析 LLM 返回的 JSON 动作格式
4. 分发执行：将动作路由到对应工具执行
5. 回灌结果：将执行结果追加到上下文
6. 停机判断：根据停机条件决定继续循环或退出

**输出**：最终执行结果或错误信息

**边界条件**：

- 最大迭代次数限制（防止无限循环）
- 上下文长度限制（防止超出 LLM token 限制）
- 执行超时限制

**错误处理**：

- LLM 调用失败：重试机制（最多 3 次）
- 动作解析失败：记录错误并请求用户澄清
- 工具执行失败：将错误信息回灌给 LLM

#### 3.2.2 LLM 抽象层

**输入**：消息列表（system + user + assistant）、模型参数

**行为**：

- 定义统一的 `LLMInterface` 接口
- 实现 OpenAI API 适配器
- 实现 Mock LLM（返回预设响应，用于测试）

**输出**：LLM 响应内容

**边界条件**：

- API 调用超时处理
- 速率限制处理
- 凭据无效处理

#### 3.2.3 工具分发

**输入**：动作类型、动作参数

**行为**：

- 工具注册：通过装饰器或配置注册工具
- 工具查找：根据动作类型查找对应的工具实现
- 参数校验：验证参数类型和范围
- 执行分发：调用工具执行方法

**输出**：工具执行结果

**工具列表**：

| 工具 | 功能 | 参数 | 返回值 |
|------|------|------|--------|
| `file.read` | 读取文件 | `path: string` | 文件内容 |
| `file.write` | 写入文件 | `path: string, content: string` | 写入状态 |
| `file.append` | 追加内容 | `path: string, content: string` | 追加状态 |
| `shell.exec` | 执行 shell 命令 | `command: string, cwd?: string` | 命令输出 |
| `test.run` | 运行测试 | `command: string, cwd?: string` | 测试结果 |
| `git.status` | 查看 git 状态 | `cwd?: string` | 状态信息 |
| `git.commit` | 提交代码 | `message: string, cwd?: string` | 提交结果 |

#### 3.2.4 治理护栏（重点模块）

**输入**：动作对象、当前会话上下文

**行为**：

1. **危险动作识别**：`threatDetector` 分析动作是否属于危险操作
2. **策略评估**：`policy` 根据配置策略评估是否允许执行
3. **沙箱检查**：`sandbox` 检查操作是否在允许的边界内
4. **HITL 决策**：`hitl` 状态机决定是否需要人工确认

**输出**：允许执行 / 拦截并请求确认 / 拒绝执行

**危险动作分类**：

| 类别 | 示例 | 处理方式 |
|------|------|----------|
| **破坏性命令** | `rm -rf /`, `format C:` | 必须人工确认 |
| **网络访问** | `curl`, `wget`, 对外 API 调用 | 根据配置决定 |
| **文件系统** | 写入非项目目录、删除文件 | 根据配置决定 |
| **Git 操作** | `git push --force`, `git reset --hard` | 必须人工确认 |
| **系统配置** | 修改环境变量、安装系统包 | 根据配置决定 |

**HITL 状态机**：

```
Pending → [危险动作] → RequireConfirmation → [用户确认] → Approved → Execute
                                               ↓ [用户拒绝]
                                          Rejected → Skip
         ↓ [安全动作]
    Approved → Execute
```

**沙箱边界**：

- 允许访问的目录列表（白名单）
- 禁止执行的命令列表（黑名单）
- 网络访问控制（允许/禁止对外访问）

#### 3.2.5 反馈闭环

**输入**：工具执行结果（尤其是测试结果）

**行为**：

1. **结果解析**：`validator` 解析测试输出、lint 输出、类型检查输出
2. **失败分类**：`classifier` 将失败分为语法错误、逻辑错误、类型错误、性能问题等
3. **反馈回灌**：`loop` 将结构化反馈追加到上下文，供 LLM 参考

**输出**：结构化反馈对象

**反馈信号格式**：

```typescript
interface Feedback {
  type: 'success' | 'failure';
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  location?: { file: string; line: number };
  suggestion?: string;
}
```

#### 3.2.6 上下文与记忆

**输入**：当前上下文、检索查询

**行为**：

1. **存储**：`store` 将会话历史、决策、项目知识存储到持久化层
2. **检索**：`retriever` 根据当前上下文检索相关记忆
3. **摘要**：对长上下文进行摘要，控制 token 使用

**输出**：相关记忆片段

**记忆类型**：

| 类型 | 存储内容 | 检索方式 |
|------|----------|----------|
| **会话记忆** | 本次会话的所有交互 | 全量载入（最近 N 轮） |
| **项目记忆** | 项目约定、架构决策、代码库知识 | 关键词检索 |
| **长期记忆** | 用户偏好、历史经验 | 向量检索（可选） |

#### 3.2.7 配置管理

**输入**：配置文件路径

**行为**：

1. 加载配置文件（JSON/YAML）
2. 验证配置 schema
3. 合并默认配置与用户配置
4. 提供配置访问接口

**输出**：配置对象

**配置结构**：

```typescript
interface Config {
  llm: {
    provider: string;
    model: string;
    apiKeyEnv: string;
    maxTokens: number;
    temperature: number;
  };
  guardrail: {
    enabled: boolean;
    requireConfirmation: string[]; // 需要确认的动作类型
    allowedDirectories: string[]; // 允许访问的目录
    blockedCommands: string[]; // 禁止的命令
    allowNetwork: boolean;
  };
  feedback: {
    enabled: boolean;
    maxRetries: number;
  };
  memory: {
    enabled: boolean;
    maxHistory: number;
  };
}
```

#### 3.2.8 凭据安全存储

**输入**：凭据 key、凭据 value

**行为**：

1. 凭据录入：引导用户安全录入（隐藏输入）
2. 凭据存储：存储到操作系统钥匙串或加密文件
3. 凭据读取：从安全存储中读取（不回显明文）
4. 凭据管理：支持更新、清除操作

**输出**：凭据操作结果

---

## 4. 非功能性需求

### 4.1 性能

- 主循环单次迭代响应时间 < 10 秒（不含 LLM 调用时间）
- 工具执行超时时间可配置（默认 30 秒）
- 上下文检索时间 < 500ms

### 4.2 安全

**凭据威胁模型**：

| 威胁 | 风险等级 | 对策 |
|------|----------|------|
| 凭据硬编码到源码 | 高 | 禁止硬编码，使用环境变量或钥匙串 |
| 凭据提交到 Git | 高 | `.gitignore` 排除 `.env`，pre-commit hook 检查 |
| 凭据写入日志 | 中 | 日志脱敏，禁止输出凭据内容 |
| 进程环境变量泄露 | 中 | 使用加密存储替代纯环境变量 |
| 密钥管理服务攻击 | 低 | 使用操作系统原生钥匙串 |

**安全要求**：

- 所有危险操作必须经过护栏检查
- 凭据存储必须加密
- 操作日志必须完整记录（用于审计）

### 4.3 可用性

- CLI 界面清晰，提供帮助信息
- 错误信息友好，包含解决方案提示
- 支持交互式和非交互式两种模式

### 4.4 可观测性

- 完整的操作日志（时间戳、动作类型、参数、结果）
- 支持日志级别配置（debug/info/warn/error）
- 支持将日志导出为 JSON 格式

---

## 5. 系统架构

### 5.1 组件图

```
┌─────────────────────────────────────────────────────────────┐
│                       用户接口 (CLI)                        │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Agent 主循环 (mainLoop)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 上下文    │→│ 调用 LLM  │→│ 解析动作  │→│ 分发执行  │    │
│  │ 管理     │  │          │  │          │  │          │    │
│  └──────────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│                     │             │             │          │
│                     ▼             │             ▼          │
│              ┌──────────┐         │      ┌──────────┐      │
│              │ LLM 抽象层│◄────────┼──────│ 工具分发  │      │
│              │ (mock/API)│         │      └────┬─────┘      │
│              └──────────┘         │             │          │
│                                   ▼             │          │
│                              ┌──────────┐       │          │
│                              │ 治理护栏  │◄──────┘          │
│                              │  (拦截/   │                 │
│                              │   放行)   │                 │
│                              └────┬─────┘                 │
│                                   │                        │
│                                   ▼                        │
│                              ┌──────────┐                 │
│                              │ 反馈闭环  │─────────────────┘
│                              │  (验证/   │
│                              │   回灌)   │
│                              └──────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ 记忆存储  │   │ 配置管理  │   │ 凭据安全  │
        │          │   │          │   │ 存储     │
        └──────────┘   └──────────┘   └──────────┘
```

### 5.2 数据流

1. **输入阶段**：用户指令 → 上下文管理器 → LLM 输入
2. **决策阶段**：LLM 输入 → LLM 抽象层 → 动作指令
3. **执行阶段**：动作指令 → 治理护栏 → 工具分发 → 工具执行
4. **反馈阶段**：执行结果 → 反馈闭环 → 上下文管理器
5. **循环/停机**：新上下文 → 停机条件判断 → 继续或退出

### 5.3 外部依赖

| 依赖 | 用途 | 版本 |
|------|------|------|
| OpenAI API | LLM 调用 | v1 |
| Node.js | 运行时 | ≥ 20.0.0 |
| TypeScript | 类型安全 | ≥ 5.0.0 |
| sqlite3 | 记忆存储 | ≥ 5.0.0 |
| keyring | 凭据安全存储 | ≥ 3.0.0 |
| zod | 配置验证 | ≥ 3.0.0 |

---

## 6. 数据模型

### 6.1 核心实体

#### 6.1.1 Action（动作）

```typescript
interface Action {
  id: string;           // 动作唯一标识
  type: string;         // 动作类型（如 file.read, shell.exec）
  parameters: Record<string, unknown>; // 动作参数
  timestamp: Date;      // 创建时间
  status: 'pending' | 'approved' | 'rejected' | 'executed'; // 状态
  result?: ActionResult; // 执行结果
}
```

#### 6.1.2 ActionResult（动作结果）

```typescript
interface ActionResult {
  success: boolean;     // 是否成功
  output?: string;      // 标准输出
  error?: string;       // 错误信息
  feedback?: Feedback;  // 反馈信号
  executionTime: number; // 执行时间（毫秒）
}
```

#### 6.1.3 Feedback（反馈）

```typescript
interface Feedback {
  id: string;
  actionId: string;
  type: 'success' | 'failure';
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  location?: {
    file: string;
    line: number;
    column?: number;
  };
  suggestion?: string;
  timestamp: Date;
}
```

#### 6.1.4 Memory（记忆）

```typescript
interface Memory {
  id: string;
  type: 'session' | 'project' | 'long-term';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  relevance?: number; // 相关性分数（用于检索）
}
```

#### 6.1.5 Policy（策略）

```typescript
interface Policy {
  id: string;
  name: string;
  rules: PolicyRule[];
  createdAt: Date;
  updatedAt: Date;
}

interface PolicyRule {
  id: string;
  actionType?: string;      // 动作类型过滤
  commandPattern?: string;  // 命令正则匹配
  filePattern?: string;     // 文件路径正则匹配
  effect: 'allow' | 'deny' | 'require-confirmation';
  priority: number;         // 优先级（数字越大优先级越高）
}
```

### 6.2 关系图

```
Action ───1:N───→ ActionResult
ActionResult ───1:1───→ Feedback
Memory ───N:1───→ MemoryType
Policy ───1:N───→ PolicyRule
Action ───N:1───→ PolicyRule (通过规则匹配)
```

---

## 7. 凭据与分发设计

### 7.1 凭据安全存储

**方案**：操作系统钥匙串 + 加密文件备份

**流程**：

1. **首次运行**：
   - 检测是否存在有效凭据
   - 如不存在，引导用户录入 API Key（隐藏输入）
   - 加密后存储到操作系统钥匙串
   - 同时生成加密备份文件（带主密码）

2. **后续运行**：
   - 优先从钥匙串读取
   - 钥匙串不可用时从加密文件读取

3. **凭据管理**：
   - `agent credential show`：显示凭据状态（不回显明文）
   - `agent credential update`：更新凭据
   - `agent credential clear`：清除凭据

**加密方案**：

- 使用 AES-256-GCM 加密凭据内容
- 主密码使用 Argon2id 进行密钥派生
- 加密文件存储路径：`~/.agent-harness/credentials.enc`

### 7.2 分发设计

**分发形态**：容器镜像（Docker）+ 原生二进制

**容器分发**：

- `Dockerfile`：基于 Node.js 20 镜像构建
- 构建命令：`docker build -t agent-harness .`
- 运行命令：`docker run -it --rm -v $(pwd):/workspace agent-harness`
- Key 配置：通过环境变量或密钥管理服务注入

**二进制分发**：

- 使用 `pkg` 或 `nexe` 将 TypeScript 编译为单文件可执行
- 支持平台：Linux x64、macOS x64/arm64、Windows x64
- Key 配置：首次运行引导录入，存储到操作系统钥匙串

**README 要求**：

- 获取方式：Docker Hub 地址 / GitHub Releases 下载链接
- 运行命令：详细的使用说明
- Key 安全配置：如何在目标机器上安全配置凭据
- 已知限制：平台兼容性、依赖前提

---

## 8. 技术选型与理由

### 8.1 编程语言：TypeScript

**理由**：

- **类型安全**：减少运行时错误，提高代码可靠性
- **Node.js 生态**：丰富的库支持（文件系统、进程管理、加密等）
- **LLM 库支持**：OpenAI 官方 SDK 提供 TypeScript 支持
- **CLI 工具开发**：成熟的 CLI 框架（如 Commander、Oclif）
- **跨平台**：可编译为原生二进制或容器化部署

### 8.2 LLM 提供商：OpenAI

**理由**：

- **API 稳定性**：成熟的 API 设计，文档完善
- **模型能力**：GPT-4/GPT-4o 编码能力强
- **SDK 支持**：官方 TypeScript SDK，易于集成
- **生态成熟**：社区活跃，问题解决资源丰富

### 8.3 重点维度：治理护栏

**选择理由**：

- **机制密集**：护栏需要复杂的状态机、策略评估、沙箱管理
- **工程深度**：能体现工程师在 AI 协作中的价值
- **可测试性**：移除 LLM 后仍能用确定性测试验证
- **安全价值**：直接关系到系统的可靠性和安全性

---

## 9. 验收标准

### 9.1 功能验收

| 功能 | 验收标准 | 验证方法 |
|------|----------|----------|
| Agent 主循环 | 能完成完整的决策-执行-反馈循环 | 运行集成测试，验证多轮迭代 |
| LLM 抽象层 | 支持真实 OpenAI 和 Mock LLM | 切换 Mock/真实 LLM 运行测试 |
| 工具分发 | 能正确路由和执行所有工具 | 逐个工具编写单元测试 |
| 治理护栏 | 能识别并拦截危险动作 | Mock LLM 下验证拦截逻辑 |
| 反馈闭环 | 能解析测试结果并回灌给 Agent | 注入失败测试，验证反馈流程 |
| 记忆系统 | 能存储和检索跨会话记忆 | 多会话测试，验证记忆连续性 |
| 配置管理 | 能正确加载和应用配置 | 修改配置文件，验证行为变化 |
| 凭据安全 | 能安全存储和读取凭据 | 验证凭据不硬编码、不写入日志 |

### 9.2 性能验收

- 主循环单次迭代响应时间 < 10 秒（不含 LLM 调用）
- 工具执行超时时间符合配置
- 上下文检索时间 < 500ms

### 9.3 安全验收

- 危险命令被正确拦截
- 凭据不在源码中、不在 Git 历史中、不在日志中
- 操作日志完整记录所有动作

---

## 10. 风险与未决问题

### 10.1 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM API 调用失败 | Agent 无法决策 | 实现重试机制，降级到 Mock LLM |
| 上下文过长 | LLM 响应质量下降 | 实现上下文摘要和裁剪 |
| 危险动作误判 | 误拦截合法操作或漏拦截危险操作 | 精细的策略配置和测试覆盖 |
| 凭据泄露 | 安全漏洞 | 严格的凭据管理流程和加密存储 |
| 工具执行超时 | 主循环卡住 | 设置超时时间，超时后中断并记录 |

### 10.2 未决问题

1. **向量检索实现**：是否使用向量数据库（如 Pinecone、Weaviate）还是本地向量索引？
2. **多 Agent 编排**：是否支持多个 Agent 协作完成复杂任务？
3. **模型选择**：是否支持动态切换不同的 LLM 模型？
4. **UI 界面**：是否需要提供 Web UI 还是仅 CLI 即可？

---

## 11. 领域与机制设计（项目 A 额外要求）

### 11.1 Coding 领域的机制设计

#### 11.1.1 动作/工具

Coding 场景下的核心工具：

| 工具 | 用途 | 实现要点 |
|------|------|----------|
| `file.read` | 读取代码文件 | 支持大文件分块读取 |
| `file.write` | 写入代码文件 | 支持原子写入，防止文件损坏 |
| `file.append` | 追加代码 | 支持在特定位置插入 |
| `shell.exec` | 执行构建/测试命令 | 支持超时控制和输出捕获 |
| `test.run` | 运行测试 | 解析测试框架输出（Jest、Mocha、pytest） |
| `git.*` | Git 操作 | 封装 git 命令，支持分支管理 |

#### 11.1.2 客观反馈信号

Coding 场景下的反馈信号来源：

| 反馈来源 | 信号类型 | 解析方法 |
|----------|----------|----------|
| 测试执行 | `success` / `failure` | 解析测试框架输出，提取失败用例 |
| Lint 检查 | `lint` | 解析 ESLint、Prettier 输出 |
| 类型检查 | `type` | 解析 TypeScript 编译器输出 |
| 构建结果 | `syntax` | 解析编译器/构建工具错误信息 |

**反馈信号必须是代码实现的校验器，而非提示词**：

```typescript
// 正确：代码实现的校验器
function parseTestOutput(output: string): Feedback[] {
  // 解析 Jest 输出格式
  // 提取失败信息、位置、错误类型
  // 返回结构化的 Feedback 对象
}

// 错误：提示词方式
// "请检查测试是否通过，并告诉我们结果"
```

#### 11.1.3 危险动作

Coding 场景下的危险动作：

| 类别 | 示例 | 处理策略 |
|------|------|----------|
| **破坏性命令** | `rm -rf *`, `git clean -fd` | 必须人工确认 |
| **强制推送** | `git push --force` | 必须人工确认 |
| **强制重置** | `git reset --hard` | 必须人工确认 |
| **系统修改** | `npm install -g`, `sudo` | 根据配置决定 |
| **网络访问** | `curl`, `npm publish` | 根据配置决定 |
| **文件删除** | 删除项目文件 | 根据配置决定（如删除非代码文件需确认） |

**危险动作识别必须是代码实现的护栏，而非提示词**：

```typescript
// 正确：代码实现的护栏
function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /^rm\s+-rf\s+/,
    /^git\s+push\s+--force/,
    /^git\s+reset\s+--hard/,
  ];
  return dangerousPatterns.some(pattern => pattern.test(command));
}

// 错误：提示词方式
// "请不要执行危险的命令，如 rm -rf"
```

#### 11.1.4 记忆需求

Coding 场景下的记忆类型：

| 记忆类型 | 存储内容 | 使用场景 |
|----------|----------|----------|
| **会话记忆** | 本次会话的所有交互 | 保持上下文连贯 |
| **项目约定** | 代码风格、架构决策、命名规范 | 确保代码一致性 |
| **代码库知识** | 代码结构、API 定义、模块关系 | 辅助代码理解和修改 |
| **历史决策** | 过去的解决方案、修复记录 | 避免重复劳动 |

**记忆存储与检索必须自己实现**：

```typescript
// 正确：自己实现的记忆系统
class MemoryStore {
  private db: SQLiteDatabase;
  
  async save(memory: Memory): Promise<void> {
    // 将记忆存储到 SQLite 数据库
  }
  
  async retrieve(query: string, limit: number): Promise<Memory[]> {
    // 根据查询检索相关记忆
  }
}

// 错误：直接使用框架自带的 memory
// const memory = new LangChainMemory();
```

### 11.2 重点维度选择：治理护栏

**选择理由**：

1. **机制密集**：治理护栏涉及危险动作识别、策略评估、沙箱管理、HITL 状态机等多个子机制，每个都需要代码实现
2. **工程深度**：能体现工程师在 AI 协作中的核心价值——构建可靠的安全边界
3. **可测试性**：所有护栏逻辑都可以用 Mock LLM 进行确定性测试
4. **安全价值**：直接关系到系统的可靠性和安全性，是生产环境中不可或缺的部分

**深入实现计划**：

| 子机制 | 实现要点 | 测试方法 |
|--------|----------|----------|
| **危险动作识别** | 基于正则表达式和语义分析的威胁检测器 | Mock 输入危险命令，断言被识别 |
| **策略评估** | 规则引擎，支持优先级和组合条件 | 配置不同策略，验证评估结果 |
| **沙箱管理** | 目录白名单、命令黑名单、网络控制 | 测试越界操作被拦截 |
| **HITL 状态机** | 确认/拒绝状态流转、超时处理 | Mock 用户输入，验证状态转换 |
| **审计日志** | 完整记录所有动作和决策过程 | 验证日志完整性和准确性 |

---

## 附录：动作 JSON 格式

LLM 返回的动作必须遵循以下 JSON 格式：

```json
{
  "action": {
    "type": "tool_name",
    "parameters": {
      "param1": "value1",
      "param2": "value2"
    },
    "thought": "为什么执行这个动作的思考过程"
  },
  "finish": false,
  "message": ""
}
```

**字段说明**：

- `action.type`：工具名称（如 `file.read`）
- `action.parameters`：工具参数（键值对）
- `action.thought`：Agent 的思考过程（用于调试和理解）
- `finish`：是否结束任务（true 表示完成）
- `message`：完成任务时的总结消息