import { getI18n } from "@kqa/i18n/server";
import { redirect } from "next/navigation";
import { getTenantUser } from "@/lib/tenant-user";
import { effectivePermissions, PERMISSIONS } from "@kqa/auth/permissions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@kqa/ui/components/card";
export default async function AccountPage() {
    const { t } = await getI18n();
    const user = await getTenantUser();
    if (!user)
        redirect("/membership");
    const permissions = effectivePermissions(user);
    return <div className="p-6"><div className="mx-auto flex max-w-3xl flex-col gap-6">
    <div><h1 className="text-xl font-semibold">{t("我的权限")}</h1><p className="mt-1 text-sm text-muted-foreground">{user.tenantName} · {user.name}</p></div>
    <Card>
      <CardHeader><CardTitle>{user.role === "admin" ? t("管理员") : t("成员")}</CardTitle><CardDescription>{t("以下为当前生效的权限，如需调整请联系团队管理员。")}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">{t("基础访问：问答、查看和下载团队文档")}</p>
        {PERMISSIONS.filter((permission) => permissions.includes(permission.key)).map((permission) => <div key={permission.key}><p className="text-sm font-medium">{t(permission.label)}</p><p className="text-sm text-muted-foreground">{t(permission.description)}</p></div>)}
        {!permissions.length && <p className="text-sm text-muted-foreground">{t("暂未分配其他管理权限")}</p>}
      </CardContent>
    </Card>
  </div></div>;
}
