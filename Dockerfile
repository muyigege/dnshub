# Universal DNS Hub - Dockerfile
# 基于 Node.js 24 的生产环境镜像

FROM node:24-slim AS base

# 设置 CI 环境变量，防止 pnpm 交互式提示阻塞构建
ENV CI=true

# 设置工作目录
WORKDIR /app

# 复制依赖文件和配置文件
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./

# 安装 pnpm
RUN npm install -g pnpm

# 安装项目依赖（pnpm-workspace.yaml 已配置 allowBuilds）
RUN pnpm install

# 复制项目代码
COPY . .

# 创建 data 目录（构建时需要数据库文件）
RUN mkdir -p /app/data

# 构建生产版本
RUN pnpm build

# 生产环境镜像
FROM node:24-slim AS production

WORKDIR /app

# 先创建非 root 用户（COPY --chown 比构建后 chown -R 快几十倍）
RUN useradd -m -u 1001 appuser

# 安装 pnpm（生产环境启动需要）
RUN npm install -g pnpm

# 从构建阶段复制文件，直接用 --chown 设置属主，避免缓慢的 chown -R
COPY --from=base --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=base --chown=appuser:appuser /app/.next ./.next
COPY --from=base --chown=appuser:appuser /app/src ./src
COPY --from=base --chown=appuser:appuser /app/package.json ./package.json
COPY --from=base --chown=appuser:appuser /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=base --chown=appuser:appuser /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=base --chown=appuser:appuser /app/.npmrc ./.npmrc
COPY --from=base --chown=appuser:appuser /app/tsconfig.json ./tsconfig.json
COPY --from=base --chown=appuser:appuser /app/next.config.* ./

# 创建持久化数据目录并设置属主（只有 data 目录需要运行时写权限）
RUN mkdir -p /app/data && chown appuser:appuser /app

USER appuser

# 暴露端口
EXPOSE 5000

# 设置环境变量
ENV CI=true
ENV NODE_ENV=production
ENV PORT=5000

# 启动应用
CMD ["pnpm", "start"]
