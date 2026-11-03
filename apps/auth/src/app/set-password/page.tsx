"use client";
import { useI18n } from "@kqa/i18n";
import { useState } from "react";
import { Button } from "@kqa/ui/components/button";
import { Input } from "@kqa/ui/components/input";
export default function SetPassword() {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("保存失败"));
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError(t("网络异常，请稍后重试"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("设置登录密码")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("邮箱验证成功后，设置你的密码即可使用团队知识库。")}
      </p>
      <form onSubmit={submit} className="space-y-4">
        <label htmlFor="password">{t("新密码")}</label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          maxLength={128}
          required
          autoComplete="new-password"
        />
        {error && <p role="alert">{t(error)}</p>}
        <Button disabled={saving}>{saving ? t("保存中…") : t("保存并登录")}</Button>
      </form>
    </main>
  );
}
