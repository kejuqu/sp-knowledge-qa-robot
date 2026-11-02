import source from "../messages/zh.json";

const index = new Map(Object.entries(source).map(([key, value]) => [value, key]));
const patterns = Object.entries(source).filter(([, value]) => /\{p\d+\}/.test(value)).map(([key, value]) => ({
  key,
  names: [...value.matchAll(/\{(p\d+)\}/g)].map((match) => match[1]),
  pattern: new RegExp("^" + value.split(/\{p\d+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.+?)") + "$"),
}));

/** Translate UI copy only. Keep filenames, user messages and model identifiers untouched. */
export function makeTranslator(raw: (key: string) => unknown) {
  return function t<T>(value: T, values?: Record<string, string | number>): T {
    if (typeof value !== "string") return value;
    const normalized = value.replace(/\s+/g, " ").trim();
    let key = index.get(normalized);
    let parameters = values;
    if (!key) {
      for (const candidate of patterns) {
        const match = candidate.pattern.exec(value);
        if (match) { key = candidate.key; parameters = Object.fromEntries(candidate.names.map((name, i) => [name, match[i + 1]])); break; }
      }
    }
    if (!key) return value;
    const translated = raw(key);
    if (typeof translated !== "string") return value;
    return translated.replace(/\{(p\d+)\}/g, (placeholder, name) => parameters?.[name]?.toString() ?? placeholder) as T;
  };
}
