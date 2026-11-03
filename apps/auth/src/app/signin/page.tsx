"use client";
import { useI18n } from "@kqa/i18n";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@kqa/ui/components/button";
import { Input } from "@kqa/ui/components/input";
import { Label } from "@kqa/ui/components/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@kqa/ui/components/card";
import { BookOpenCheck } from "lucide-react";
const WEB_APP_URL = process.env.NEXT_PUBLIC_WEB_APP_URL ?? "http://app.lvh.me:3100";
export default function SignInPage() {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? t("登录失败"));
      return;
    }
    // 登录成功，跳回主应用（cookie 已写在父域名上，子域名直接生效）
    window.location.href =
      data.membershipStatus === "active" ? WEB_APP_URL : `${WEB_APP_URL}/membership`;
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-20">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpenCheck className="size-5" />
          </div>
          <CardTitle className="text-xl">{t("企业知识问答助手")}</CardTitle>
          <CardDescription>{t("登录统一认证中心")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("邮箱")}</Label>
              <Input id="email" name="email" type="email" required placeholder="you@corp.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("密码")}</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {error && <p className="text-sm text-destructive">{t(error)}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("登录中…") : t("登录")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t("还没有账号？")}{" "}
              <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
                {t("注册")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
