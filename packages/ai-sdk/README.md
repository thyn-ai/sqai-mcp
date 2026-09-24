# @thyn-ai/sqai-ai-sdk

Vercel AI SDK tools for SQAI. It exposes the governed `listSources`, `queryData`, `explainQuery`, and `getResult` tools over an SQAI client.

Install:

```bash
npm install ai zod @thyn-ai/sqai-ai-sdk
```

Keep this package server-side. Policies are configured in application code and are never exposed through model tool input.

Docs: https://docs.sqai.com/guides/ai-sdk-tools
