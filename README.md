# 企业知识问答助手（Knowledge QA Assistant）

线上演示部署见 [Vercel 免费地址 + Supabase 部署指南](docs/deploy-vercel.md)。`apps/web` 已包含同域认证入口，线上只需部署一个 Next.js 应用；本地仍支持下面的双应用运行方式。

基于 Next.js App Router、React、Supabase JS 和 LangChain 的多租户 RAG 应用。上传文档后，原文件存入 **Supabase Storage**，解析文本存入 **PostgreSQL**，向量分块存入同一数据库的 **pgvector**；问答时按团队和文档权限召回，流式生成答案并展示引用。

> 默认使用**当前项目独立的本地 Supabase**：PostgreSQL、pgvector、Auth 和 Storage 全部运行于本机 Docker，和线上项目隔离。`supabase-js` 是应用使用的客户端 SDK；本地服务由 Supabase CLI 启动。旧 Postgres / Redis / Milvus / MinIO 配置保存在 [docs/legacy/docker-compose.yml](docs/legacy/docker-compose.yml)，仅供旧数据迁移参考。

## 本地查看入口

本机已使用独立项目 `knowledge-qa-assistant`，与云端及其他本地 Supabase 项目分开。

| 查看内容                | 打开位置                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------- |
| 业务表、SQL、Auth 用户  | [本地 Studio](http://127.0.0.1:55323) → Table Editor / SQL Editor / Authentication |
| pgvector 向量与分块原文 | Studio → Table Editor → `public.document_chunks`                                   |
| 上传的原文件            | Studio → Storage → `kqa-documents`                                                 |
| 注册验证邮件            | [本地测试收件箱](http://127.0.0.1:55324)                                           |

如果页面打不开，在仓库根目录运行 `pnpm supabase:start`；开发网页另运行 `pnpm dev`。停止服务用 `pnpm supabase:stop`，会保留本地数据。

使用 DBeaver / DataGrip / VS Code 数据库插件连接时填写：Host `127.0.0.1`、Port `55322`、Database `postgres`、User `postgres`、Password `postgres`、SSL 关闭。该端口是 PostgreSQL 协议端口，不能当网页打开。

## 运行项目

要求：Node.js 22+、pnpm 11、Docker Desktop（已启动）和 Supabase CLI。

在仓库根目录操作：

```bash
pnpm install

# 首次配置才复制；已有 .env 时直接编辑，避免覆盖现有密钥。
cp .env.example .env

# 启动当前项目的本地 Supabase；首次启动自动应用数据库迁移。
# 脚本会将本地 URL 和本地密钥写入 .env，不使用云端 key。
pnpm supabase:start

# 启动 auth 和 web 两个 Next.js 应用。
pnpm dev
```

已有 `.env` 的项目跳过复制步骤。云端配置已备份在 Git 忽略的 `.env.cloud.local`；本地开发不要复制回 `.env`。两个应用通过 `apps/auth/.env.local` 和 `apps/web/.env.local` 读取根目录 `.env`；修改后重启开发服务。

| 入口                                              | 地址                                               |
| ------------------------------------------------- | -------------------------------------------------- |
| 本地 Supabase Studio（表 / SQL / Storage / Auth） | http://127.0.0.1:55323                             |
| 本地邮件收件箱（Mailpit）                         | http://127.0.0.1:55324                             |
| Supabase API                                      | http://127.0.0.1:55321                             |
| PostgreSQL / pgvector                             | `127.0.0.1:55322`，数据库/用户/密码均为 `postgres` |
| 注册、登录                                        | http://auth.lvh.me:3001                            |
| 主应用                                            | http://app.lvh.me:3100                             |
| 文档上传与预览                                    | http://app.lvh.me:3100/documents                   |
| 问答                                              | http://app.lvh.me:3100/chat                        |
| 模型配置                                          | http://app.lvh.me:3100/settings                    |
| 团队审批与权限                                    | http://app.lvh.me:3100/team                        |

应用登录页面统一使用 `*.lvh.me`，配合 `COOKIE_DOMAIN=.lvh.me` 共享登录 Cookie。不要在 `localhost` 和 `lvh.me` 之间混用登录地址。

### 必填配置

| 变量                           | 用途                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `APP_ENV`                      | 本地固定为 `local`；非生产环境会拒绝远程 Supabase 地址                           |
| `SUPABASE_URL`                 | 本地固定为 `http://127.0.0.1:55321`                                              |
| `SUPABASE_PUBLISHABLE_KEY`     | `supabase:start` 自动生成的本地 publishable / anon key                           |
| `SUPABASE_SECRET_KEY`          | 自动生成的本地 secret / service_role key，仅服务端使用                           |
| `DIRECT_DATABASE_URL`          | 本地 `postgresql://postgres:postgres@127.0.0.1:55322/postgres`，供迁移和测试使用 |
| `AUTH_APP_URL` / `WEB_APP_URL` | 两个应用的对外地址                                                               |
| `COOKIE_DOMAIN`                | 本地为 `.lvh.me`                                                                 |
| `LLM_*` / `EMBEDDING_*`        | 对话模型和专用 Embedding 模型，支持 OpenAI 兼容接口                              |

`SUPABASE_SECRET_KEY`、数据库密码、SMTP 密码不能放到 `NEXT_PUBLIC_*` 变量中。业务请求通过 `supabase-js` 访问数据，`DIRECT_DATABASE_URL` 不用于日常 API 查询。

`db:migrate` 会记录迁移版本，重复执行会跳过已应用版本；遇到未纳入迁移历史的同名业务表时会拒绝覆盖。本地 Supabase 启动后，可执行 `pnpm test:db` 在回滚事务内验证权限和事务行为。

## 去哪里看数据

打开 **http://127.0.0.1:55323** 即可查看本项目数据，不需要访问云端 Dashboard。Table Editor、SQL Editor、Storage 和 Authentication 都在该本地 Studio 中。

| 想查看的内容                   | 控制台位置                        | 表 / bucket                          |
| ------------------------------ | --------------------------------- | ------------------------------------ |
| 登录账号、邮箱确认状态         | Authentication → Users            | Supabase Auth 用户                   |
| 用户资料、团队和权限           | Table Editor → `public`           | `users`、`tenants`、`tenant_members` |
| 文档名称、解析文本、处理状态   | Table Editor → `public`           | `documents`                          |
| 分块原文、向量、模型标识       | Table Editor → `public`           | `document_chunks`                    |
| 向量化任务、失败原因、重试次数 | Table Editor → `public`           | `document_jobs`                      |
| 会话和消息                     | Table Editor → `public`           | `conversations`、`messages`          |
| 团队模型配置                   | Table Editor → `public`           | `model_settings`，其中含敏感 API key |
| 原始上传文件                   | Storage → Files → `kqa-documents` | 私有 bucket                          |
| 用户头像                       | Storage → Files → `kqa-avatars`   | 私有 bucket                          |

**pgvector 就在 Supabase 的 PostgreSQL 内，没有单独的向量数据库控制台，也不再使用 Attu。** 通过 Table Editor 查看行，通过 SQL Editor 检查向量和召回结果。

### 查看文档处理状态

在 Supabase **SQL Editor** 执行：

```sql
select id, tenant_id, filename, status, chunk_count, error,
       object_key, created_at
from public.documents
where deleted_at is null
order by created_at desc;

select document_id, status, attempts, locked_until, error
from public.document_jobs
order by created_at desc;
```

正常流程是 `pending → processing → ready`，此时 `chunk_count > 0`。失败时查看 `documents.error` 和 `document_jobs.error`，修正模型配置后在文档页点击重试。本地隔离模式默认只允许本机模型（例如 Ollama），避免把文档发给远程模型服务；确需远程模型时才显式设置 `ALLOW_REMOTE_AI=true`。

### 查看 pgvector 分块和维度

```sql
-- 确认扩展已启用。
select extname, extversion from pg_extension where extname = 'vector';

-- 每份文档的实际分块数。
select d.id, d.filename, d.status, d.chunk_count,
       count(c.id) as stored_chunks
from public.documents d
left join public.document_chunks c on c.document_id = d.id
where d.deleted_at is null
group by d.id
order by d.created_at desc;

-- 分块原文、向量维度及对应 Embedding 模型。
select document_id, chunk_index, left(content, 300) as content_preview,
       extensions.vector_dims(embedding) as dimensions,
       embedding_model
from public.document_chunks
order by document_id, chunk_index
limit 50;
```

想看完整向量时，按分块 ID 查询 `embedding::text`。向量是浮点数组；正常业务排查通常看分块原文、维度和召回分数即可。

下面用已有分块的向量做一次自相似检索，验证 pgvector 查询链路。把 UUID 换成实际 `document_chunks.document_id`：

```sql
select match.*
from (
  select embedding, tenant_id, embedding_model, document_id
  from public.document_chunks
  where document_id = '替换为文档UUID'::uuid
  order by chunk_index
  limit 1
) source
cross join lateral public.match_document_chunks(
  source.embedding, source.tenant_id, source.embedding_model,
  4, array[source.document_id]
) match;
```

`score` 是余弦相似度，越高越相关。不同 Embedding 服务/模型或向量维度的数据不会混合召回。更换 Embedding 模型后需重新向量化对应文档；当前检索为 pgvector 精确余弦检索。

SQL Editor 使用数据库管理权限，能看到跨团队数据；它不能证明普通用户的 RLS 权限正确。使用下文的 `pnpm test:db` 验证隔离和权限。

### 本地在哪里看上传文件

**新文件存入本机 Supabase Storage 的 Docker 数据卷，不会上传到云端，也不位于仓库的 `uploads/` 或 `data/` 目录。**

- 文件卷：`supabase_storage_knowledge-qa-assistant`（容器挂载 `/mnt`）。
- 数据库卷：`supabase_db_knowledge-qa-assistant`。
- macOS 上数据卷位于 Docker Desktop 管理的虚拟机内。查看文件优先用本地 Studio 的 Storage；也可在 Docker Desktop → Volumes 找到上述卷。不要直接修改数据库卷文件。

- 控制台：Storage → `kqa-documents` → `<tenantId>/<documentId>/original.<扩展名>`，可预览或下载。
- 本地网页：打开 `/documents`，预览或下载对应文档。
- 登录后的原文件下载接口：`GET /api/documents/<文档UUID>/content?download=1`。
- `documents.object_key` 是 Storage 内路径，`object_url` 的 `supabase://...` 是记录用标识，不能直接当浏览器下载链接。

两个 bucket 都是私有的，不能通过拼接公开 URL 匿名下载。下载接口会校验登录身份、团队归属和文档状态。

如果找的是**迁移前**上传的文件，旧 MinIO 运行时可在 http://localhost:9001 查看原 bucket；默认旧账号为 `minioadmin` / `minioadmin`。这些文件不会因新代码启动而自动搬迁，需要执行旧数据迁移。

## 验证上传、向量化和召回

1. 启动应用，登录有上传权限的团队账号。
2. 上传一个小 TXT 或 Markdown 文件，内容写一条明确事实，例如「测试项目的报销提交日为每月 18 日」。
3. 在文档页等待状态变为 `ready`；同时在 SQL Editor 检查 `documents`、`document_jobs` 和 `document_chunks`。
4. 打开问答页，选择该文档，提问「报销提交日是几号？」。
5. 检查答案、引用原文及引用的文档是否一致。点击引用应能查看相应原文。
6. 换一个团队账号，确认无法列出、下载或召回前一团队的文档。

文档和任务在一个数据库事务中创建；Next.js `after()` 在响应后处理向量化。若进程退出导致任务中断，可手动恢复：

```bash
pnpm ingest:pending
```

生产环境应定时携带 `Authorization: Bearer <INGEST_CRON_SECRET>` 请求 `POST /api/internal/ingest`。任务采用 5 分钟租约；过期任务可再次领取，连续超时达到上限后标为失败，供手动重试。不要把 cron secret 写进公开前端。

### 自动检查

```bash
pnpm typecheck
pnpm --filter @kqa/auth test
pnpm test:db
pnpm build
```

`test:db` 使用真实 Supabase 数据库连接，在事务中创建临时测试数据并回滚，覆盖跨团队访问、待审批限制、向量检索过滤、管理权限撤销、最后一位管理员保护和任务租约；不发送邮件，不保留测试用户。

## 本地服务的停止、重启与环境隔离

```bash
pnpm supabase:status       # 查看本项目的本地服务状态
pnpm supabase:stop         # 停止当前项目，保留数据卷
pnpm supabase:start        # 再次启动并同步本地 .env
pnpm supabase:env          # 只重新同步本地 URL / key
pnpm db:migrate           # 已启动后应用新增迁移，跳过已应用版本
```

`supabase/config.toml` 固定项目名和 `553xx` 端口，避开电脑上其他项目的 `543xx` 服务。普通本地启动不会链接、拉取或推送云端数据；迁移脚本也会拒绝远程数据库目标。

不要用 `supabase db reset` 代替日常启动：reset 会清空本地数据库再重放迁移。线上部署应使用独立环境文件、线上密钥和 `APP_ENV=production`；不要将云端配置覆盖到开发 `.env`。

## 远程数据库迁移（GitHub Actions）

工作流 [Deploy database migrations](.github/workflows/deploy-database.yml) 在 `main` 收到 `supabase/migrations/**` 或工作流文件的变更时自动运行。它使用固定版本的 Supabase CLI，依次关联远程项目、列出迁移历史、预览待执行迁移、应用迁移，再列出历史。GitHub Actions 日志中的最后一步可用于核对本地文件与远程记录；它不替代业务功能验证。

首次使用前，在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret** 配置：

| Secret                  | 内容                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Supabase 个人访问令牌，建议限定到目标项目；`link` 所需的 Project Settings、API Keys、API Key Secrets 均授予 Read 权限 |
| `SUPABASE_DB_PASSWORD`  | 远程 Supabase 项目的数据库密码，不是 anon / publishable / service_role key                                            |
| `SUPABASE_PROJECT_REF`  | 生产项目引用，即 Dashboard 地址 `/project/<project-ref>` 中的值                                                       |

配置方式参考 [Supabase 官方 GitHub Actions 指南](https://supabase.com/docs/guides/deployment/managing-environments#configure-github-actions)。Secrets 不要写入仓库或开发 `.env`。

日常流程：

1. 新建 migration，将 SQL 放入 `supabase/migrations/`，在本地应用并验证。
2. 将迁移文件随 PR 合并到 `main`，触发自动发布。
3. 在 GitHub **Actions → Deploy database migrations** 查看执行结果。需要重试或补发时，选择 **Run workflow → main**；其他分支的手动运行会跳过发布。

工作流只执行远程尚未记录的迁移，不复制本地业务数据、不执行 seed，也不发布 Auth 配置或邮件模板。多个发布串行运行，正在执行的迁移不会被新提交取消。重跑会重新核对远程迁移历史；失败后应先查看日志和数据库实际状态再重试。

首次接入已有远程数据库时，先核对初始化迁移 `20261101122943_supabase_platform.sql` 与远程 schema 和迁移历史；若远程已有相同表而缺少历史，先人工确认基线再启用自动发布。工作流不会自动修复历史或重置数据库。已发布的迁移不要修改，后续修复使用新迁移。

## 本地 SMTP 与注册

当前通过 Supabase Auth 管理密码和邮箱确认，Next.js 使用共享的 httpOnly Cookie 维持会话。新团队的创建者成为管理员；申请已有团队需要审批，角色和权限来自数据库实时记录。

默认注册邮件由本地 Supabase 投递到 **http://127.0.0.1:55324** 的测试收件箱。可以用测试邮箱完成注册、点击验证链接后自动登录；**默认不向真实邮箱外发**，不会验证线上个人信息。

若要测试真实收件，再在本地 `.env` 配置 SMTP：

```dotenv
SMTP_HOST=你的SMTP服务器
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=你的SMTP账号
SMTP_PASSWORD=你的SMTP密码
SMTP_FROM=已验证的发件地址
```

填写 `SMTP_HOST` 后，由 Next.js 通过此 SMTP 发送注册验证链接，不修改云端 Supabase 的 SMTP 设置。465 端口通常配 `SMTP_SECURE=true`；587 使用 STARTTLS。未配置 `SMTP_HOST` 时走本地 Supabase 的邮件捕获服务；在本地收件箱查看邮件。不会在日志或响应中返回验证码来代替邮件。

本地 `supabase/config.toml` 已配置允许的回调地址及验证码邮件模板：

- `http://auth.lvh.me:3001/api/auth/callback`
- `http://auth.lvh.me:3001/auth/confirm`

注册表单仅填写企业/团队名称、邮箱、密码和确认密码；姓名默认取邮箱 `@` 前的部分。提交注册后发送邮件，点击验证链接后由 Supabase 验证并自动登录，无需手动输入验证码。团队导入的新账号收到邀请后自行设置密码。

环境通过服务端 `APP_ENV` 区分：本地（非 `production`）发送验证邮件；线上显式设置 `APP_ENV=production`，由服务端创建已确认账号，随后密码登录并完成团队设置，不发送注册邮件。服务端需要配置 `SUPABASE_SECRET_KEY` 或 `SUPABASE_SERVICE_ROLE_KEY`。

SMTP 变量应配置在运行认证应用的环境中（例如 `apps/auth/.env.local`）。只做本地捕获测试时无需填写 SMTP 配置，打开本地收件箱即可。

## 迁移旧本地数据

仅在需要保留旧 Docker 数据时执行。先确保旧 `kqa-postgres` 和 `kqa-minio` 可访问，并先启动新的本地 Supabase：

```bash
pnpm migrate:legacy
pnpm ingest:pending
```

迁移脚本会：

- 将旧库备份到被 Git 忽略的 `.migration-backups/`，文件中包含私有数据和密码哈希。
- 保留用户 UUID、密码哈希、团队、权限、会话、消息、通知、模型设置和 API key 哈希。
- 将原文件和头像复制到 Supabase Storage；将向量化任务加入本地任务表，随后由 `ingest:pending` 从解析文本重建 pgvector 分块。
- 验证各表迁入新本地实例后的行数；不停止旧容器、不删除旧数据库或文件。

旧账号原先没有邮箱验证记录，迁移不会伪造「邮箱已验证」。后续首次使用需完成邮箱验证；按当前约定暂不自动发送邮件。备份还原或确认新本地迁移结果前，请保留旧服务和数据卷。

## 项目结构

```text
apps/auth/          注册、登录、邀请确认、密码设置（端口 3001）
apps/web/           问答、文档、团队、权限、模型设置（端口 3100）
packages/db/        Supabase JS 客户端、数据映射和应用类型
packages/auth/      Supabase SSR 会话、权限规则、本地 SMTP 发信
packages/ai/        文档解析、切分、Embedding 和 pgvector 召回
packages/ui/        共享 UI 组件
supabase/migrations/ PostgreSQL 表、RLS、Storage 策略和事务 RPC
scripts/           数据迁移、旧数据复制、任务处理、数据库验证
docs/legacy/       旧 Docker 方案与迁移前说明
```

旧架构说明见 [docs/legacy/README-before-supabase.md](docs/legacy/README-before-supabase.md)。不要用旧文档中的 `docker:up`、Drizzle 或 Attu 命令启动当前架构。
