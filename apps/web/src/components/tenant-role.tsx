"use client";
import { useI18n } from "@kqa/i18n";
import { createContext, useCallback, useContext, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hasPermission, type Access, type Permission } from "@kqa/auth/permissions";
import { useTableSubscription } from "@/lib/realtime";
const TenantRoleContext = createContext<Access>({ role: "member", permissions: [] });
type Membership = Access & {
  status: string;
  userId?: string;
};
export function TenantRoleProvider({
  role,
  permissions,
  children,
}: Access & {
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data } = useQuery<Membership>({
    queryKey: ["membership"],
    queryFn: async () => {
      const response = await fetch("/api/membership");
      if (!response.ok) throw new Error(t("成员状态加载失败"));
      return response.json();
    },
    refetchOnWindowFocus: "always",
  });
  // 成员状态变更（被审批、角色/权限调整、移出团队）由 Realtime 推送，替代轮询。
  const userId = data?.userId;
  const onMembershipChange = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["membership"] });
  }, [queryClient]);
  useTableSubscription(
    "tenant_members",
    userId ? `user_id=eq.${userId}` : null,
    onMembershipChange,
  );
  useEffect(() => {
    if (data && data.status !== "active") window.location.assign("/membership");
  }, [data]);
  return (
    <TenantRoleContext.Provider value={data?.status === "active" ? data : { role, permissions }}>
      {children}
    </TenantRoleContext.Provider>
  );
}
export function useTenantRole() {
  return useContext(TenantRoleContext).role;
}
export function useTenantAccess() {
  return useContext(TenantRoleContext);
}
export function usePermission(permission: Permission) {
  return hasPermission(useTenantAccess(), permission);
}
