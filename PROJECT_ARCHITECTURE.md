# Universal DNS Hub - 系统架构设计文档

## 📋 项目概述

Universal DNS Hub 是一个多云域名管理系统，支持整合 Cloudflare、阿里云、腾讯云等主流 DNS 服务商，提供统一的域名和 DNS 记录管理接口。系统还集成了 AI 智能调度中心，通过自然语言指令自动执行 DNS 操作。

---

## 🏗️ 技术栈

### 前端
- **框架**: Next.js 16 (App Router)
- **UI 库**: Tailwind CSS 4, shadcn/ui
- **语言**: TypeScript 5

### 后端
- **API**: Next.js Server Actions / API Routes
- **数据库**: PostgreSQL
- **ORM**: Drizzle ORM
- **安全**: AES-256-GCM 加密（敏感数据存储）

---

## 📁 目录结构

```
universal-dns-hub/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # API Routes
│   │   │   ├── providers/            # 服务商管理 API
│   │   │   ├── domains/              # 域名管理 API
│   │   │   ├── records/              # DNS 记录 API
│   │   │   └── ai/                   # AI 智能调度 API
│   │   ├── providers/                # 服务商管理页面
│   │   ├── domains/                  # 域名管理页面
│   │   ├── ai-magic/                 # AI 智能调度中心
│   │   └── settings/                 # 配置中心
│   ├── components/
│   │   ├── ui/                       # shadcn/ui 组件
│   │   ├── layout/                   # 布局组件
│   │   ├── providers/                # 服务商相关组件
│   │   ├── domains/                  # 域名相关组件
│   │   └── ai-magic/                 # AI 调度相关组件
│   ├── lib/
│   │   ├── db/                       # 数据库相关
│   │   │   ├── schema.ts             # Drizzle Schema 定义
│   │   │   ├── connection.ts         # 数据库连接
│   │   │   └── seed.ts               # 初始数据
│   │   ├── encryption.ts             # AES-256 加密工具
│   │   ├── providers/                # DNS Provider 接口实现
│   │   │   ├── base.ts               # 基础接口定义
│   │   │   ├── cloudflare.ts         # Cloudflare 实现
│   │   │   ├── aliyun.ts             # 阿里云实现
│   │   │   └── tencent.ts            # 腾讯云实现
│   │   └── utils/
├── drizzle.config.ts                 # Drizzle 配置
├── .env.example                      # 环境变量示例
└── package.json
```

---

## 🗄️ 数据库设计

### 核心数据表

#### 1. dns_providers
存储 DNS 服务商的配置信息。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| name | varchar(100) | 服务商实例名称 |
| type | varchar(20) | cloudflare \| aliyun \| tencent |
| credentials | text | 加密存储的凭证 (JSON) |
| is_active | boolean | 是否激活 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### 2. domains
存储从服务商同步的域名列表。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| provider_id | integer | 关联服务商 (外键) |
| name | varchar(255) | 域名 |
| is_active | boolean | 是否激活 |
| last_synced_at | timestamp | 最后同步时间 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### 3. dns_records
存储 DNS 记录详情。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| domain_id | integer | 关联域名 (外键) |
| type | varchar(10) | A \| CNAME \| TXT \| AAAA \| MX 等 |
| name | varchar(255) | 记录名称 (@, www, api) |
| content | text | 记录值 (IP, 域名等) |
| ttl | integer | 生存时间（秒） |
| priority | integer | 优先级（MX 记录） |
| provider_record_id | varchar(255) | 服务商端记录 ID |
| is_active | boolean | 是否激活 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### 4. ai_configurations
存储 AI 模型配置。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| name | varchar(100) | 配置名称 |
| api_url | varchar(500) | API 地址 |
| model_id | varchar(100) | 模型 ID |
| api_key | text | 加密存储的 API Key |
| is_active | boolean | 是否激活 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### 5. operation_logs
记录所有 DNS 操作历史。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| action | varchar(20) | CREATE \| UPDATE \| DELETE \| SYNC |
| entity_type | varchar(20) | provider \| domain \| record |
| entity_id | integer | 实体 ID |
| details | text | 操作详情 (JSON) |
| status | varchar(20) | success \| failed |
| error_message | text | 错误信息 |
| created_by | varchar(100) | 操作人 |
| created_at | timestamp | 创建时间 |

---

## 🔐 安全设计

### 敏感数据加密

所有 API Key、Secret、Token 等敏感数据均使用 **AES-256-GCM** 算法加密存储。

**加密流程**:
1. 生成 64 字节随机盐值 + 16 字节 IV
2. 使用 PBKDF2 派生密钥（从环境变量 `ENCRYPTION_KEY`）
3. AES-256-GCM 加密数据
4. 附加认证标签（防止篡改）
5. 组合：salt + iv + tag + ciphertext → Base64 编码

**示例**:
```typescript
import { encryptJSON, decryptJSON } from '@/lib/encryption';

// 加密
const encrypted = encryptJSON({
  apiToken: 'cloudflare-api-token',
});

// 解密
const decrypted = decryptJSON<{ apiToken: string }>(encrypted);
```

---

## 🔌 接口抽象层设计

### DNS Provider 基础接口

所有 DNS 服务商必须实现 `IDNSProvider` 接口：

```typescript
interface IDNSProvider {
  readonly name: string;
  testConnection(): Promise<OperationResult>;
  listDomains(): Promise<OperationResult<DomainData[]>>;
  listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>>;
  addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>>;
  updateRecord(domainName: string, recordId: string, record: Partial<DNSRecordData>): Promise<OperationResult<DNSRecordData>>;
  deleteRecord(domainName: string, recordId: string): Promise<OperationResult>;
}
```

### 支持的服务商

| 服务商 | 实现类 | API 版本 |
|--------|--------|----------|
| Cloudflare | `CloudflareProvider` | API v4 |
| 阿里云 | `AliYunProvider` | 2015-01-09 |
| 腾讯云 | `TencentProvider` | 2021-03-23 |

### 工厂模式使用

```typescript
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';

// 创建 Cloudflare Provider
const cloudflare = DNSProviderFactory.create(ProviderType.CLOUDFLARE, {
  apiToken: 'your-api-token',
});

// 测试连接
const result = await cloudflare.testConnection();
```

---

## 🤖 AI 智能调度中心

### 工作流程

1. **用户输入自然语言指令**
   - 例："帮我在 example.com 增加一个指向 1.2.3.4 的 A 记录"

2. **AI 解析为结构化操作**
   ```json
   {
     "action": "ADD",
     "domain": "example.com",
     "type": "A",
     "name": "@",
     "content": "1.2.3.4",
     "ttl": 600
   }
   ```

3. **用户确认**
   - 展示解析结果
   - 等待用户确认执行

4. **执行操作**
   - 调用对应的 DNS Provider API
   - 记录操作日志

### 支持的指令类型

| 指令类型 | 示例 | 解析结果 |
|----------|------|----------|
| 添加记录 | "添加一个 A 记录到 example.com" | action: ADD |
| 删除记录 | "删除 example.com 的 www 记录" | action: DELETE |
| 更新记录 | "把 example.com 的 A 记录改成 1.2.3.4" | action: UPDATE |
| 查询记录 | "查看 example.com 的所有记录" | action: QUERY |

---

## 🚀 开发指南

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件
```

### 初始化数据库

```bash
# 生成数据库迁移文件
pnpm drizzle-kit generate

# 推送 Schema 到数据库
pnpm drizzle-kit push

# （可选）运行种子数据
pnpm drizzle-kit seed
```

### 启动开发服务器

```bash
pnpm dev
```

应用将在 http://localhost:5000 启动。

### 构建

```bash
pnpm build
```

---

## 📝 API 路由规划

### 服务商管理 API
- `POST /api/providers` - 添加服务商
- `GET /api/providers` - 获取服务商列表
- `PUT /api/providers/:id` - 更新服务商
- `DELETE /api/providers/:id` - 删除服务商
- `POST /api/providers/:id/test` - 测试连接
- `POST /api/providers/:id/sync` - 同步域名

### 域名管理 API
- `GET /api/domains` - 获取域名列表
- `GET /api/domains/:id` - 获取域名详情
- `GET /api/domains/:id/records` - 获取域名的 DNS 记录

### DNS 记录管理 API
- `POST /api/records` - 添加 DNS 记录
- `PUT /api/records/:id` - 更新 DNS 记录
- `DELETE /api/records/:id` - 删除 DNS 记录

### AI 智能调度 API
- `POST /api/ai/parse` - 解析自然语言指令
- `POST /api/ai/execute` - 执行解析后的操作

---

## 🎨 UI 设计规范

### 主题配置
- **默认模式**: 深色主题
- **切换**: 支持深色/浅色模式切换
- **主色调**: 蓝色 (#3B82F6)

### 核心组件
- **Sidebar**: 侧边栏导航
- **Table**: 数据表格（用于域名和记录列表）
- **Modal**: 对话框（用于添加/编辑）
- **Card**: 卡片组件（用于服务商展示）
- **Toast**: 通知组件（操作反馈）

---

## 🔍 错误处理

### API 错误统一响应格式

```typescript
{
  success: false,
  error: "错误信息",
  code: "ERROR_CODE",
  details: {}
}
```

### 常见错误类型

| 错误代码 | 说明 | 处理方式 |
|----------|------|----------|
| INVALID_CREDENTIALS | 凭证无效 | 提示用户检查凭证 |
| DNS_CONFLICT | DNS 记录冲突 | 提示用户检查记录 |
| INVALID_IP | IP 地址无效 | 校验 IP 格式 |
| PROVIDER_ERROR | 服务商 API 错误 | 显示服务商错误信息 |
| NETWORK_ERROR | 网络错误 | 提示用户重试 |

---

## 📊 监控与日志

### 操作日志
所有 DNS 操作都会记录到 `operation_logs` 表，包括：
- 操作类型（CREATE/UPDATE/DELETE/SYNC）
- 操作人
- 操作状态（success/failed）
- 错误信息（如果失败）

### 日志查询
可以通过 `/api/logs` API 查询操作历史，支持筛选：
- 时间范围
- 操作类型
- 实体类型
- 操作状态

---

## 🚨 安全注意事项

1. **敏感数据加密**: 所有 API Key/Secret 必须加密存储
2. **环境变量保护**: 不要将 `.env` 文件提交到 Git
3. **API 访问控制**: 实现用户认证和授权
4. **HTTPS 强制**: 生产环境必须使用 HTTPS
5. **SQL 注入防护**: 使用参数化查询（Drizzle ORM 已处理）
6. **XSS 防护**: React 默认转义，但仍需注意动态内容

---

## 📄 License

MIT License

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request
