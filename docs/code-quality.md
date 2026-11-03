# 代码检查与格式化

仓库根目录维护统一配置，覆盖 `apps/`、`packages/` 和 `scripts/`。

## 常用命令

```bash
pnpm lint          # ESLint 检查整个仓库
pnpm lint:fix      # 修复 ESLint 能自动修复的问题
pnpm format:check  # 检查格式，不修改文件
pnpm format        # 使用 Prettier 格式化整个仓库
pnpm typecheck     # TypeScript 类型检查
```

只处理指定文件时，可以使用：

```bash
pnpm exec eslint apps/web/src/components/product-guide.tsx
pnpm exec prettier --write apps/web/src/components/product-guide.tsx
```

ESLint 使用根目录的 `eslint.config.mjs`，包含 JavaScript、TypeScript、React Hooks
以及 Next.js Core Web Vitals 规则。Next.js 规则同时识别 `apps/web` 和 `apps/auth`。
`eslint-config-next` 版本与应用的 Next.js 版本保持一致。

现有代码中的显式 `any`、未使用变量和 effect 内同步更新状态暂按 warning 报告，
便于逐步整改；其他推荐规则继续执行。允许空的 `catch`，用于现有的容错处理。

Prettier 使用 `.prettierrc.json`：两空格缩进、双引号、分号、尾逗号、100 列和 LF 换行。
`eslint-config-prettier` 关闭与格式化冲突的规则，格式问题由 Prettier 统一处理。
生成目录、锁文件、环境变量文件和本地工具目录由 ignore 配置排除。
Prettier 不配置 SQL 插件，数据库迁移的 SQL 内容不在格式化范围内。

接入时保留现有业务文件的格式；`pnpm format:check` 会如实报告历史格式差异。
需要统一历史代码格式时，建议单独执行 `pnpm format`，便于审查纯格式变更。

## VS Code

打开扩展面板，输入 `@recommended`，安装 `.vscode/extensions.json` 推荐的插件：

- ESLint：代码检查与自动修复。
- Prettier：统一格式化。
- Tailwind CSS IntelliSense：Tailwind 类名提示。
- EditorConfig：缩进和换行约定。

工作区已配置保存时使用 Prettier 格式化，并执行 ESLint 自动修复。
已有的文件隐藏、搜索排除等设置继续保留。插件只列为推荐，不会自动安装。
