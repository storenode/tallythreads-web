# Assistant (Store agent)

**Status:** DESIGNED, not built. A chat **Assistant** the store owner / sales person talks to to get
stock and store information — "how many red sarees size M?", "MRP of X?", "which categories are low?",
"anything blue for a wedding?". Depends on the **Inventory** module (`inventory.md`) as its data
source, so it's sequenced **after** inventory master/items land.

Built on **Claude** (constitution: default to the latest Claude models) via the Messages API. See the
`claude-api` reference when implementing.

---

## Architecture — hybrid (structured tool-use + vector RAG)

Pure vector RAG is weak at exact numbers (stock counts, prices), so the Assistant combines two paths:

1. **Structured tool-use (source of truth for facts):** Claude is given RLS-scoped tools —
   `search_inventory(filters)`, `stock_count(...)`, `store_info()`, `list_categories()` — that run
   **live** queries. Keeps stock/price answers accurate and current (never stale from an embedding).
2. **Vector RAG (semantic / descriptive):** for fuzzy questions and store policies/notes — retrieve
   top-k relevant text chunks and hand them to Claude as context.

## Vector layer (pgvector)

- Enable the Postgres **`vector`** extension (migration).
- **`store_knowledge`** table (store-scoped): `id, organization_id, store_id, source_type
  (inventory / category / store / policy), source_id, content (text), embedding vector(N),
  last_modified_at, deleted_at` + an **HNSW** index. RLS by store/org (`inventory.read`).
- **Embed descriptive text only** (name, category, color, size, brand, fabric, SKU, store profile,
  policies) — **never** volatile quantity/price (fetched live at answer time), so the index doesn't
  churn on every sale.
- **Indexing pipeline:** on inventory/store change → (re)generate that row's embedding via an edge
  function / queue.
- **`store-agent` edge function:** question → embed query → top-k vector search (RLS-scoped) +
  structured tool calls → Claude → answer. Secrets (embeddings + Anthropic keys) as edge-function env.

## UX / access
- A chat panel in the store console (area TBD: `/ops/:storeId` operations vs `/org/:orgId`).
- **Online-only** (the LLM needs network) — the offline-first data keeps working; the Assistant is an
  online add-on.
- Who: org owner/manager + store sales staff (store-scoped answers only).

---

## Open decisions (before build)
1. **Embedding provider** — Anthropic has no embeddings API. **Voyage AI** (`voyage-3`, 1024-dim;
   Anthropic's recommended partner) or **OpenAI** `text-embedding-3-small` (1536)? Fixes `vector(N)`.
2. Knowledge scope to embed first: inventory items + categories + store profile (+ policies?).
3. Chat location (operations vs org console) + exact roles allowed.
4. Cost / rate-limiting per store.

## Sequencing
Inventory master/items first (the data the Assistant reads), then: pgvector migration → indexing
pipeline → `store-agent` edge function (tools + RAG) → chat UI.
