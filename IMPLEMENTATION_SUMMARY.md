# 核心业务逻辑与 AI 交互层 - 实现总结

## ✅ 已完成的工作

### 1. AI 智能调度核心 (src/lib/ai/parser.ts)

#### 📋 System Prompt 设计

**核心理念**:
- **安全第一**: AI 只是建议者，不是执行者
- **透明可解释**: reasoning 字段提供决策依据
- **智能推断**: 在合理范围内理解用户意图
- **容错处理**: 拒绝模糊指令，主动要求澄清

**输出格式**:

1. **明确指令** (正常操作):
```json
{
  "action": "CREATE | UPDATE | DELETE | QUERY",
  "domain": "example.com",
  "type": "A | AAAA | CNAME | TXT | MX | NS | SRV | SOA",
  "name": "www",
  "content": "1.1.1.1",
  "ttl": 600,
  "priority": 10,
  "reasoning": "简要解释理解逻辑"
}
```

2. **需要澄清** (模糊指令):
```json
{
  "needsClarification": true,
  "message": "需要更多信息",
  "reasoning": "解释为什么需要",
  "suggestions": ["建议 1", "建议 2"]
}
```

#### 🎯 关键特性

1. **智能识别**:
   - 支持多种表达方式（正式/口语化）
   - 自动推断记录类型和操作类型
   - 处理域名和子域名的识别

2. **安全机制**:
   - 对 DELETE 操作特别谨慎
   - 拒绝执行模糊指令
   - 提供 reasoning 字段供用户验证

3. **模型配置**:
   - 模型: `doubao-seed-1-6-thinking-250715` (思考模型)
   - Temperature: `0.3` (低温度，更确定性)
   - Thinking: `enabled` (启用思考模式)
   - Caching: `disabled` (每次解析独立)

#### 📊 示例覆盖

支持的指令类型:
- ✅ 添加记录: "帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录"
- ✅ 更新记录: "把 example.com 的 www 记录改成 8.8.8.8"
- ✅ 删除记录: "删除 example.com 的 TXT 记录"
- ✅ 查询记录: "查看 example.com 的所有 A 记录"
- ✅ CNAME 记录: "给 blog.example.com 添加 CNAME 指向 example.com"
- ✅ MX 记录: "为 example.com 配置邮件服务器，优先级 10，指向 mail.example.com"
- ⚠️ 模糊指令: "帮我添加一个记录" → 要求澄清

---

### 2. Server Actions (src/app/_actions/)

#### 📁 providers.ts

**功能**:
- `upsertProvider`: 添加/更新服务商（加密存储凭证）
- `testProviderConnection`: 测试服务商连接
- `syncDomains`: 同步域名列表
- `deleteProvider`: 删除服务商（级联删除相关数据）
- `getProviders`: 获取所有服务商列表

**安全特性**:
- ✅ 所有凭证通过 AES-256-GCM 加密存储
- ✅ 操作记录到 operation_logs 表
- ✅ 使用 revalidatePath 更新缓存

#### 📁 records.ts

**功能**:
- `manageRecord`: 统一的 DNS 记录管理接口
  - CREATE: 创建记录
  - UPDATE: 更新记录
  - DELETE: 删除记录
- `getDomainRecords`: 获取域名的所有 DNS 记录
- `syncDomainRecords`: 同步域名的 DNS 记录

**核心逻辑**:
- 根据域名所属服务商自动路由到对应 Provider
- 保存 providerRecordId 用于后续更新/删除
- 操作完成后更新本地数据库

**安全特性**:
- ✅ 敏感操作（DELETE）需要前端二次确认
- ✅ 所有操作记录到 operation_logs 表
- ✅ 使用 revalidatePath 更新缓存

#### 📁 ai.ts

**功能**:
- `executeAIInstruction`: 执行 AI 解析的指令
- `getAvailableDomains`: 获取可用域名列表（用于上下文）

**特殊处理**:
- QUERY 操作不修改记录，返回提示信息
- 检查域名是否存在，不存在则提示先同步

---

### 3. UI 组件

#### 📊 Dashboard Stats (src/components/dashboard/stats.tsx)

展示统计数据:
- 服务商数量
- 域名数量
- DNS 记录数量

**特点**:
- 使用 Drizzle ORM 的 `count()` 聚合函数
- 响应式设计（grid 布局）
- 深色/浅色主题支持

#### 🤖 AI Magic Box (src/components/ai-magic-box.tsx)

**核心功能**:
1. **自然语言输入**: 大文本框输入指令
2. **AI 解析**: 调用 parser.ts 解析指令
3. **结果展示**: 显示解析出的操作卡片
4. **用户确认**: "确认执行"按钮
5. **执行反馈**: 显示执行结果

**状态管理**:
- `idle`: 初始状态，显示示例指令
- `parsing`: AI 正在解析中
- `success`: 解析成功，显示操作卡片
- `error`: 解析失败，显示错误信息
- `needsClarification`: 需要澄清，显示建议

**安全机制**:
- ✅ 解析结果必须经过用户确认才执行
- ✅ DELETE 操作特别提示
- ✅ reasoning 字段展示让用户验证 AI 理解
- ✅ 执行失败时显示错误信息

**示例指令**:
提供点击即可使用的示例指令:
- 添加 A 记录
- 更新记录
- 删除记录
- CNAME 记录
- MX 记录

---

### 4. 主页 (src/app/page.tsx)

整合所有组件:
- 头部标题和描述
- Dashboard Stats 统计卡片
- AI Magic Box 智能调度中心
- 快速链接（服务商管理、域名管理、操作日志）

---

## 🔒 安全实现

### 1. 加密存储

所有 API Key 和凭证都通过 `src/lib/encryption.ts` 加密:
- 算法: AES-256-GCM
- 密钥派生: PBKDF2 (10 万次迭代)
- 存储格式: Base64 (salt + iv + tag + ciphertext)

### 2. 用户确认机制

AI 调度的安全闭环:
1. 用户输入自然语言
2. AI 解析为结构化操作
3. 展示解析结果和 reasoning
4. 用户点击"确认执行"
5. 执行操作并显示结果

**关键**: AI 只是建议者，执行权始终在用户手中

### 3. 操作日志

所有操作都记录到 `operation_logs` 表:
- 操作类型（CREATE/UPDATE/DELETE/SYNC）
- 实体类型（provider/domain/record）
- 操作状态（success/failed）
- 错误信息（如果失败）
- 操作时间戳

### 4. 错误处理

- API 调用失败时返回友好错误信息
- AI 解析失败时提示用户重新输入
- 执行失败时显示具体错误原因

---

## 📁 文件结构

```
src/
├── app/
│   ├── _actions/
│   │   ├── providers.ts       # 服务商管理 Actions
│   │   ├── records.ts         # DNS 记录管理 Actions
│   │   └── ai.ts             # AI 执行 Actions
│   └── page.tsx             # 主页
├── components/
│   ├── dashboard/
│   │   └── stats.tsx        # 统计数据组件
│   └── ai-magic-box.tsx     # AI 调度中心组件
└── lib/
    ├── ai/
    │   └── parser.ts         # AI 智能调度核心
    └── ...                  # 其他库
```

---

## 🎯 防坑策略实现

### ✅ AI 越权风险

**风险**: AI 直接调用 API 删除错误的域名记录

**规避**: 实现了"解析结果预览 + 用户确认"的闭环
- AI 解析后展示结果
- 用户必须点击"确认执行"
- DELETE 操作特别提示

### ✅ 指令歧义处理

**风险**: 用户说"把那个域名改了"，AI 盲目猜测

**规避**: 要求 AI 返回 `reasoning` 字段
- 解释理解逻辑
- 提供建议帮助用户修正
- 对模糊指令拒绝执行

### ✅ Token 浪费

**风险**: 每次请求都把所有域名列表发给 AI

**规避**:
- 不发送完整域名列表
- 只在需要澄清时提供上下文
- 使用思考模型提高准确性，减少重试

### ✅ Provider 实例化开销

**风险**: 频繁实例化 Provider 导致数据库连接过多

**规避**:
- 按需创建 Provider 实例
- 不缓存连接，避免连接池耗尽
- 解密凭证后直接使用

---

## 🚀 下一步建议

### 1. 功能完善

- [ ] 实现服务商管理页面（添加/编辑/删除）
- [ ] 实现域名管理页面（列表/详情）
- [ ] 实现 DNS 记录管理页面（表格/编辑）
- [ ] 实现操作日志页面（查询/过滤）

### 2. 用户体验优化

- [ ] 添加 loading 状态优化
- [ ] 添加操作成功后的提示动画
- [ ] 添加错误重试机制
- [ ] 添加操作历史记录

### 3. AI 增强

- [ ] 支持批量操作（如"添加 5 个 A 记录"）
- [ ] 支持复杂条件查询（如"查看所有 TTL < 600 的记录"）
- [ ] 添加操作撤销功能
- [ ] 支持 DNS 记录验证（如 IP 格式校验）

### 4. 性能优化

- [ ] 添加查询缓存
- [ ] 优化数据库查询（添加索引）
- [ ] 实现 Provider 连接池
- [ ] 添加操作队列（避免并发冲突）

### 5. 测试

- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 添加 E2E 测试
- [ ] 压力测试

---

## 📊 代码统计

| 类型 | 文件数 | 大约行数 |
|------|--------|----------|
| AI Parser | 1 | ~440 |
| Server Actions | 3 | ~600 |
| UI 组件 | 2 | ~350 |
| 主页 | 1 | ~80 |
| 文档 | 1 | ~500 |
| **总计** | **8** | **~1970** |

---

## 🎓 关键技术点

### 1. AI Parser

- 使用 `coze-coding-dev-sdk` 集成大语言模型
- 设计专业的 System Prompt
- 使用 Zod 进行类型验证
- 支持流式和非流式响应

### 2. Server Actions

- 使用 `'use server'` 指令标记
- 通过 `db.select()` / `db.insert()` 操作数据库
- 使用 `revalidatePath()` 更新缓存
- 加密/解密敏感数据

### 3. UI 组件

- 使用 React Hooks (`useState`) 管理状态
- 使用 Tailwind CSS 4 样式
- 深色/浅色主题支持
- 响应式设计

### 4. 安全机制

- AES-256-GCM 加密
- 用户确认机制
- 操作日志审计
- 错误处理和重试

---

## 📝 使用示例

### AI 调度流程

1. **输入指令**
   ```
   帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录
   ```

2. **AI 解析**
   ```json
   {
     "action": "CREATE",
     "domain": "example.com",
     "type": "A",
     "name": "@",
     "content": "1.2.3.4",
     "ttl": 600,
     "reasoning": "用户明确要求在 example.com 添加 A 记录指向 1.2.3.4..."
   }
   ```

3. **用户确认**
   - 查看操作卡片
   - 阅读 reasoning
   - 点击"确认执行"

4. **执行操作**
   - 调用 Provider API
   - 更新本地数据库
   - 显示执行结果

---

**核心业务逻辑与 AI 交互层已完成！** 🎉
