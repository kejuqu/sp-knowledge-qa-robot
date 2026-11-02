import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, canUpload: true, invalidate: vi.fn() }));
vi.mock("../../../apps/web/node_modules/react", () => ({
  useRef: () => ({ current: 0 }),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    state.values[index] = initial;
    return [initial, (value: unknown) => {
      state.values[index] = typeof value === "function" ? value(state.values[index]) : value;
    }];
  },
}));
vi.mock("../../../apps/web/node_modules/@tanstack/react-query/build/modern/index.js", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("@/components/tenant-role", () => ({ usePermission: () => state.canUpload }));

import { useDocumentUpload } from "../../../apps/web/src/components/documents/use-document-upload";

const requests: Array<{ file: File; xhr: FakeXHR }> = [];
class FakeXHR {
  status = 202;
  responseText = "";
  upload = {};
  timeout = 0;
  onload = () => {};
  onerror = () => {};
  ontimeout = () => {};
  open() {}
  setRequestHeader() {}
  send(body: FormData) {
    requests.push({ file: body.get("") as File, xhr: this });
  }
}

describe("批量文档上传", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    state.values = [];
    state.cursor = 0;
    state.canUpload = true;
    requests.length = 0;
    state.invalidate.mockClear();
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(
      url === "/api/documents/upload" ? { uploadUrl: "https://storage.example/upload", ticket: "signed-ticket" } : { ok: true },
    )));
  });

  it("保留全部待上传文件，前一个成功后继续上传下一个", async () => {
    const { upload } = useDocumentUpload();
    const done = upload([new File(["a"], "a.txt"), new File(["b"], "b.txt")]);
    expect(state.values[0]).toHaveLength(2);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests.map((request) => request.file.name)).toEqual(["a.txt"]);
    requests[0].xhr.onload();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].xhr.onload();
    await done;
    expect(state.values[0]).toEqual([]);
    expect(state.invalidate).toHaveBeenCalledTimes(2);
  });

  it("失败和超时不阻断后续文件，错误包含文件名并累计保留", async () => {
    const { upload } = useDocumentUpload();
    const done = upload([new File(["a"], "a.txt"), new File(["b"], "b.txt"), new File(["c"], "c.txt")]);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].xhr.status = 409;
    requests[0].xhr.responseText = JSON.stringify({ error: "文件已经上传" });
    requests[0].xhr.onload();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].xhr.ontimeout();
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    requests[2].xhr.onload();
    await done;
    expect(state.values[1]).toBe("a.txt：文件存储失败，请重新上传\nb.txt：上传超时，请检查网络后重试");
    expect(state.values[0]).toEqual([]);
  });

  it("仍兼容聊天页面的单文件上传", async () => {
    const { upload } = useDocumentUpload();
    const done = upload(new File(["a"], "a.txt"));
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].xhr.onload();
    await done;
    expect(requests).toHaveLength(1);
    expect(fetch).toHaveBeenLastCalledWith("/api/documents", expect.objectContaining({
      body: JSON.stringify({ ticket: "signed-ticket" }),
    }));
  });

  it("没有上传权限时不能发起批量上传", async () => {
    state.canUpload = false;
    await useDocumentUpload().upload([new File(["a"], "a.txt")]);
    expect(requests).toHaveLength(0);
    expect(state.values[1]).toBe("没有上传知识库文档的权限");
  });
});
