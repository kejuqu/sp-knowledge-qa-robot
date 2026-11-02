"use client";
import { useI18n } from "@kqa/i18n";
import { usePermission } from "@/components/tenant-role";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
/** 前端可选择的文件类型（与服务端 @kqa/ai 的 SUPPORTED_EXTENSIONS 对齐） */
export const ACCEPT_STRING = ".txt,.md,.markdown,.html,.htm,.pdf,.docx";
export interface UploadTask {
    id: string;
    name: string;
    progress: number;
}
export function useDocumentUpload() {
    const { t } = useI18n();
    const canUpload = usePermission("documents.upload");
    const [tasks, setTasks] = useState<UploadTask[]>([]);
    const [error, setError] = useState("");
    const queryClient = useQueryClient();
    const seq = useRef(0);
    function updateTask(id: string, patch: Partial<UploadTask>) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    }
    function removeTask(id: string) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
    }
    /** Storage receives the bytes directly; Next.js only receives metadata and the ticket. */
    async function uploadFile(file: File, id: string) {
        try {
            if (!file.size || file.size > 20 * 1024 * 1024)
                throw new Error(t("文件不能为空且不能超过 20MB"));
            const prepare = await fetch("/api/documents/upload", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: file.name, size: file.size }),
            });
            const prepared = await prepare.json();
            if (!prepare.ok)
                throw new Error(prepared.error ?? t("无法创建上传凭证"));
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("PUT", prepared.uploadUrl);
                xhr.timeout = 120000;
                xhr.setRequestHeader("x-upsert", "false");
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable)
                        updateTask(id, { progress: Math.round(event.loaded / event.total * 90) });
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300)
                        resolve();
                    else
                        reject(new Error(t("文件存储失败，请重新上传")));
                };
                xhr.onerror = () => reject(new Error(t("网络错误，上传失败")));
                xhr.ontimeout = () => reject(new Error(t("上传超时，请检查网络后重试")));
                const form = new FormData();
                form.append("cacheControl", "3600");
                form.append("", file);
                xhr.send(form);
            });
            updateTask(id, { progress: 90 });
            const complete = await fetch("/api/documents", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticket: prepared.ticket }),
            });
            const completed = await complete.json();
            if (!complete.ok)
                throw new Error(completed.error ?? t("保存文档失败"));
        }
        catch (cause) {
            const message = cause instanceof Error ? cause.message : t("上传失败");
            setError((previous) => [previous, `${file.name}：${message}`].filter(Boolean).join("\n"));
        }
        finally {
            removeTask(id);
            void queryClient.invalidateQueries({ queryKey: ["documents"] });
        }
    }
    async function upload(selection: File | File[]) {
        if (!canUpload) {
            setError(t("没有上传知识库文档的权限"));
            return;
        }
        const files = Array.isArray(selection) ? selection : [selection];
        if (!files.length)
            return;
        setError("");
        const batch = files.map((file) => ({ file, id: `up-${++seq.current}` }));
        setTasks((previous) => [
            ...previous,
            ...batch.map(({ file, id }) => ({ id, name: file.name, progress: 0 })),
        ]);
        // 逐个传输，避免一次选择大量文件时耗尽连接与服务端解析内存。
        for (const { file, id } of batch)
            await uploadFile(file, id);
    }
    return { upload, tasks, error };
}
