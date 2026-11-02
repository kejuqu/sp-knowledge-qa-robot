"use client";
import { createContext, useContext } from "react";
const defaults = { close: "关闭", resizeSidebar: "调整侧栏宽度", expandSidebar: "展开侧栏", collapseSidebar: "收起侧栏", openNavigation: "打开导航", closeNavigation: "关闭导航", closeOverlay: "关闭导航遮罩" };
const Context = createContext(defaults);
export function UIStringsProvider({ labels, children }: { labels: typeof defaults; children: React.ReactNode }) {
  return <Context.Provider value={labels}>{children}</Context.Provider>;
}
export function useUIStrings() { return useContext(Context); }
