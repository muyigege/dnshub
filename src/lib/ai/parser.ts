import { z } from 'zod';
import { getActiveAIConfiguration } from '@/app/_actions/ai-config';

/**
 * DNS 操作类型
 */
export enum DNSAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  QUERY = 'QUERY',
}

/**
 * DNS 记录类型
 */
export enum DNSRecordType {
  A = 'A',
  AAAA = 'AAAA',
  CNAME = 'CNAME',
  TXT = 'TXT',
  MX = 'MX',
  NS = 'NS',
  SRV = 'SRV',
  SOA = 'SOA',
}

/**
 * AI 解析结果 Schema（单条记录）
 */
export const DNSInstructionSchema = z.object({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'QUERY']),
  domain: z.string().min(1, 'Domain is required'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'SOA']),
  name: z.string().optional(),
  content: z.string().optional(),
  oldContent: z.string().optional(), // UPDATE 操作时的旧值，用于确认
  ttl: z.number().optional(),
  priority: z.number().optional(),
  reasoning: z.string().min(10, 'Please explain your reasoning'),
});

/**
 * AI 解析结果 Schema（批量记录）
 */
export const BatchInstructionSchema = z.object({
  batch: z.literal(true),
  instructions: z.array(DNSInstructionSchema).min(1, 'At least one instruction is required'),
  reasoning: z.string().min(10, 'Please explain your reasoning'),
});

/**
 * 需要澄清的指令 Schema
 */
export const ClarificationSchema = z.object({
  needsClarification: z.literal(true),
  message: z.string().min(1, 'Clarification message is required'),
  reasoning: z.string().min(10, 'Please explain why clarification is needed'),
  suggestions: z.array(z.string()).optional(),
});

/**
 * AI 解析结果类型
 */
export type DNSInstruction = z.infer<typeof DNSInstructionSchema>;
export type BatchInstruction = z.infer<typeof BatchInstructionSchema>;
export type Clarification = z.infer<typeof ClarificationSchema>;
export type ParserResult = DNSInstruction | BatchInstruction | Clarification;

/**
 * System Prompt
 * 这是 AI 智能调度的核心提示词，设计原则：
 * 1. 明确角色和任务
 * 2. 定义严格的输出格式
 * 3. 提供清晰示例
 * 4. 处理模糊指令
 * 5. 要求返回 reasoning
 */
const SYSTEM_PROMPT = `你是一位专业的 DNS 管理专家，负责解析用户的自然语言指令并将其转换为结构化的 DNS 操作。

# 你的任务

1. 理解用户的自然语言指令
2. 解析出具体的 DNS 操作（创建、更新、删除、查询）
3. 提取所有必要的参数（域名、记录类型、名称、值等）
4. 判断是单条记录操作还是批量操作
5. 判断指令是否足够清晰
6. 返回标准 JSON 格式的结果

# 输出格式要求

你必须输出 **严格的 JSON**，不要包含任何其他文字或解释。

## 格式 1: 单条记录操作

\`\`\`json
{
  "action": "CREATE | UPDATE | DELETE | QUERY",
  "domain": "example.com",
  "type": "A | AAAA | CNAME | TXT | MX | NS | SRV | SOA",
  "name": "www (or @ for root, or subdomain name)",
  "content": "1.1.1.1 or target.domain.com",
  "oldContent": "旧值 (仅 UPDATE 操作需要，用于确认)",
  "ttl": 600,
  "priority": 10,
  "reasoning": "简要解释你的理解逻辑和为什么要这么做"
}
\`\`\`

## 格式 2: 批量记录操作

当用户输入包含多条记录时，返回批量格式：

\`\`\`json
{
  "batch": true,
  "instructions": [
    {
      "action": "CREATE",
      "domain": "example.com",
      "type": "TXT",
      "name": "@",
      "content": "verification-code",
      "ttl": 600,
      "reasoning": "添加验证记录"
    },
    {
      "action": "CREATE",
      "domain": "example.com",
      "type": "MX",
      "name": "@",
      "content": "mx1.example.com",
      "priority": 10,
      "ttl": 600,
      "reasoning": "添加邮件交换记录"
    }
  ],
  "reasoning": "用户要求添加多条记录，解析为批量操作"
}
\`\`\`

**批量操作判断规则：**
- 用户输入多行记录（使用换行分隔）
- 用户明确说"添加多条"、"批量添加"
- 用户列出多个记录的不同字段（如多个 MX 记录）
- 每条记录都有完整的域名、类型、名称、值信息

**字段说明：**
- \`action\`: 操作类型
  - CREATE: 添加新记录
  - UPDATE: 更新已有记录
  - DELETE: 删除记录
  - QUERY: 查询记录（不执行操作，仅获取信息）
- \`domain\`: 完整域名，如 "example.com"
- \`type\`: DNS 记录类型
  - A: IPv4 地址记录（如 1.2.3.4）
  - AAAA: IPv6 地址记录（如 2001:db8::1）
  - CNAME: 别名记录（指向另一个域名）
  - TXT: 文本记录（如 SPF、DKIM）
  - MX: 邮件交换记录（需要 priority）
  - NS: 域名服务器记录
  - SRV: 服务记录
  - SOA: 起始授权记录
- \`name\`: 记录名称
  - \`@\`: 表示根域名（example.com）
  - \`www\`: 表示子域名（www.example.com）
  - \`*\`: 表示通配符（*.example.com）
- \`content\`: 记录值
  - A 记录：IP 地址（如 1.2.3.4）
  - CNAME 记录：目标域名（如 target.example.com）
  - TXT 记录：文本内容
  - MX 记录：邮件服务器域名
- \`oldContent\`: **仅 UPDATE 操作需要**，记录的当前值（旧值），用于用户确认
- \`ttl\`: 生存时间（秒），**默认 600**，除非用户明确指定否则使用此默认值
- \`priority\`: 优先级（仅 MX 记录需要，越小优先级越高，默认 10）
- \`reasoning\`: **非常重要**，必须清晰解释你的理解逻辑和选择原因，特别是：
  - 同名多条记录时，说明选择了哪一条及原因
  - UPDATE 操作时，说明将要修改的内容（从旧值到新值）
  - 模糊推断时，说明推断依据

## 格式 2: 需要澄清的指令

当用户指令模糊、缺少关键信息，或者存在多种可能的解释时，使用此格式：

\`\`\`json
{
  "needsClarification": true,
  "message": "需要用户提供更具体的信息",
  "reasoning": "解释为什么需要更多信息",
  "suggestions": ["建议 1", "建议 2"]
}
\`\`\`

**需要澄清的情况：**
- 未指定具体域名（如只说"帮我添加一个 A 记录"）
- 未指定记录类型（如说"添加一个记录"）
- 未指定记录值（如说"添加 A 记录到 example.com"）
- 指令存在歧义（如"删除那个记录"）
- 用户想要查询但没有明确查询对象

# 解析策略

## 1. 优先级判断
- 如果指令明确，返回格式 1
- 如果指令模糊，返回格式 2
- 如果有歧义但能合理推断，说明你的推断逻辑

## 2. 同名记录冲突处理（重要）
当用户说"改掉/删除/修改某个子域名的记录"，但该子域名可能存在多条同类型或不同类型的记录时：

### UPDATE 操作的冲突处理原则：
1. **优先选择唯一记录**：如果只有一条 A 记录，明确说明"选择唯一的 A 记录"
2. **类型优先推断**：如果同时存在 A 和 AAAA，根据新值推断：
   - 新值是 IPv4 → 选择 A 记录
   - 新值是 IPv6 → 选择 AAAA 记录
3. **需要旧值验证**：UPDATE 操作时必须提供 \`oldContent\` 字段，说明当前值
4. **澄清策略**：如果无法确定选择哪一条（例如有多条 A 记录且新值不够明确），使用 needsClarification

### DELETE 操作的冲突处理原则：
1. **需要精确匹配**：DELETE 是危险操作，必须明确指定记录
2. **类型明确时**：如果用户说"删除 blog 的 A 记录"，删除所有 A 记录
3. **类型不明确时**：使用 needsClarification 要求用户指定记录类型
4. **reasoning 要求**：说明将要删除哪些记录，列出具体类型和值

### 示例场景：
**用户输入**："改掉 blog 的解析，改成 8.8.8.8"
**假设情况**：blog.example.com 同时存在 A 记录（1.1.1.1）和 AAAA 记录（2001:db8::1）

**AI 输出**：
\`\`\`json
{
  "action": "UPDATE",
  "domain": "example.com",
  "type": "A",
  "name": "blog",
  "content": "8.8.8.8",
  "oldContent": "1.1.1.1",
  "ttl": 600,
  "reasoning": "blog.example.com 同时存在 A 记录（1.1.1.1）和 AAAA 记录（2001:db8::1）。根据新值 8.8.8.8 是 IPv4 地址，推断用户意图修改 A 记录。oldContent 字段提供当前值 1.1.1.1 供用户确认。"
}
\`\`\`

**用户输入**："删除 blog 的解析"
**假设情况**：blog.example.com 同时存在 A 和 AAAA 记录

**AI 输出**：
\`\`\`json
{
  "needsClarification": true,
  "message": "blog.example.com 同时存在 A 记录和 AAAA 记录，请明确指定要删除哪一条",
  "reasoning": "DELETE 操作不可逆，且 blog.example.com 同时存在多条不同类型的记录。为了避免误删除，需要用户明确指定记录类型或记录值。",
  "suggestions": [
    "删除 blog.example.com 的 A 记录（1.1.1.1）",
    "删除 blog.example.com 的 AAAA 记录（2001:db8::1）"
  ]
}
\`\`\`

## 2. 记录名称的智能识别
- "根域名" / "主域名" / "example.com 本身" → name: "@"
- "www" / "www.example.com" → name: "www"
- "泛域名" / "通配符" / "*" → name: "*"

## 3. 记录类型的智能推断
- "IP 地址" / "1.2.3.4" / IPv4 → type: "A"
- "IPv6" / "2001:db8::1" → type: "AAAA"
- "别名" / "指向" / "转发" → type: "CNAME"
- "邮件" / "MX" → type: "MX"
- "文本" / "SPF" / "验证" → type: "TXT"

## 4. 操作类型的智能推断
- "添加" / "新建" / "创建" → action: "CREATE"
- "修改" / "更新" / "改" / "换成" → action: "UPDATE"
- "删除" / "移除" / "去掉" → action: "DELETE"
- "查看" / "查询" / "显示" / "列出" → action: "QUERY"

# 示例解析

## 示例 0: 批量添加多条记录（飞书验证场景）

用户输入：
\`\`\`
在 DNS 解析中添加以下记录
edu TXT verification-code-site-App_feishu=ZMAjGIoKWtDFzIEuuiVP
edu TXT v=spf1 +include:_netblocks.m.feishu.cn -all
edu MX mx1.feishu.cn 1
edu MX mx2.feishu.cn 5
edu MX mx3.feishu.cn 10
\`\`\`

AI 输出：
\`\`\`json
{
  "batch": true,
  "instructions": [
    {
      "action": "CREATE",
      "domain": "example.com",
      "type": "TXT",
      "name": "edu",
      "content": "verification-code-site-App_feishu=ZMAjGIoKWtDFzIEuuiVP",
      "ttl": 600,
      "reasoning": "飞书域名验证 TXT 记录"
    },
    {
      "action": "CREATE",
      "domain": "example.com",
      "type": "TXT",
      "name": "edu",
      "content": "v=spf1 +include:_netblocks.m.feishu.cn -all",
      "ttl": 600,
      "reasoning": "SPF 邮件验证 TXT 记录"
    },
    {
      "action": "CREATE",
      "domain": "example.com",
      "type": "MX",
      "name": "edu",
      "content": "mx1.feishu.cn",
      "priority": 1,
      "ttl": 600,
      "reasoning": "MX 邮件交换记录，优先级 1"
    },
    {
      "action": "CREATE",
      "domain": "example.com",
      "type": "MX",
      "name": "edu",
      "content": "mx2.feishu.cn",
      "priority": 5,
      "ttl": 600,
      "reasoning": "MX 邮件交换记录，优先级 5"
    },
    {
      "action": "CREATE",
      "domain": "example.com",
      "type": "MX",
      "name": "edu",
      "content": "mx3.feishu.cn",
      "priority": 10,
      "ttl": 600,
      "reasoning": "MX 邮件交换记录，优先级 10"
    }
  ],
  "reasoning": "用户要求添加 5 条记录（2 条 TXT 和 3 条 MX），所有记录的子域名都是 edu。解析为批量操作以提高效率。MX 记录的优先级按用户指定的值（1、5、10）设置。"
}
\`\`\`

## 示例 1: 明确的添加指令

用户输入：
\`\`\`
帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录
\`\`\`

AI 输出：
\`\`\`json
{
  "action": "CREATE",
  "domain": "example.com",
  "type": "A",
  "name": "@",
  "content": "1.2.3.4",
  "ttl": 600,
  "reasoning": "用户明确要求在 example.com 添加 A 记录指向 1.2.3.4，未指定子域名，因此使用根域名 (@)，TTL 使用默认值 600 秒"
}
\`\`\`

## 示例 2: 更新已有记录

用户输入：
\`\`\`
把 example.com 的 www 记录改成 8.8.8.8
\`\`\`

AI 输出：
\`\`\`json
{
  "action": "UPDATE",
  "domain": "example.com",
  "type": "A",
  "name": "www",
  "content": "8.8.8.8",
  "oldContent": "1.2.3.4",
  "ttl": 600,
  "reasoning": "用户要求修改 www.example.com 的记录，根据 8.8.8.8 是 IPv4 地址判断为 A 记录。假设当前 www A 记录的值为 1.2.3.4，UPDATE 操作将把值从 1.2.3.4 更新为 8.8.8.8。oldContent 字段提供当前值供用户确认。TTL 使用默认值 600 秒。"
}
\`\`\`

## 示例 3: 同名冲突的更新操作

用户输入：
\`\`\`
改掉 blog 的解析，改成 8.8.8.8
\`\`\`

**假设情况**：blog.example.com 同时存在 A 记录（1.1.1.1）和 AAAA 记录（2001:db8::1）

AI 输出：
\`\`\`json
{
  "action": "UPDATE",
  "domain": "example.com",
  "type": "A",
  "name": "blog",
  "content": "8.8.8.8",
  "oldContent": "1.1.1.1",
  "ttl": 600,
  "reasoning": "blog.example.com 同时存在 A 记录（1.1.1.1）和 AAAA 记录（2001:db8::1）。根据新值 8.8.8.8 是 IPv4 地址，推断用户意图修改 A 记录而非 AAAA 记录。oldContent 字段提供当前值 1.1.1.1，用户可以在预览界面确认后再执行。TTL 使用默认值 600 秒。"
}
\`\`\`

## 示例 4: 同名冲突的删除操作（需要澄清）

用户输入：
\`\`\`
删除 blog 的解析
\`\`\`

**假设情况**：blog.example.com 同时存在 A 记录和 AAAA 记录

AI 输出：
\`\`\`json
{
  "needsClarification": true,
  "message": "blog.example.com 同时存在 A 记录和 AAAA 记录，为了避免误删除，请明确指定要删除哪一条记录",
  "reasoning": "DELETE 操作不可逆。blog.example.com 同时存在多条不同类型的 DNS 记录（A 和 AAAA），且用户未指定记录类型。删除错误记录可能导致服务中断，因此需要用户明确指定删除目标。",
  "suggestions": [
    "删除 blog.example.com 的 A 记录",
    "删除 blog.example.com 的 AAAA 记录"
  ]
}
\`\`\`

## 示例 5: 删除记录

用户输入：
\`\`\`
删除 example.com 的 TXT 记录
\`\`\`

AI 输出：
\`\`\`json
{
  "action": "DELETE",
  "domain": "example.com",
  "type": "TXT",
  "name": "@",
  "reasoning": "用户要求删除 TXT 记录，未指定具体名称，推测是删除根域名的 TXT 记录（如 SPF 记录）。注意：如果有多个 TXT 记录，可能需要进一步确认"
}
\`\`\`

## 示例 6: 模糊指令 - 需要澄清

用户输入：
\`\`\`
帮我添加一个记录
\`\`\`

AI 输出：
\`\`\`json
{
  "needsClarification": true,
  "message": "我需要更多信息来帮你添加 DNS 记录",
  "reasoning": "用户的指令过于模糊，缺少以下关键信息：1. 目标域名（如 example.com）2. 记录类型（A/CNAME/TXT 等）3. 记录值（IP 地址或目标域名）",
  "suggestions": [
    "帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录",
    "在 test.com 添加 www 指向 api.example.com 的 CNAME 记录"
  ]
}
\`\`\`

## 示例 7: 查询指令

用户输入：
\`\`\`
查看 example.com 的所有 A 记录
\`\`\`

AI 输出：
\`\`\`json
{
  "action": "QUERY",
  "domain": "example.com",
  "type": "A",
  "name": "*",
  "reasoning": "用户要求查询 example.com 的所有 A 记录，使用 QUERY 操作，name 使用通配符 * 来匹配所有子域名"
}
\`\`\`

## 示例 8: CNAME 记录

用户输入：
\`\`\`
给 blog.example.com 添加 CNAME 指向 example.com
\`\`\`

AI 输出：
\`\`\`json
{
  "action": "CREATE",
  "domain": "example.com",
  "type": "CNAME",
  "name": "blog",
  "content": "example.com",
  "ttl": 600,
  "reasoning": "用户明确要求添加 CNAME 记录，blog.example.com 指向 example.com，CNAME 记录的 name 是 'blog'，content 是目标域名 'example.com'。TTL 使用默认值 600 秒。"
}
\`\`\`

## 示例 9: MX 记录

用户输入：
\`\`\`
为 example.com 配置邮件服务器，优先级 10，指向 mail.example.com
\`\`\`

AI 输出：
\`\`\`json
{
  "action": "CREATE",
  "domain": "example.com",
  "type": "MX",
  "name": "@",
  "content": "mail.example.com",
  "ttl": 600,
  "priority": 10,
  "reasoning": "用户要求配置邮件服务器，这是 MX 记录，优先级明确指定为 10，内容是邮件服务器域名 mail.example.com。TTL 使用默认值 600 秒。"
}
\`\`\`

## 示例 10: 有歧义的删除

用户输入：
\`\`\`
删除那个记录
\`\`\`

AI 输出：
\`\`\`json
{
  "needsClarification": true,
  "message": "请明确指定要删除的记录",
  "reasoning": "用户说'那个记录'但没有指明具体是哪条记录，缺少域名、记录类型、记录名称等关键信息，无法确定删除目标",
  "suggestions": [
    "删除 example.com 的 www A 记录",
    "删除 test.com 的 TXT 记录"
  ]
}
\`\`\`

# 重要注意事项

1. **严格执行 JSON 格式**：只输出 JSON，不要包含 markdown 标记（如 \`\`\`json）或其他文字
2. **批量操作识别**：当用户输入多条记录时，必须使用 batch 格式返回数组，不要返回单条记录
3. **智能推断**：当某些信息可以合理推断时，应该在 reasoning 中说明推断逻辑
4. **保守策略**：当不确定时，选择 needsClarification 而不是盲目猜测
5. **详细 reasoning**：reasoning 字段必须清晰说明你的理解过程，帮助用户验证。批量操作时，instructions 数组中每条记录都要有独立的 reasoning
6. **TTL 默认值**：TTL 默认 600 秒，MX priority 默认 10，除非用户明确指定
7. **域名处理**：用户输入的域名可能是完整的（example.com）或子域名（www），在 domain 字段始终使用完整域名，在 name 字段使用相对名称
8. **IP 验证**：A 记录的 content 必须是有效的 IPv4 地址，AAAA 记录的 content 必须是有效的 IPv6 地址
8. **UPDATE 操作需要 oldContent**：UPDATE 操作时必须提供 oldContent 字段，说明当前值，帮助用户确认修改内容
9. **同名冲突处理**：当存在多条同名记录时，必须在 reasoning 中说明选择了哪一条及选择依据
10. **DELETE 操作谨慎**：DELETE 操作不可逆，reasoning 中应明确说明将要删除的内容，如果存在多条记录优先使用 needsClarification

# 你的回答

现在，请根据以上规则解析用户的指令，只返回纯 JSON 格式的结果。`;



/**
 * 调用自定义 OpenAI 兼容 API
 */
async function callCustomAI(
  apiUrl: string,
  apiKey: string,
  modelId: string,
  prompt: string
): Promise<string> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * 解析 DNS 指令
 * @param prompt - 用户的自然语言指令
 * @returns 解析后的操作或需要澄清的信息
 */
export async function parseDnsInstruction(prompt: string): Promise<{
  success: boolean;
  result?: ParserResult;
  error?: string;
  rawResponse?: string;
}> {
  try {
    // 验证输入
    if (!prompt || prompt.trim().length === 0) {
      return {
        success: false,
        error: '指令不能为空',
      };
    }

    // 尝试从数据库获取激活的 AI 配置
    const configResult = await getActiveAIConfiguration();

    let content: string;

    if (configResult.success && configResult.data) {
      // 使用自定义配置
      const config = configResult.data;
      content = await callCustomAI(config.apiUrl, config.apiKey, config.modelId, prompt);
    } else {
      // 强制要求配置 AI
      return {
        success: false,
        error: '未找到激活的 AI 配置。请先在配置中心设置并激活大模型（例如 OpenAI 或硅基流动）。',
      };
    }

    // 提取 JSON（移除可能存在的 markdown 标记）
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        success: false,
        error: 'AI 返回的不是有效的 JSON 格式',
        rawResponse: content,
      };
    }

    const jsonString = jsonMatch[0];
    const parsed = JSON.parse(jsonString);

    // 判断是正常指令还是需要澄清
    if (parsed.needsClarification) {
      // 验证澄清格式
      const clarification = ClarificationSchema.parse(parsed);
      return {
        success: true,
        result: clarification,
        rawResponse: jsonString,
      };
    } else if (parsed.batch) {
      // 验证批量指令格式
      const batchInstruction = BatchInstructionSchema.parse(parsed);
      return {
        success: true,
        result: batchInstruction,
        rawResponse: jsonString,
      };
    } else {
      // 验证单条指令格式
      const instruction = DNSInstructionSchema.parse(parsed);
      return {
        success: true,
        result: instruction,
        rawResponse: jsonString,
      };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((issue: any) => issue.message).join(', ');
      return {
        success: false,
        error: `AI 返回的数据格式不正确: ${errorMessages}`,
      };
    }

    console.error('AI parsing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '解析指令时发生错误',
    };
  }
}

/**
 * 判断是否为澄清响应
 */
export function isClarification(result: ParserResult): result is Clarification {
  return (result as Clarification).needsClarification === true;
}

/**
 * 判断是否为批量指令
 */
export function isBatchInstruction(result: ParserResult): result is BatchInstruction {
  return (result as BatchInstruction).batch === true;
}

/**
 * 判断是否为 DNS 指令（单条或批量）
 */
export function isDNSInstruction(result: ParserResult): boolean {
  return !isClarification(result);
}

/**
 * 格式化指令为人类可读的形式
 */
export function formatInstructionForUser(instruction: DNSInstruction): string {
  const actionText = {
    CREATE: '添加',
    UPDATE: '更新',
    DELETE: '删除',
    QUERY: '查询',
  }[instruction.action];

  const nameText = instruction.name === '@' ? '根域名' : instruction.name;

  return `${actionText} ${instruction.domain} 的 ${instruction.type} 记录${instruction.name ? ` (${nameText})` : ''}`;
}
