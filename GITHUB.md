# GitHub 提交指南

本文档将指导你如何将 Universal DNS Hub 项目提交到 GitHub。

## 📋 目录

- [准备工作](#准备工作)
- [初始化 Git 仓库](#初始化-git-仓库)
- [配置 .gitignore](#配置-gitignore)
- [提交代码](#提交代码)
- [推送到 GitHub](#推送到-github)
- [管理远程仓库](#管理远程仓库)
- [最佳实践](#最佳实践)

---

## 准备工作

### 1. 注册 GitHub 账号

如果你还没有 GitHub 账号，请访问 [GitHub](https://github.com) 注册。

### 2. 安装 Git

检查是否已安装 Git：

```bash
git --version
```

如果未安装，请访问 [Git 官网](https://git-scm.com/downloads) 下载安装。

### 3. 配置 Git 用户信息

```bash
# 设置用户名
git config --global user.name "Your Name"

# 设置邮箱（必须与 GitHub 账号一致）
git config --global user.email "your.email@example.com"
```

---

## 初始化 Git 仓库

### 方法 1: 从零开始（推荐）

如果你还没有创建 Git 仓库：

```bash
# 进入项目目录
cd /workspace/projects

# 初始化 Git 仓库
git init

# 查看状态
git status
```

### 方法 2: 从现有仓库克隆

如果已经在 GitHub 上创建了仓库：

```bash
# 克隆仓库
git clone https://github.com/your-username/universal-dns-hub.git

# 进入项目目录
cd universal-dns-hub
```

---

## 配置 .gitignore

项目已经包含了 `.gitignore` 文件，确保以下内容被正确忽略：

### 必须忽略的内容

```gitignore
# 依赖
node_modules/
.next/
.turbo/

# 环境变量（非常重要！）
.env
.env.local
.env.*.local

# 日志
*.log
logs/

# 数据库
*.db
*.db-shm
*.db-wal

# 操作系统文件
.DS_Store
Thumbs.db

# IDE 配置
.vscode/
.idea/
```

### 检查 .gitignore

```bash
# 查看 .gitignore 内容
cat .gitignore

# 检查文件是否被跟踪
git check-ignore -v node_modules
```

---

## 提交代码

### 1. 查看当前状态

```bash
# 查看所有文件状态
git status

# 查看修改内容
git diff
```

### 2. 添加文件到暂存区

```bash
# 添加所有文件
git add .

# 添加特定文件
git add Dockerfile
git add docker-compose.yml
git add src/

# 交互式添加
git add -i
```

### 3. 提交更改

```bash
# 简单提交
git commit -m "Initial commit"

# 详细提交
git commit -m "feat: add Docker deployment configuration

- Add Dockerfile for production build
- Add docker-compose.yml with PostgreSQL
- Configure environment variables
- Add health checks"

# 提交并跳过暂存区
git commit -a -m "Update configuration"
```

### 提交信息规范（Conventional Commits）

使用以下格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型（type）**:
- `feat`: 新功能
- `fix`: 修复 Bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构代码
- `test`: 测试相关
- `chore`: 构建或工具相关

**示例**:

```bash
git commit -m "feat(ai): add intelligent scheduling center"

git commit -m "fix(database): resolve connection pool issue"

git commit -m "docs(deployment): update Docker deployment guide"

git commit -m "refactor(api): migrate from Server Actions to API Routes"
```

---

## 推送到 GitHub

### 1. 在 GitHub 创建新仓库

1. 访问 [GitHub](https://github.com) 并登录
2. 点击右上角的 "+" → "New repository"
3. 填写仓库信息：
   - Repository name: `universal-dns-hub`
   - Description: `多云域名管理系统 - 统一管理 Cloudflare、阿里云、腾讯云等 DNS 服务商`
   - Public/Private: 选择 Public（开源项目）或 Private（私有项目）
4. 点击 "Create repository"

### 2. 连接本地仓库到 GitHub

```bash
# 添加远程仓库
git remote add origin https://github.com/your-username/universal-dns-hub.git

# 查看远程仓库
git remote -v

# 如果使用 SSH（推荐）
git remote set-url origin git@github.com:your-username/universal-dns-hub.git
```

### 3. 推送代码

```bash
# 首次推送（设置上游分支）
git push -u origin main

# 或者如果是 master 分支
git push -u origin master
```

**首次推送可能需要认证**：

- **HTTPS 方式**: GitHub 会要求输入用户名和密码（或 Personal Access Token）
- **SSH 方式**: 需要先配置 SSH 密钥

### 4. 使用 SSH 密钥（推荐）

#### 生成 SSH 密钥

```bash
# 生成新的 SSH 密钥
ssh-keygen -t ed25519 -C "your.email@example.com"

# 启动 ssh-agent
eval "$(ssh-agent -s)"

# 添加密钥到 ssh-agent
ssh-add ~/.ssh/id_ed25519
```

#### 添加公钥到 GitHub

```bash
# 复制公钥
cat ~/.ssh/id_ed25519.pub
```

1. 访问 [GitHub SSH Settings](https://github.com/settings/keys)
2. 点击 "New SSH key"
3. 粘贴公钥内容
4. 点击 "Add SSH key"

#### 测试 SSH 连接

```bash
ssh -T git@github.com
```

---

## 管理远程仓库

### 查看远程仓库

```bash
git remote -v
```

### 更新远程仓库 URL

```bash
# 从 HTTPS 切换到 SSH
git remote set-url origin git@github.com:your-username/universal-dns-hub.git

# 切换回 HTTPS
git remote set-url origin https://github.com/your-username/universal-dns-hub.git
```

### 删除远程仓库

```bash
git remote remove origin
```

---

## 分支管理

### 创建分支

```bash
# 创建新分支
git branch feature/docker-deployment

# 切换到分支
git checkout feature/docker-deployment

# 或者一步到位
git checkout -b feature/docker-deployment
```

### 合并分支

```bash
# 切换到 main 分支
git checkout main

# 合并 feature 分支
git merge feature/docker-deployment

# 删除已合并的分支
git branch -d feature/docker-deployment
```

### 推送分支

```bash
# 推送特定分支
git push origin feature/docker-deployment

# 推送所有分支
git push --all origin
```

---

## 完整工作流程

### 首次提交

```bash
# 1. 进入项目目录
cd /workspace/projects

# 2. 初始化 Git 仓库
git init

# 3. 查看状态
git status

# 4. 添加所有文件
git add .

# 5. 提交更改
git commit -m "feat: initial commit - Universal DNS Hub

- Add Next.js 16 + React 19 project
- Integrate Cloudflare, Aliyun, Tencent DNS providers
- Implement AI intelligent scheduling center
- Add database schema with Drizzle ORM
- Configure Tailwind CSS 4 and shadcn/ui"

# 6. 在 GitHub 创建新仓库

# 7. 添加远程仓库
git remote add origin https://github.com/your-username/universal-dns-hub.git

# 8. 推送到 GitHub
git branch -M main
git push -u origin main
```

### 后续更新

```bash
# 1. 查看修改
git status

# 2. 添加修改的文件
git add .

# 3. 提交更改
git commit -m "fix: resolve AI execution issue

- Create /api/ai/execute route
- Replace Server Actions with API Routes
- Fix serialization issues in Next.js 16"

# 4. 推送到 GitHub
git push
```

---

## 最佳实践

### 1. 提交前检查清单

- [ ] 代码已通过 lint 检查：`pnpm lint`
- [ ] 构建成功：`pnpm build`
- [ ] 敏感信息（API Key、密码）未包含在代码中
- [ ] `.env` 文件已添加到 `.gitignore`
- [ ] 提交信息清晰描述了更改内容

### 2. 使用 .gitignore 保护敏感信息

确保以下文件永远不被提交：

```bash
# 检查是否有敏感文件被跟踪
git ls-files | grep -E "\.env|password|secret|key"

# 如果误提交，从历史记录中删除（危险操作）
git filter-branch --tree-filter 'rm -f .env' HEAD
```

### 3. 使用 Git 分支进行开发

```bash
# 为每个功能创建独立分支
git checkout -b feature/add-alidns-provider

# 完成后合并回 main
git checkout main
git merge feature/add-alidns-provider
```

### 4. 编写有意义的提交信息

```bash
# ❌ 不好的提交信息
git commit -m "update"
git commit -m "fix bugs"
git commit -m "change code"

# ✅ 好的提交信息
git commit -m "feat(dns): add support for Aliyun DNS provider

- Implement Aliyun API integration
- Add credential encryption
- Support A, CNAME, TXT, MX record types"
```

### 5. 定期拉取更新

```bash
# 拉取最新更改
git pull origin main

# 使用 rebase 保持历史记录整洁
git pull --rebase origin main
```

### 6. 使用标签标记版本

```bash
# 创建标签
git tag -a v1.0.0 -m "First stable release"

# 推送标签
git push origin v1.0.0

# 推送所有标签
git push origin --tags
```

---

## 常见问题

### Q: 如何撤销最近一次提交？

```bash
# 撤销提交但保留更改
git reset --soft HEAD~1

# 撤销提交和更改（慎用！）
git reset --hard HEAD~1
```

### Q: 如何修改已推送的提交信息？

```bash
# 修改最近一次提交
git commit --amend

# 强制推送（慎用！）
git push --force origin main
```

### Q: 如何合并多个提交？

```bash
# 交互式变基，合并最近的 3 次提交
git rebase -i HEAD~3

# 在编辑器中将要合并的提交标记为 'squash'
```

### Q: 如何查看提交历史？

```bash
# 查看完整历史
git log

# 查看简洁历史
git log --oneline

# 查看图形化历史
git log --graph --oneline --all

# 查看特定文件的修改历史
git log --follow -- src/app/api/records/route.ts
```

### Q: 忘记添加 .env 文件到 .gitignore，已经提交了怎么办？

```bash
# 1. 立即添加到 .gitignore
echo ".env" >> .gitignore

# 2. 从 Git 中移除（不会删除本地文件）
git rm --cached .env

# 3. 提交更改
git commit -m "chore: add .env to .gitignore"

# 4. 强制推送（会删除 GitHub 上的 .env）
git push --force origin main
```

---

## 附加资源

- [Git 官方文档](https://git-scm.com/doc)
- [GitHub Guides](https://guides.github.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Learn Git Branching](https://learngitbranching.js.org/)

---

## 下一步

提交代码到 GitHub 后，你可以：

1. ✅ 配置 GitHub Pages 展示文档
2. ✅ 设置 GitHub Actions 自动部署
3. ✅ 添加 Issue 模板
4. ✅ 配置 Pull Request 模板
5. ✅ 启用 GitHub Discussions
6. ✅ 添加开源许可证（MIT/Apache 2.0）

祝你使用愉快！🚀
