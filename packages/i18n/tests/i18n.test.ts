import test from "node:test";
import assert from "node:assert/strict";
import zh from "../messages/zh.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";
import { resolveLocale } from "../src/config";
import { makeTranslator } from "../src/translate";

test("all locales have complete, nonempty messages and matching parameters", () => {
  for (const catalog of [en, ja]) {
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(zh).sort());
    for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
      assert.ok(catalog[key].trim(), key);
      assert.deepEqual(
        [...catalog[key].matchAll(/\{p\d+\}/g)].map((m) => m[0]).sort(),
        [...zh[key].matchAll(/\{p\d+\}/g)].map((m) => m[0]).sort(),
        key,
      );
    }
  }
});
test("saved language wins and browser preferences respect quality and region", () => {
  assert.equal(resolveLocale("ja", "en-US"), "ja");
  assert.equal(resolveLocale(undefined, "fr;q=1,en-US;q=0.9,ja;q=0.8"), "en");
  assert.equal(resolveLocale("invalid", "ja-JP,zh-CN;q=0.8"), "ja");
  assert.equal(resolveLocale(undefined, "fr,en;q=0"), "zh");
});
test("UI translation interpolates values without translating user data", () => {
  const t = makeTranslator((key) => en[key as keyof typeof en]);
  assert.equal(t("上传文档"), "Upload documents");
  assert.equal(t("查看 {p0}", { p0: "业务流程.pdf" }), "View 业务流程.pdf");
  assert.equal(t("qwen3.8-2.4t-a95b"), "qwen3.8-2.4t-a95b");
  assert.equal(t("7天前"), "7 days ago");
});
