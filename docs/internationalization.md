# Internationalization

Both Next.js App Router apps use `next-intl` with the shared `@kqa/i18n` package.
Supported locales are `zh` (Simplified Chinese), `en` (English), and `ja` (Japanese).

## Choosing a language

The user menu contains a language selector. Authentication and membership pages also provide one.
The validated `kqa-locale` Cookie takes priority over the browser's `Accept-Language` header;
unsupported languages fall back to Chinese. Language changes run a Server Action and refresh Server Components,
so the HTML `lang`, metadata, client UI and server UI agree without changing existing URLs or authentication callbacks.
When `COOKIE_DOMAIN` matches the request host, the preference is shared across the auth and web subdomains.
On localhost, a host-only Cookie is used instead. No account data or database migration is needed.

## Messages

- `packages/i18n/messages/{zh,en,ja}.json` contains matching, stable message IDs.
- Components use `useI18n()` on the client and `await getI18n()` on the server.
- `t(sourceCopy, {p0: value})` resolves source copy through the Chinese catalog. Message IDs are `m` followed by
  the first 12 characters of the source text's SHA-1. Add the same ID to every language catalog.
- Parameter values stay untouched. Use a complete sentence with parameters when word order can differ.
- Translate labels and system errors explicitly; never pass document content, model identifiers,
  filenames or user-written chat messages through a general translation pass.
- `UIStringsProvider` passes translated accessibility labels into shared UI components without coupling the UI package to Next.js.

Dates use the selected locale and the existing Asia/Shanghai time zone. Number formatting uses the selected locale.
CJK locales use installed system fonts. Settings switch to two columns only on wide screens; document actions and
page toolbars wrap when translated labels need more room.

## Verification

Run `pnpm test:i18n` to check catalog parity, parameters, language negotiation and interpolation.
Run both apps' `typecheck` and `build` scripts. Inspect the three languages on desktop and mobile,
including the user menu, knowledge base toolbar, model settings, team permissions and authentication forms.
