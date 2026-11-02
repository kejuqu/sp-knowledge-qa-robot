"use client";
import { useI18n } from "@kqa/i18n";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@kqa/ui/components/button";
import { Input } from "@kqa/ui/components/input";
import { Label } from "@kqa/ui/components/label";
import { TooltipHint, TooltipProvider } from "@kqa/ui/components/tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@kqa/ui/components/card";
import { BookOpenCheck, CircleHelp } from "lucide-react";
const WEB_APP_URL = process.env.NEXT_PUBLIC_WEB_APP_URL ?? "http://app.lvh.me:3100";
export default function SignUpPage() {
    const { t } = useI18n();
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError("");
        setMessage("");
        setLoading(true);
        const form = new FormData(e.currentTarget);
        if (form.get("password") !== form.get("confirmPassword")) {
            setError(t("两次输入的密码不一致"));
            setLoading(false);
            return;
        }
        try {
            const res = await fetch("/api/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: form.get("email"),
                    confirmPassword: form.get("confirmPassword"),
                    password: form.get("password"),
                    tenantName: form.get("tenantName"),
                }),
            });
            const data = await res.json();
            setLoading(false);
            if (!res.ok) {
                setError(data.error ?? t("注册失败"));
                return;
            }
            if (data.requiresEmailConfirmation) {
                setMessage(t("验证邮件已发送，请点击邮件中的链接，验证成功后会自动登录。也请检查垃圾邮件。"));
                return;
            }
            window.location.href = data.membershipStatus === "active" ? WEB_APP_URL : `${WEB_APP_URL}/membership`;
        }
        catch {
            setError(t("网络异常，请稍后重试"));
        }
        finally {
            setLoading(false);
        }
    }
    return (<div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-20">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpenCheck className="size-5"/>
          </div>
          <CardTitle className="text-xl">{t("创建账号")}</CardTitle>
          <CardDescription>{t("创建新团队，或申请加入已有团队")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="tenantName">{t("企业/团队名称")}</Label>
                <TooltipProvider>
                  <TooltipHint content={t("名称不存在时创建团队；已有同名团队时，需管理员审批后加入")}>
                    <Button type="button" variant="ghost" size="icon" className="size-5" aria-label={t("企业/团队名称说明")}>
                      <CircleHelp />
                    </Button>
                  </TooltipHint>
                </TooltipProvider>
              </div>
              <Input id="tenantName" name="tenantName" required maxLength={120} placeholder={t("例如：Acme 科技")}/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("邮箱")}</Label>
              <Input id="email" name="email" type="email" required placeholder="you@corp.com"/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("密码")}</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} placeholder={t("请输入你的密码")}/>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("确认密码")}</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} placeholder={t("请再次输入密码")}/>
            </div>
            {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
            {error && <p className="text-sm text-destructive">{t(error)}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("注册中…") : t("注册")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">{t("已有账号？")}{" "}
              <Link href="/signin" className="text-primary underline-offset-4 hover:underline">{t("登录")}</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>);
}
