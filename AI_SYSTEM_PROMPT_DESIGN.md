# AI System Prompt 设计详解

## 📋 设计概述

为 Universal DNS Hub 的 AI 智能调度中心设计了一套专业的 System Prompt，确保 AI 能够准确理解用户的自然语言指令，并转换为结构化的 DNS 操作。

## 🎯 设计目标

1. **准确性**: 精确识别 DNS 操作类型和参数
2. **安全性**: 对模糊指令主动要求澄清，避免误操作
3. **可解释性**: 返回 reasoning 字段，让用户确认 AI 的理解
4. **容错性**: 处理各种表达方式，智能推断用户意图

## 📐 Prompt 结构

### 1. 角色定义

```
你是一位专业的 DNS 管理专家，负责解析用户的自然语言指令
并将其转换为结构化的 DNS 操作。
```

**设计理念**:
- 明确角色定位（DNS 管理专家）
- 界定职责范围（解析指令、转换操作）

### 2. 任务说明

```
1. 理解用户的自然语言指令
2. 解析出具体的 DNS 操作（创建、更新、删除、查询）
3. 提取所有必要的参数（域名、记录类型、名称、值等）
4. 判断指令是否足够清晰
5. 返回标准 JSON 格式的结果
```

**设计理念**:
- 分解任务为明确步骤
- 强调输出格式要求

### 3. 输出格式定义

#### 格式 1: 明确的指令操作

```json
{
  "action": "CREATE | UPDATE | DELETE | QUERY",
  "domain": "example.com",
  "type": "A | AAAA | CNAME | TXT | MX | NS | SRV | SOA",
  "name": "www (or @ for root, or subdomain name)",
  "content": "1.1.1.1 or target.domain.com",
  "ttl": 600,
  "priority": 10,
  "reasoning": "简要解释你的理解逻辑"
}
```

**关键字段**:
- `action`: 操作类型（CREATE/UPDATE/DELETE/QUERY）
- `domain`: 完整域名
- `type`: DNS 记录类型
- `name`: 记录名称（@ 表示根域名）
- `content`: 记录值
- `ttl`: 生存时间
- `priority`: 优先级（MX 记录专用）
- `reasoning`: 解释理解逻辑（核心安全机制）

#### 格式 2: 需要澄清的指令

```json
{
  "needsClarification": true,
  "message": "需要用户提供更具体的信息",
  "reasoning": "解释为什么需要更多信息",
  "suggestions": ["建议 1", "建议 2"]
}
```

**设计理念**:
- 使用 `needsClarification` 标记明确区分两种格式
- 提供建议帮助用户快速修正
- `reasoning` 字段解释模糊之处

### 4. 解析策略

#### 4.1 记录名称的智能识别

```
- "根域名" / "主域名" / "example.com 本身" → name: "@"
- "www" / "www.example.com" → name: "www"
- "泛域名" / "通配符" / "*" → name: "*"
```

**设计理念**:
- 支持多种表达方式
- 标准化输出格式

#### 4.2 记录类型的智能推断

```
- "IP 地址" / "1.2.3.4" / IPv4 → type: "A"
- "IPv6" / "2001:db8::1" → type: "AAAA"
- "别名" / "指向" / "转发" → type: "CNAME"
- "邮件" / "MX" → type: "MX"
- "文本" / "SPF" / "验证" → type: "TXT"
```

**设计理念**:
- 基于关键词智能推断
- 处理专业术语和口语化表达

#### 4.3 操作类型的智能推断

```
- "添加" / "新建" / "创建" → action: "CREATE"
- "修改" / "更新" / "改" / "换成" → action: "UPDATE"
- "删除" / "移除" / "去掉" → action: "DELETE"
- "查看" / "查询" / "显示" / "列出" → action: "QUERY"
```

**设计理念**:
- 覆盖常见动词
- 支持正式和非正式表达

### 5. 示例解析

#### 示例 1: 明确的添加指令

**用户输入**:
```
帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录
```

**AI 输出**:
```json
{
  "action": "CREATE",
  "domain": "example.com",
  "type": "A",
  "name": "@",
  "content": "1.2.3.4",
  "ttl": 600,
  "reasoning": "用户明确要求在 example.com 添加 A 记录指向 1.2.3.4，
  未指定子域名，因此使用根域名 (@)，TTL 使用默认值 600 秒"
}
```

**分析**:
- ✅ 准确识别操作类型（CREATE）
- ✅ 正确提取域名和记录类型
- ✅ 合理推断记录名称（根域名 @）
- ✅ 清晰解释推理逻辑

#### 示例 2: 模糊指令 - 需要澄清

**用户输入**:
```
帮我添加一个记录
```

**AI 输出**:
```json
{
  "needsClarification": true,
  "message": "我需要更多信息来帮你添加 DNS 记录",
  "reasoning": "用户的指令过于模糊，缺少以下关键信息：
  1. 目标域名（如 example.com）
  2. 记录类型（A/CNAME/TXT 等）
  3. 记录值（IP 地址或目标域名）",
  "suggestions": [
    "帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录",
    "在 test.com 添加 www 指向 api.example.com 的 CNAME 记录"
  ]
}
```

**分析**:
- ✅ 正确识别指令模糊
- ✅ 详细说明缺失信息
- ✅ 提供建议帮助用户快速修正

#### 示例 3: 有歧义的删除

**用户输入**:
```
删除那个记录
```

**AI 输出**:
```json
{
  "needsClarification": true,
  "message": "请明确指定要删除的记录",
  "reasoning": "用户说'那个记录'但没有指明具体是哪条记录，
  缺少域名、记录类型、记录名称等关键信息，无法确定删除目标",
  "suggestions": [
    "删除 example.com 的 www A 记录",
    "删除 test.com 的 TXT 记录"
  ]
}
```

**分析**:
- ✅ 拒绝执行危险操作（DELETE）
- ✅ 要求用户提供明确信息
- ✅ 避免误删风险

### 6. 重要注意事项

```
1. 严格执行 JSON 格式：只输出 JSON，不要包含 markdown 标记
2. 智能推断：当某些信息可以合理推断时，应该在 reasoning 中说明
3. 保守策略：当不确定时，选择 needsClarification 而不是盲目猜测
4. 详细 reasoning：reasoning 字段必须清晰说明你的理解过程
5. 默认值处理：TTL 默认 600，MX priority 默认 10
6. 域名处理：domain 字段始终使用完整域名，name 字段使用相对名称
7. IP 验证：A 记录的 content 必须是有效的 IPv4 地址
8. 安全性：DELETE 操作需要特别谨慎，reasoning 中应明确说明将要删除的内容
```

## 🛡️ 安全机制

### 1. 用户确认机制

AI 只是**建议者**，不是**执行者**：
- AI 解析指令后展示结果
- 用户必须点击"确认执行"才会真正操作
- 避免误操作和不可逆的损失

### 2. 推理透明化

`reasoning` 字段的作用：
- 让用户验证 AI 的理解是否正确
- 发现潜在的理解偏差
- 提供决策依据

### 3. 模糊指令防御

保守策略：
- 宁可要求澄清，也不盲目猜测
- 对 DELETE 操作特别谨慎
- 提供建议帮助用户完善指令

### 4. 结构化输出验证

使用 Zod Schema 验证：
- 确保输出格式正确
- 防止非法数据
- 类型安全保证

## 📊 性能优化

### 1. 模型选择

```typescript
{
  model: 'doubao-seed-1-6-thinking-250715', // 思考模型
  temperature: 0.3, // 低温度，更确定性
  thinking: 'enabled', // 启用思考模式
}
```

**选择理由**:
- `thinking-250715`: 提供深度推理能力
- `temperature: 0.3`: 降低随机性，提高准确性
- `thinking: 'enabled'`: 鼓励模型展示推理过程

### 2. Token 节省

避免发送大量数据：
- 不发送完整域名列表
- 只在需要澄清时提供上下文
- 用户确认后才执行操作

### 3. 缓存策略

```typescript
{
  caching: 'disabled', // 每次解析都是独立的
}
```

**选择理由**:
- DNS 指令解析是独立的
- 不需要历史上下文
- 避免缓存污染

## 🎓 最佳实践

### 1. 指令编写建议

**好的指令**:
- ✅ "帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录"
- ✅ "把 www.example.com 的记录改成 8.8.8.8"

**模糊的指令**:
- ❌ "添加一个记录"
- ❌ "删除那个记录"

### 2. 安全操作建议

**DELETE 操作前**:
- 仔细检查 reasoning 字段
- 确认删除的域名和记录类型
- 如有疑问，使用 QUERY 先查看

### 3. 复杂操作拆分

**复杂操作**:
```
将 example.com 的所有 A 记录改成 8.8.8.8
```

**建议拆分**:
```
1. 查询 example.com 的所有 A 记录
2. 逐个更新每条记录
```

## 🔧 扩展性

### 添加新的记录类型

1. 在 `DNSRecordType` 枚举中添加新类型
2. 更新 Prompt 中的类型说明
3. 添加示例解析
4. 更新 Zod Schema

### 添加新的操作类型

1. 在 `DNSAction` 枚举中添加新类型
2. 更新 Prompt 中的操作说明
3. 在 Server Actions 中实现对应逻辑
4. 更新 AI parser

## 📝 总结

这套 System Prompt 的核心设计原则：

1. **安全第一**: 对模糊和危险操作特别谨慎
2. **用户掌控**: AI 只是建议者，执行权在用户
3. **透明可解释**: reasoning 字段提供决策依据
4. **智能推断**: 在合理范围内理解用户意图
5. **容错处理**: 支持多种表达方式

通过这套设计，AI 能够准确理解用户的 DNS 管理需求，同时确保操作的安全性和可控性。
