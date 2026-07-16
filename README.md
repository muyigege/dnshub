# Universal DNS Hub

> 🌐 多云域名管理系统 — 统一管理 11 家 DNS 服务商，提供 Web UI、REST API、AI 智能调度、MCP Server 四类入口

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8)
![Database](https://img.shields.io/badge/Database-SQLite-yellow)
![MCP](https://img.shields.io/badge/MCP-1.29-purple)

## ✨ 功能特性

### 🏢 多服务商集成（11 家）

| 服务商 | 类型标识 | 代理状态 | 备注 |
|--------|---------|---------|------|
| Cloudflare | `cloudflare` | ✅ 橙云/灰云 | 支持 proxied 切换 |
| 阿里云 DNS | `aliyun` | ❌ | AccessKey 认证 |
| 腾讯云 DNSPod | `tencent` | ❌ | SecretKey 认证 |
| DigitalOcean | `digitalocean` | ❌ | API Token |
| GoDaddy | `godaddy` | ❌ | Key/Secret |
| Porkbun | `porkbun` | ❌ | API Key + Secret |
| NameSilo | `namesilo` | ❌ | API Key |
| Hetzner | `hetzner` | ❌ | API Token |
| AWS Route53 | `route53` | ❌ | IAM AccessKey |
| Google Cloud DNS | `google` | ❌ | Service Account |
| 华为云 DNS | `huawei` | ❌ | AccessKey |

### 📝 DNS 记录管理
- 支持记录类型：A、AAAA、CNAME、TXT、MX、NS、SRV、SOA、CAA
- 完整 CRUD + 批量变更（create/update/delete 混合）
- 根记录名称归一化（`@` / 空串 / FQDN 自动互转）
- Cloudflare 代理状态切换（仅 A/AAAA/CNAME 且服务商支持）
- 乐观锁并发保护（version 字段 + expectedVersion 关闭 TOCTOU）

### 🤖 AI 智能调度中心
- 自然语言指令解析（添加/删除/更新/查询）
- 操作预览与二次确认机制
- 支持自定义 OpenAI 兼容格式 API（可配置多个）

### 🔌 MCP Server
- 通过 Model Context Protocol 暴露 DNS 管理能力给 AI 客户端
- stdio 传输模式
- 写操作默认 `dryRun=true`，必须 `confirm=true` 才执行
- 支持 `idempotencyKey` 幂等
- 所有调用写入审计日志（source=mcp）

### 📜 审计日志与回退
- 所有写操作自动记录 before/after 快照（脱敏）
- 分页查询 + 多维筛选（action/status/source/provider/domain/batch/时间）
- 补偿式回退：CREATE→DELETE、UPDATE→恢复旧值、DELETE→重建
- 逆序回退批量操作，并发冲突检测
- 回退预览 + 二次确认 + force 强制选项

### 🔐 安全
- AES-256-GCM 加密存储凭证
- 审计日志脱敏（不记录 API Key/Secret）
- Provider 调用超时（30s）+ 重试（3 次指数退避，仅限流/超时/网络错误）

## 🚀 快速开始

### 环境要求
- Node.js 20+
- pnpm 9+

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd universal-dns-hub
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env，设置 ENCRYPTION_KEY（必须为 64 位十六进制）
   ```

4. **生成加密密钥**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   将输出填入 `.env` 的 `ENCRYPTION_KEY`。

5. **启动开发服务器**
   ```bash
   pnpm dev
   ```
   应用在 http://localhost:5000 启动。数据库文件自动创建于 `data/local.sqlite`，schema 自动迁移（幂等）。

## 📖 使用文档

### 添加服务商
1. 进入「服务商管理」页面
2. 点击「添加服务商」
3. 选择类型（11 家可选），填写凭证（保存前加密）
4. 点击「测试连接」验证
5. 保存后可同步域名列表

### 管理 DNS 记录
1. 在「域名管理」选择域名进入详情
2. 手动增删改查，或点击「同步」从远端拉取
3. Cloudflare 记录可切换橙云/灰云代理状态
4. 危险操作（删除）需二次确认

### AI 智能调度
1. 进入「AI 智能调度中心」
2. 输入自然语言指令，例如：
   - "在 example.com 添加 A 记录指向 1.2.3.4"
   - "把 www.example.com 的记录改成 8.8.8.8"
   - "删除 api.example.com 的 TXT 记录"
3. AI 解析后展示操作预览，确认后执行

### 查看审计日志与回退
1. 进入「操作日志」页面
2. 按 action/status/source 筛选，分页浏览
3. 点击「查看详情」查看 before/after 快照
4. 已成功的操作可点击「回退」预览补偿动作并确认执行

## 🔌 MCP Server 配置

### 启动
```bash
pnpm mcp   # stdio 模式
```

### 客户端配置（Claude Desktop / Cursor 等）
```json
{
  "mcpServers": {
    "dns-hub": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/path/to/universal-dns-hub"
    }
  }
}
```

### 暴露的工具
**只读**：`dns_list_providers`、`dns_list_domains`、`dns_get_domain`、`dns_list_records`、`dns_get_record`、`dns_get_operation`、`dns_list_operation_logs`、`dns_preview_changes`

**写操作**（默认 dryRun，需 confirm）：`dns_create_record`、`dns_update_record`、`dns_delete_record`、`dns_batch_mutate_records`、`cloudflare_set_proxy`、`dns_rollback_operation`、`dns_rollback_batch`

**资源**：`dns://providers`、`dns://domains`

> MCP Server 不直接操作数据库，所有写操作通过 Service 层，确保审计、能力校验、补偿回退一致。

## 🏗️ 技术架构

### 技术栈
- **前端**：Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **后端**：Next.js Route Handlers（API Routes）
- **数据库**：SQLite（libsql 客户端，文件型，`data/local.sqlite`）+ Drizzle ORM
- **加密**：AES-256-GCM
- **MCP**：@modelcontextprotocol/sdk 1.29
- **测试**：Vitest 4

### 分层架构
```
┌─────────────────────────────────────────────────────────┐
│  入口层（4 类入口共用统一业务层）                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Web UI  │ │ REST API │ │ AI 调度  │ │ MCP Server│  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │
└───────┼────────────┼────────────┼────────────┼─────────┘
        └────────────┴────────────┴────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│  业务服务层（src/lib/services）                           │
│  dns-record-service / rollback-service / audit-logger   │
│  provider-service / operation-query-service             │
│  统一错误类型 DnsServiceError 体系                        │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  数据层 + Provider 抽象层                                 │
│  SQLite + Drizzle ORM │ DNSProviderFactory（11 家）      │
│  AES-256 凭证加密     │ Provider 调用超时/重试/退避        │
└─────────────────────────────────────────────────────────┘
```

### 核心设计
- **统一业务层**：4 类入口必须通过 `src/lib/services` 访问业务逻辑，禁止直接操作数据库或实例化 Provider
- **统一错误类型**：`DnsServiceError` 体系（ValidationError/NotFoundError/ConflictError/CapabilityUnsupportedError/ProviderAuthError/ProviderRateLimitError/ProviderUnavailableError/PartialFailureError/RollbackFailedError/RollbackConflictError）
- **乐观锁**：dns_records.version 字段 + expectedVersion + 条件 WHERE + SQL 自增，原子性关闭 TOCTOU
- **补偿式回退**：无跨请求事务，靠快照 + 逆序补偿；并发冲突可 force 强制
- **幂等迁移**：SQLite ALTER TABLE ADD COLUMN 幂等（catch duplicate column error）

## 📁 目录结构

```
universal-dns-hub/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # REST API（providers/domains/records/operations/logs/ai）
│   │   ├── providers/          # 服务商管理页
│   │   ├── domains/            # 域名管理页
│   │   ├── logs/               # 操作日志页
│   │   ├── operations/[id]/    # 操作详情 + 回退页
│   │   ├── ai-magic/           # AI 智能调度中心
│   │   ├── ai-config/          # AI 模型配置
│   │   └── config/             # 系统配置
│   ├── components/             # UI 组件（Navbar/toast/confirm-dialog）
│   ├── lib/
│   │   ├── db/                 # SQLite schema + 连接 + 幂等迁移
│   │   ├── services/           # 统一业务层（核心）
│   │   ├── providers/          # 11 家 DNS Provider 实现 + 工具
│   │   ├── ai/                 # AI 指令解析
│   │   ├── i18n/               # 中英双语
│   │   ├── api/                # API 错误处理
│   │   └── encryption.ts       # AES-256-GCM
│   └── mcp/server.ts           # MCP Server（stdio）
├── data/                       # SQLite 数据文件（运行时生成）
├── vitest.config.ts            # 测试配置
└── Dockerfile                  # 生产镜像
```

## 🧪 测试

```bash
pnpm test          # 运行单元测试
pnpm test:watch    # 监听模式
```

测试覆盖：
- 名称归一化工具（`toRelativeRecordName`/`toFqdnRecordName` 互逆性、边界条件）
- 统一错误类型体系（所有子类、httpStatus 映射、normalizeError）
- MockProvider 测试夹具（内存模拟 DNS Provider）

## 🌍 部署

### Docker 部署（推荐）

```bash
# 构建镜像
docker build -t universal-dns-hub .

# 运行容器（挂载数据目录持久化 SQLite）
docker run -d -p 5000:5000 \
  -e ENCRYPTION_KEY=<your-64-hex-key> \
  -v $(pwd)/data:/app/data \
  universal-dns-hub
```

镜像基于 Node 24 slim，多阶段构建，端口 5000，非 root 用户运行。

### 环境变量说明

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `ENCRYPTION_KEY` | AES-256 加密密钥（32 字节 = 64 位十六进制） | ✅ |
| `AI_API_URL` | AI API 地址（必须以 `/v1/chat/completions` 结尾） | ❌ |
| `AI_MODEL_ID` | AI 模型 ID | ❌ |
| `AI_API_KEY` | AI API Key | ❌ |
| `NEXT_PUBLIC_APP_NAME` | 应用名称 | ❌ |
| `NEXT_PUBLIC_APP_URL` | 应用 URL | ❌ |

> 数据库为文件型 SQLite，无需配置 `DATABASE_URL`，文件位于 `data/local.sqlite`。

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

**Built with ❤️ using Next.js & TypeScript**
