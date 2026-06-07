# 06 — LLM provider abstraction (the placeholder pattern)

## The goal

Build the whole app **now**, with no API key, and make switching to a real AI provider later a tiny,
localized change. The technique: hide every AI call behind a small **interface** and pick the
implementation from configuration.

This is **dependency inversion** / the **strategy pattern**: callers depend on an abstraction
(`embedTexts`, `complete`), not a concrete vendor SDK.

## The two interfaces

**Embeddings** (`services/embeddings/index.js`):
```js
embedTexts(texts: string[]) => Promise<number[][]>
embedQuery(text: string)    => Promise<number[]>
```

**LLM** (`providers/llm/index.js`):
```js
complete({ system, prompt, context }) => Promise<{ text, model }>
```

Each facade reads `AI_PROVIDER` and returns the matching implementation:

```js
switch (config.ai.provider) {
  // case 'openai':    return openaiProvider;
  // case 'anthropic': return anthropicProvider;
  case 'mock':
  default:            return mockProvider;
}
```

## The mock implementations

- **Mock embeddings** — deterministic hashing vectorizer (concept 02). Real lexical retrieval, zero
  keys.
- **Mock LLM** (`providers/llm/mockProvider.js`) — instead of calling a model, it summarises the
  retrieved context into a readable answer and labels itself as the mock. The RAG flow, the API
  responses, and the frontend all work unchanged.

Because the mock honours the same interface, **every caller is already written against the real
shape**. Nothing downstream knows or cares that it's a mock.

## Adding a real provider (the future one-file change)

1. Create `providers/llm/openaiProvider.js` exporting `async complete({ system, prompt })` that
   calls the API and returns `{ text, model }`.
2. Create `services/embeddings/openaiProvider.js` exporting `async embed(texts) => number[][]`.
3. Uncomment the `case 'openai'` lines in both facades.
4. Set `AI_PROVIDER=openai` and `OPENAI_API_KEY` in `.env`.

No route, RAG, chunker, or frontend code changes. That's the payoff of the abstraction.

## Why this is good engineering

- **Runnable + demoable immediately**, no secrets or cost.
- **Deterministic tests** — the mock returns predictable output.
- **Vendor-agnostic** — swap OpenAI ↔ Anthropic ↔ local model by config.
- **Single responsibility** — provider details are quarantined in one folder.

## Interview Q&A

**Q: What design pattern is the provider abstraction?**
Strategy / dependency inversion: callers depend on an interface; the concrete implementation is
selected at runtime from config.

**Q: Why build against a mock instead of waiting for the real API?**
It lets the full system be developed, tested, and demoed with zero keys/cost, and guarantees the
real provider drops in without touching callers, since both honour the same interface.

**Q: What has to be true for the swap to be painless?**
The mock and real providers must share the exact same function signatures and return shapes, and no
caller may reach around the facade to a vendor SDK.

**Q: How would you handle real-world concerns like rate limits or failures?**
Inside the provider implementation: retries with backoff, timeouts, response caching, and token-
budget management — all invisible to callers because they're behind the interface.
