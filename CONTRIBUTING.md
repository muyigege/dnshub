# 贡献指南

感谢您对 Universal DNS Hub 的兴趣！我们欢迎各种形式的贡献。

## 如何贡献

### 报告 Bug

如果您发现了 Bug，请：

1. 在 GitHub Issues 中搜索，确认该 Bug 是否已被报告
2. 如果没有，请创建一个新的 Issue
3. 使用 Bug Report 模板，提供详细的复现步骤
4. 附加屏幕截图或错误日志（如果有）

### 功能建议

我们很乐意听到您的新功能建议！

1. 在 GitHub Issues 中搜索是否已有类似建议
2. 创建一个新的 Feature Request
3. 清晰描述功能需求和使用场景

### 代码贡献

1. **Fork 本仓库**
2. **创建特性分支**
   ```bash
   git checkout -b feature/amazing-feature
   # 或修复分支
   git checkout -b fix/annoying-bug
   ```
3. **提交更改**
   ```bash
   git commit -m 'feat: add some amazing feature'
   git commit -m 'fix: resolve annoying bug'
   ```
4. **推送分支**
   ```bash
   git push origin feature/amazing-feature
   ```
5. **创建 Pull Request**

## 开发设置

### 环境要求

- Node.js 18+
- pnpm 8+
- PostgreSQL 12+ (或使用 SQLite 进行开发)

### 本地开发

```bash
# 克隆并安装依赖
pnpm install

# 复制环境变量
cp .env.example .env
# 编辑 .env 配置数据库

# 初始化数据库
pnpm db:push

# 启动开发服务器
pnpm dev
```

### 代码规范

- 使用 TypeScript
- 遵循 ESLint 配置
- 提交信息使用语义化前缀

## 提交信息规范

```
feat: 新功能
fix: Bug 修复
docs: 文档更新
style: 代码格式（不影响功能）
refactor: 重构
perf: 性能优化
test: 测试相关
chore: 构建/工具相关
```

## Pull Request 流程

1. Fork 并创建您的分支
2. 确保所有测试通过
3. 更新相关文档
4. 提交 Pull Request 并描述您的更改

## 许可证

通过贡献代码，您同意将您的作品按 MIT 许可证授权。
