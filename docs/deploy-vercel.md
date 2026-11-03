# 使用免费 Vercel 地址部署

适用于个人、非商业演示。Vercel Hobby 的用途和额度以官方条款为准；模型 API 费用另计。

## 架构

只部署 `apps/web` 一个 Next.js 应用。它复用 `apps/auth` 的登录、注册、密码设置和认证接口源码，页面和 API 均位于同一个 `https://<项目名>.vercel.app` 域名。`apps/auth` 仍可用于现有双应用本地开发，但无需另建 Vercel 项目。

不要将 Cookie Domain 设置为 `.vercel.app`，也不要沿用本地的 `.lvh.me`；生产环境 `COOKIE_DOMAIN` 留空。所有 AUTH / WEB URL 都指向同一个正式站点。修改 `NEXT_PUBLIC_*` 后需要重新构建部署。

## 1. 准备云端 Supabase

1. 创建 Supabase 项目，记录项目 URL、publishable key、server secret key 和数据库密码。
2. GitHub 仓库 Settings → Secrets and variables → Actions → Secrets 添加 `SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD`、`SUPABASE_PROJECT_REF`。Access token 使用限定目标项目的权限。
3. 将代码合并到 `main` / `master` 后，在 Actions 手动运行 **Deploy database migrations**。首次接入已有数据库先核对基线迁移和远程历史，避免同名表冲突。
4. 确认迁移成功，Storage 中存在私有的 `kqa-documents` 和 `kqa-avatars` bucket。文档 bucket 大小限制应为 20 MiB；初始化迁移对已存在的 bucket 不会覆盖设置。

该流程只发布数据库迁移，不搬迁本地数据、文件，不发布 Auth Dashboard 设置。

## 2. 配置 Vercel

在 Vercel 导入 GitHub 仓库，创建项目：

| 设置                                               | 值                                       |
| -------------------------------------------------- | ---------------------------------------- |
| Framework Preset                                   | Next.js                                  |
| Root Directory                                     | `apps/web`                               |
| Include source files outside of the Root Directory | 开启（共享包和认证源码位于目录外）       |
| Install Command                                    | `pnpm install --frozen-lockfile`         |
| Build Command                                      | `pnpm build`                             |
| Output Directory                                   | 默认 `.next`                             |
| Node.js                                            | 22.x                                     |
| Fluid Compute                                      | 开启，确认 Hobby 的函数最长时间为 300 秒 |
| Production Branch                                  | 与数据库发布分支一致                     |

项目根目录 `package.json` 固定了 pnpm 版本；如构建器提示不支持该版本，先核实 Vercel 的 Corepack 支持并按其当前文档开启，不要删锁文件或混用 npm。

`apps/web/vercel.json` 已配置 Next.js 和 API 函数最长 300 秒。Vercel 自动分配免费的 `*.vercel.app` 地址和 HTTPS；无需购买域名。

把根目录 `.env.production.example` 中的变量填写到 Vercel **Production** 环境。四个应用 URL 使用实际分配的正式域名，不包含路径或末尾斜线。服务端密钥不得加 `NEXT_PUBLIC_` 前缀。模型和 Embedding 地址必须是部署环境可访问的远程服务，不能继续使用开发电脑的 `127.0.0.1`。

首次分配域名后填写 URL 并重新部署。不要给任意 PR Preview 注入生产 Supabase secret；预览环境需要独立 Supabase 项目和相应 URL，或者不启用带真实数据的预览。

## 3. 配置认证

Supabase Dashboard → Authentication → URL Configuration：

- Site URL：`https://<项目名>.vercel.app`
- Redirect URLs 添加以下精确地址：
  - `https://<项目名>.vercel.app/api/auth/callback`
  - `https://<项目名>.vercel.app/api/auth/confirm`
  - `https://<项目名>.vercel.app/auth/confirm`
  - `https://<项目名>.vercel.app/set-password`

当前代码在 `APP_ENV=production` 下直接创建已确认的注册账号，不发送注册验证邮件；这是原有产品行为。邀请等邮件功能仍需单独配置云端邮件服务及相应模板，数据库工作流不会同步本地模板。

## 4. 启用文档任务恢复

GitHub 仓库 Actions 配置：

- **Variable** `PRODUCTION_WEB_URL`：`https://<项目名>.vercel.app`
- **Secret** `INGEST_CRON_SECRET`：与 Vercel 中完全一致的随机长密钥，例如使用 `openssl rand -hex 32` 生成。

工作流 **Recover document jobs** 每 15 分钟调用一次 `POST /api/internal/ingest`，也可手动运行。不配置 URL 时跳过执行。每次领取一个任务，避免在一个函数内串行处理多个大文档。

GitHub 定时工作流只在默认分支执行，可能延迟；公共仓库长期无活动也可能被停用。它适合演示恢复，不保证实时执行。私有仓库受 Actions 免费分钟数限制。若站点开启了 Vercel Deployment Protection，需允许此入口的机器调用；否则恢复工作流会失败。

## 文件处理方式和限制

- 浏览器先请求上传凭证，再将文件直接上传到 Supabase Storage，最后把签名 ticket 发给 Next.js 解析入库。服务器重新核对当前团队权限、凭证归属、有效期和真实文件大小；不会接受浏览器任意指定 Storage 路径。
- 完成接口保留旧 multipart 上传以兼容已有客户端；Vercel 上应使用新的直传流程。
- 文件最大 20 MiB。解析后由 `after()` 尝试处理一个向量化任务，超时任务由租约和恢复工作流重新领取。大型文档仍可能超过 300 秒，需要减小文档或改用独立 worker。
- 原文件下载和 PDF 预览校验权限后跳转到 60 秒有效的 Storage 签名链接。链接在有效期内可被持有者访问；不将其写入日志或持久化。
- HTML / DOCX 预览仍由服务端转换和清理，特别大的预览 HTML 仍受函数响应大小限制。
- 用户取消上传、文件解析失败或重复文件检测失败可能留下未关联的 Storage 对象。演示阶段可在 Dashboard 人工清理；清理时仅删除没有 `documents.object_key` 关联且已超过上传凭证有效期的对象，不删除正在上传的文件。

## 验证与后续发布

1. 未登录访问 `/chat` 应跳转同域 `/signin`；登录和注册页面应正常打开。
2. 注册测试团队，确认登录后可以进入文档页；退出后业务 API 返回 401。
3. 上传小 TXT，等待 ready，然后问一个文档中明确可回答的问题。
4. 上传大于 4.5 MB、小于 20 MiB 的可解析文档，确认浏览器文件请求直接到 Storage，文档完成入库。
5. 验证 PDF 预览、原文件下载，以及另一个团队无法访问该文件。
6. 手动运行 **Recover document jobs**，确认返回 `processed`，而不带正确 secret 的接口调用返回 401。

后续推送会触发 Vercel 自动发布；数据库工作流仍独立执行。涉及新 schema 的变更先发布兼容迁移，成功后再发布依赖新 schema 的应用代码，不依赖两个平台的自动运行先后顺序。

免费 Supabase 数据库空间还包含向量和索引；留意数据库、Storage 和流量额度。低活跃的免费项目可能暂停，演示前需确认项目在线。
