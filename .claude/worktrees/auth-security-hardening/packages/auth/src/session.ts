/**
 * 跨子域名共享会话的约定：
 * - auth app 登录成功后，把 JWT 写进 httpOnly cookie，Domain=<父域名>（本地为 .lvh.me）
 * - 所有 *.父域名 的子应用（web/auth/未来的其它 app）都能读到同一个 cookie
 * - 各 app 用同一个 AUTH_SECRET 校验签名，无需互相调用
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "kqa_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天
export const SESSION_ISSUER = "kqa-auth"; // 本系统签发的标识,防止其它系统用同密钥签的 token 被混用
export const SESSION_AUDIENCE = "kqa"; // 接受方标识;未来按 app 细分 audience 时在此扩展

export interface SessionPayload {
  sub: string; // user id
  email: string;
  name: string;
  tenantId: string;
  tenantName: string;
  role: "admin" | "member";
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

// 允许作为会话 Cookie 父域的白名单。只认代码里的固定值,不接受任何请求输入或不受信的环境来源,
// 防止 Host 头/配置注入把会话 Cookie 写到攻击者控制的域名。生产部署时把真实父域加进这个集合。
const ALLOWED_COOKIE_DOMAINS = new Set([".lvh.me", "localhost"]);

export function getCookieDomain(): string {
  const domain = process.env.COOKIE_DOMAIN || ".lvh.me";
  if (!ALLOWED_COOKIE_DOMAINS.has(domain)) {
    throw new Error(`COOKIE_DOMAIN "${domain}" 不在白名单内,拒绝用作 Cookie 域名`);
  }
  return domain;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    tenantId: payload.tenantId,
    tenantName: payload.tenantName,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: SESSION_ISSUER, audience: SESSION_AUDIENCE });
    // 老版本 token（无租户字段）视为无效，强制重新登录
    if (!payload.sub || !payload.tenantId) return null;
    return {
      sub: payload.sub,
      email: payload.email as string,
      name: payload.name as string,
      tenantId: payload.tenantId as string,
      tenantName: payload.tenantName as string,
      role: payload.role as "admin" | "member",
    };
  } catch {
    return null;
  }
}
