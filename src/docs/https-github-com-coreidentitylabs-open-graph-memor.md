# Deep Research: CoreIdentityLabs/open-graph-memory-mcp

**Source:** [CoreIdentityLabs/open-graph-memory-mcp](https://github.com/CoreIdentityLabs/open-graph-memory-mcp)  
**NPM Package:** `@coreidentitylabs/open-graph-memory-mcp` (v1.0.3)  
**Author:** Chamara Dodandeniya ([dodandeniya](https://github.com/dodandeniya))  
**Organization:** [CoreIdentityLabs](https://github.com/CoreIdentityLabs)  
**Research Date:** 2026-04-19  
**Latest Commit:** `43048aacf65c9ad4b25d1b79ab844c0d8e7dd7cc` (2026-03-05)  
**License:** MIT

---

## Executive Summary

`open-graph-memory-mcp` is a **TypeScript MCP (Model Context Protocol) server** that gives AI coding assistants (VS Code Copilot, Claude Desktop, Antigravity) a **persistent, graph-based knowledge memory** that survives across sessions. It stores entities, relationships, and decisions in a knowledge graph backed by either a zero-config local JSON file or a Neo4j graph database. The server implements a **dual-flow model**: an agent-driven flow (no API key required) where the IDE's LLM handles entity extraction and calls the graph tools directly, and an optional server-side encoding flow where a separate LLM API extracts entities automatically from raw text. It exposes 12–13 MCP tools and 2 MCP resources over stdio transport, and includes a 5-pass deep analysis engine, offline n-gram embeddings, hybrid retrieval, and a memory evolution/consolidation subsystem. The project is authored by a member of [CoreIdentityLabs](https://github.com/CoreIdentityLabs) — the same organization that maintains this `sirimath-ai-agent`.

---

## Architecture / System Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                    AI Coding Assistant / MCP Client                   │
│         (VS Code + MCP Extension, Claude Desktop, Antigravity)        │
└────────────────────────────┬──────────────────────────────────────────┘
                             │  stdio (MCP protocol)
                             ▼
┌───────────────────────────────────────────────────────────────────────┐
│                   MCP Server (src/index.ts)                           │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                src/tools/memory-tools.ts                        │  │
│  │   12 tools (agent-driven) + 1 optional (memory_encode_text)    │  │
│  └────────────┬───────────────────────────┬────────────────────────┘  │
│               │                           │                           │
│  ┌────────────▼────────┐  ┌───────────────▼──────────────────────┐  │
│  │ src/retrieval/       │  │ src/analysis/deep-analyzer.ts        │  │
│  │  search.ts           │  │ 5-pass analysis: seed→BFS→centrality │  │
│  │ Hybrid search:       │  │ →temporal→contradiction detection    │  │
│  │  text+semantic+graph │  └──────────────────────────────────────┘  │
│  └────────────┬────────┘                                             │
│               │                                                       │
│  ┌────────────▼────────┐  ┌──────────────────────────────────────┐  │
│  │ src/encoding/        │  │ src/evolution/consolidator.ts        │  │
│  │  embedder.ts         │  │ Merge dups, infer transitive edges,  │  │
│  │ Offline n-gram       │  │ prune stale nodes                    │  │
│  │  (char trigrams +    │  └──────────────────────────────────────┘  │
│  │  word bigrams, L2)   │                                            │
│  └────────────┬────────┘                                             │
│               │                                                       │
│  ┌────────────▼─────────────────────────────────────────────────┐   │
│  │                Storage Backend (StorageBackend interface)      │   │
│  │                                                                │   │
│  │  ┌────────────────────────┐  ┌──────────────────────────────┐ │   │
│  │  │ src/storage/json-store │  │ src/storage/neo4j-store.ts   │ │   │
│  │  │ JSON file (zero-config)│  │ Neo4j graph database         │ │   │
│  │  │ In-memory Maps +       │  │ Bolt protocol, Cypher queries│ │   │
│  │  │ atomic write (tmp→mv)  │  │ Client-side cosine fallback  │ │   │
│  │  └────────────────────────┘  └──────────────────────────────┘ │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ src/llm/ (OPTIONAL — only when LLM_API_KEY is set)            │   │
│  │  provider.ts → openai-provider.ts                              │   │
│  │  Works with: OpenAI, Azure, Ollama (any OpenAI-compat endpoint)│   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ src/resources/context-resource.ts                              │   │
│  │  2 MCP Resources: memory://entities/recent, memory://stats     │   │
│  └────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Component 1: Entry Point (`src/index.ts`)

**File:** `src/index.ts` (SHA: `edc37210`)[^1]

The entry point performs a fixed 5-step initialization:

```typescript
async function main(): Promise<void> {
  // 1. Initialize storage backend (JSON or Neo4j from env)
  const store = createStorageBackend();
  await store.initialize();

  // 2. Initialize optional LLM provider (null if no LLM_API_KEY)
  const llm = createLLMProvider();

  // 3. Create MCP server
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  // 4. Register tools (12 without LLM, 13 with LLM) + 2 resources
  registerMemoryTools(server, store, llm);
  registerMemoryResources(server, store);

  // 5. Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

**Key design:** The LLM provider is entirely optional — `null` when `LLM_API_KEY` is absent. The tool count is 12 or 13 accordingly. Graceful shutdown on `SIGINT`/`SIGTERM` closes the storage backend cleanly.[^1]

---

## Component 2: Type System (`src/types.ts`)

**File:** `src/types.ts` (SHA: `9c21d2a1`)[^2]

### Node Types

Six node types are supported in the `NodeType` union:

| Type | Purpose |
|------|---------|
| `entity` | People, tools, libraries, services |
| `concept` | Abstract ideas, patterns, paradigms |
| `event` | Meetings, deployments, decisions |
| `code_pattern` | Recurring code structures, architectures |
| `decision` | Technical decisions with rationale |
| `conversation` | Raw conversation history snapshots |

### `MemoryNode` — Core Graph Node

```typescript
interface MemoryNode {
  id: string;
  name: string;
  type: NodeType;
  description: string;
  embedding?: number[];          // Optional embedding vector
  metadata: Record<string, unknown>;
  createdAt: string;             // ISO timestamp
  updatedAt: string;
  validFrom?: string;            // Bi-temporal: when fact became true
  validUntil?: string;           // Bi-temporal: when fact ceased to be true
  source?: string;               // Origin of this memory
  accessCount: number;           // Number of retrievals (used for relevance boosting)
  lastAccessedAt?: string;
}
```

### `MemoryEdge` — Directed Relationship

```typescript
interface MemoryEdge {
  id: string;
  source: string;           // Source node ID
  target: string;           // Target node ID
  relation: string;         // "uses", "depends_on", "decided_to", etc.
  description: string;      // Natural language description
  weight: number;           // 0–1 confidence/strength
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

### `StorageBackend` — Pluggable Interface

The complete backend interface[^2]:
- Node ops: `addNode`, `updateNode`, `deleteNode`, `getNode`, `getNodeByName`, `findNodes`, `getAllNodes`, `findNodesByEmbedding`
- Edge ops: `addEdge`, `updateEdge`, `deleteEdge`, `getEdge`, `getEdgesForNode`, `getEdgesBetween`
- Traversal: `getNeighborhood(nodeId, depth)`
- Lifecycle: `getStats`, `close`

---

## Component 3: Storage Backends

### 3a. JSON Store (`src/storage/json-store.ts`)

**File:** `src/storage/json-store.ts` (SHA: `44bf2d31`)[^3]

The default backend. All data is held in two in-memory `Map<string, MemoryNode/Edge>` structures and serialized to a JSON file on every write.

**File format:**
```json
{
  "version": "1.0.0",
  "lastConsolidated": "2026-03-01T00:00:00.000Z",
  "nodes": [...],
  "edges": [...]
}
```

**Atomic write pattern:** Every write goes through `persist()` which writes to a `.tmp` temp file then atomically renames it over the target — preventing corrupt states on crash.[^3]

```typescript
private persist(): void {
  const tmpPath = this.filePath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmpPath, this.filePath);  // atomic
}
```

**Graph traversal** (`getNeighborhood`) uses iterative BFS over the edge maps — no external graph library required.[^3]

**Neighborhood BFS algorithm:**
```typescript
const queue = [{ id: nodeId, currentDepth: 0 }];
while (queue.length > 0) {
  const item = queue.shift();
  // visit node, expand edges up to depth
}
```

**Embedding search** falls back to client-side cosine similarity over all nodes (linear scan), suitable for small to moderate graph sizes.

### 3b. Neo4j Store (`src/storage/neo4j-store.ts`)

**File:** `src/storage/neo4j-store.ts` (SHA: `700902e2`)[^4]

Production-grade backend using the Neo4j Bolt protocol via `neo4j-driver`.

**Initialization creates:**
```cypher
CREATE CONSTRAINT memory_node_id IF NOT EXISTS FOR (n:MemoryNode) REQUIRE n.id IS UNIQUE
CREATE CONSTRAINT memory_edge_id IF NOT EXISTS FOR ()-[r:MEMORY_EDGE]-() REQUIRE r.id IS UNIQUE
CREATE INDEX memory_node_name IF NOT EXISTS FOR (n:MemoryNode) ON (n.name)
CREATE INDEX memory_node_type IF NOT EXISTS FOR (n:MemoryNode) ON (n.type)
```

**Graph traversal** uses Cypher variable-length path queries:
```cypher
MATCH path = (start:MemoryNode {id: $nodeId})-[*0..{depth}]-(neighbor:MemoryNode)
WITH DISTINCT neighbor, relationships(path) AS rels
```

**Note:** Vector similarity search currently falls back to client-side cosine (loads all embedding nodes from Neo4j, computes in JS). A production improvement would use Neo4j's native vector index.[^4]

**Edges** are stored as `MEMORY_EDGE` relationship type in Neo4j, with all properties (relation, weight, description, metadata, timestamps) on the relationship itself.

### 3c. Storage Factory (`src/storage/factory.ts`)

**File:** `src/storage/factory.ts` (SHA: `8784ee47`)[^5]

```typescript
export function createStorageBackend(): StorageBackend {
  const backendType = process.env["STORAGE_BACKEND"] ?? "json";
  switch (backendType) {
    case "neo4j": return new Neo4jStore(uri, user, password);
    default:      return new JsonStore(filePath);
  }
}
```

---

## Component 4: Embedding Engine (`src/encoding/embedder.ts`)

**File:** `src/encoding/embedder.ts` (SHA: `6e3c9e97`)[^6]

A **zero-dependency offline embedding system** using character n-gram hashing. Produces 256-dimensional vectors.

**Three-level feature extraction:**
1. **Character trigrams** — `"hello"` → `["hel", "ell", "llo"]` → hashed, signed, accumulated into 256D vector
2. **Word unigrams** — each word hashed → weight 0.5 per word
3. **Word bigrams** — adjacent word pairs → weight 0.3 per bigram

**Hash function:** djb2 variant `hash = ((hash << 5) + hash + charCode) | 0`

**Final step:** L2 normalization to unit length.

```typescript
export function generateLocalEmbedding(text: string): number[] {
  const vector = new Float64Array(EMBEDDING_DIM).fill(0);
  // trigram hashing
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.substring(i, i + 3);
    const hash = hashString(trigram);
    const index = Math.abs(hash) % EMBEDDING_DIM;
    vector[index] += hash > 0 ? 1 : -1;
  }
  // word + bigram hashing...
  return l2Normalize(Array.from(vector));
}
```

**Trade-off:** Quality is lower than neural embeddings (GPT, BGE, etc.) but it works entirely offline with no API keys and no latency. The README explicitly describes this as "sufficient for basic similarity".[^6]

**Cosine similarity** is implemented directly:
```typescript
export function cosineSimilarity(a: number[], b: number[]): number {
  // dot product / (|a| * |b|)
}
```

---

## Component 5: Hybrid Retrieval Engine (`src/retrieval/search.ts`)

**File:** `src/retrieval/search.ts` (SHA: `557cc146`)[^7]

**`hybridSearch(store, options)`** combines four scoring signals into a weighted total:

| Signal | Weight | Description |
|--------|--------|-------------|
| `semanticScore` | 0.40 | Cosine similarity between query embedding and node embedding |
| `textScore` | 0.40 | Name match (0.6) + description match (0.4) + word-level partial match (0.1–0.25) |
| `recencyBoost` | 0.10 | Exponential decay over 30 days: `max(0, 1 - ageDays/30) * 0.1` |
| `accessBoost` | 0.10 | `min(accessCount/100, 0.1)` — rewards frequently retrieved nodes |

**Full scoring formula:**
```
totalScore = 0.4 * semanticScore + 0.4 * textScore + 0.1 * recencyBoost + 0.1 * accessBoost
```

**5-step retrieval pipeline:**
1. Get all candidate nodes (up to 10,000 via `getAllNodes`)
2. Score each node — apply type/time filters, compute all signals
3. Sort by score descending, take `topK` results
4. **Graph traversal expansion**: BFS from top-3 anchors at configurable depth (default: 2 hops). Graph-discovered neighbors get a discounted score (`anchorScore * 0.5`)
5. Update `accessCount` and `lastAccessedAt` for all returned nodes

**`getContextForTopic(store, topic, maxTokens)`** — formats retrieved nodes as a markdown block for direct prompt injection:
```markdown
## Relevant Memory Context: "React Query migration"
### React Query (entity)
State management library chosen to replace SWR...
### Relationships
- AuthService **depends_on** React Query
```

---

## Component 6: Deep Analysis Engine (`src/analysis/deep-analyzer.ts`)

**File:** `src/analysis/deep-analyzer.ts` (SHA: `896503c4`)[^8]

**`deepAnalyze(store, options)`** — the most sophisticated component. Runs 5 sequential passes over the graph and returns a `DeepAnalysisReport`.

### Default Parameters
```typescript
{
  maxDepth: 3,           // BFS expansion depth
  topK: 15,              // Seed nodes from initial search
  includeTemporalAnalysis: true,
  includeClusters: true,
  maxNodes: 100          // Hard cap on explored nodes
}
```

### Pass-by-Pass Description

**Pass 1: Seed Search**
- Calls `hybridSearch` with the topic query
- Returns up to 15 anchor nodes as seeds

**Pass 2: BFS Subgraph Expansion**
- Starting from seed nodes, expands via `store.getNeighborhood(nodeId, 1)` iteratively
- Each BFS level adds discovered nodes/edges to working sets
- Stops at `maxDepth` levels or `maxNodes` limit

**Pass 3: Degree Centrality & Cluster Detection**
- For each edge, increments degree count for both source and target nodes
- `centrality = degreeCentrality[node] / totalEdgeCount`
- Top 10 nodes by centrality become `keyEntities`
- Cluster detection: for top-3 hub nodes, finds all directly connected members and shared relation types → `ClusterSummary[]`

**Pass 4: Temporal Analysis**
- Groups all explored nodes by calendar quarter: `YYYY-Q{1-4}`
- For each quarter: separates `decision` nodes as "decisions", others as "active entities"
- Computes trend by comparing node count vs previous quarter: `growing | stable | declining`

**Pass 5: Contradiction Detection**
- Groups nodes by normalized name
- For groups with 2+ nodes, computes cosine similarity between their descriptions
- Nodes with same name but description similarity < 0.5 → flagged as contradictions

**Synthesis:**
- Builds `synthesizedSummary` string from all findings
- Computes `confidence = min(1, (seedNodes.length / topK) * 0.5 + min(edgeDensity / 5, 0.5))`
- Returns `suggestedNextSteps` array (resolve contradictions → review decisions → investigate cluster gaps → refined search queries)

**Output type:**
```typescript
interface DeepAnalysisReport {
  topic: string;
  analyzedAt: string;
  seedNodes: { name; type; score }[];
  totalNodesExplored: number;
  totalEdgesTraversed: number;
  keyEntities: { name; type; centrality; description }[];
  criticalPaths: { path; relations; significance }[];
  clusters: ClusterSummary[];
  temporalInsights: TemporalInsight[];
  contradictions: { entity; conflictDescription }[];
  synthesizedSummary: string;
  suggestedNextSteps: string[];
  confidence: number;  // 0–1
}
```

---

## Component 7: Memory Evolution (`src/evolution/consolidator.ts`)

**File:** `src/evolution/consolidator.ts` (SHA: `c9698ca0`)[^9]

**`consolidateMemory(store, strategy)`** — keeps the graph healthy as it grows.

Four strategies:
- `full` — all operations
- `merge_only` — only merge duplicates
- `prune_only` — only prune stale nodes
- `infer_only` — only infer transitive edges

### Duplicate Merging

Detects duplicates by two criteria:
1. **Name similarity** — exact match OR Levenshtein similarity > 0.85
2. **Embedding similarity** — cosine similarity > `DUPLICATE_SIMILARITY_THRESHOLD` (0.85)

Merge strategy:
- Keep node with higher `accessCount`
- Merge descriptions (take longer, or combine with " | ")
- Re-point all edges from removed node to kept node (skip self-loops and exact duplicates)

### Transitive Edge Inference

For edges A→B and B→C where `relation` is the same and is in the transitive whitelist:
```typescript
const transitiveRelations = [
  "depends_on", "part_of", "belongs_to", "contains", "extends", "imports"
];
```

Infers edge A→C with `weight = min(w_AB, w_BC) * 0.8`.

### Stale Node Pruning

Prunes nodes where:
- `lastAccessedAt` (or `updatedAt`) older than `STALE_NODE_AGE_DAYS` (90 days)
- `accessCount === 0`
- **Exempt types:** `conversation` and `decision` (never pruned — too high value)

---

## Component 8: MCP Tools (`src/tools/memory-tools.ts`)

**File:** `src/tools/memory-tools.ts` (SHA: `2c20ef54`)[^10]

All tools are registered with Zod schemas for input validation via `@modelcontextprotocol/sdk`.

### Complete Tool Reference

#### Write Tools

| Tool | Parameters | LLM Required | Description |
|------|-----------|---------|-------------|
| `memory_add_entities` | `entities[]` (name, type, description, metadata, validFrom, validUntil, source) | ❌ | Batch-add nodes; auto-generates n-gram embeddings; dedup by name |
| `memory_add_relations` | `relations[]` (source, target, relation, description, weight) | ❌ | Add directed edges; resolves source/target nodes by name |
| `memory_save_conversation` | `summary`, `participants[]`, `topics[]`, `sessionId?` | ❌ | Saves a conversation snapshot as a `conversation` node with linked topics |
| `memory_encode_text` | `text`, `context?` | ✅ | Server-side LLM pipeline: extract entities + relations from raw text, embed, store |

#### Read Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `memory_search` | `query`, `topK?`, `type?`, `timeRange?`, `traversalDepth?` | Hybrid search: text + semantic + graph traversal |
| `memory_get_entity` | `name` | Get entity by name with all relationships |
| `memory_list_entities` | `type?`, `source?`, `nameContains?`, `createdAfter?`, `createdBefore?`, `page?`, `pageSize?` | Paginated filtered listing (default page size: 20, max: 100) |
| `memory_get_relations` | `entityName`, `direction?` (`in`/`out`/`both`) | Get all edges for a node |
| `memory_get_context` | `topic`, `maxTokens?` | Formatted context for prompt injection (markdown output) |

#### Analysis Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `memory_deep_analyze` | `topic`, `maxDepth?`, `topK?`, `maxNodes?`, `includeTemporalAnalysis?`, `includeClusters?` | 5-pass deep analysis report |

#### Management Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `memory_delete_entity` | `name` | Remove entity and all its edges |
| `memory_consolidate` | `strategy?` | Merge dups, infer edges, prune stale nodes |
| `memory_status` | (none) | Graph health stats (node counts, edge counts, backend type, last consolidated) |

---

## Component 9: MCP Resources (`src/resources/context-resource.ts`)

**File:** `src/resources/context-resource.ts` (SHA: `2354e78f`)[^11]

Two MCP resources registered for **automatic context injection** (agents can read without explicit tool calls):

| Resource | URI | Content |
|---------|-----|---------|
| `recent_entities` | `memory://entities/recent` | Top 20 most recently updated entities (JSON) |
| `graph_stats` | `memory://stats` | Node/edge counts, backend type, last consolidated (JSON) |

---

## Component 10: LLM Provider (`src/llm/`)

**Files:** `src/llm/provider.ts` (SHA: `96791835`), `src/llm/openai-provider.ts`, `src/llm/prompts.ts`[^12]

### Factory (`provider.ts`)
Returns `null` if `LLM_API_KEY` is absent. Otherwise creates an `OpenAIProvider` with:
- Default chat model: `gpt-4o-mini`
- Default embedding model: `text-embedding-3-small`
- Default base URL: `https://api.openai.com/v1`

### Extraction System Prompt (`prompts.ts`)

The extraction prompt[^13]:
- Instructs the LLM to extract entities across all 6 NodeTypes
- **Entity resolution:** Includes list of existing entity names to reuse exact names and prevent duplicates
- Extraction rules: specific entities (not generic), verb-based relations (`uses`, `depends_on`, `replaced_by`, `decided_to`, `part_of`, `implements`, `configures`, `deployed_to`)
- Output: strict JSON only (`{"entities": [...], "relations": [...]}`) — no markdown, no extra text

### Compatibility
Works with any OpenAI-compatible endpoint: OpenAI, Azure OpenAI, Ollama, local models via LM Studio, etc.

---

## Configuration Reference

**File:** `.env.example` (SHA: `97482fa6`)[^14]

```bash
# Storage
STORAGE_BACKEND=json               # "json" (default) or "neo4j"
MEMORY_STORE_PATH=./memory.json    # JSON backend only

# Neo4j (only for neo4j backend)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Optional LLM (enables memory_encode_text)
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_CHAT_MODEL=gpt-4o-mini
LLM_EMBEDDING_MODEL=text-embedding-3-small
```

### Key Constants (`src/constants.ts`)

**File:** `src/constants.ts` (SHA: `7410e966`)[^15]

| Constant | Value | Purpose |
|---------|-------|---------|
| `CHARACTER_LIMIT` | 25,000 | Max response characters to prevent overwhelming agents |
| `DEFAULT_PAGE_SIZE` | 20 | Default pagination size |
| `MAX_PAGE_SIZE` | 100 | Max page size |
| `DEFAULT_TRAVERSAL_DEPTH` | 2 | Default BFS depth for search |
| `DEFAULT_TOP_K` | 10 | Default search results |
| `DUPLICATE_SIMILARITY_THRESHOLD` | 0.85 | Cosine threshold for duplicate detection |
| `MIN_EDGE_WEIGHT` | 0.1 | Minimum edge weight to keep during pruning |
| `STALE_NODE_AGE_DAYS` | 90 | Days before unaccessed node is pruned |
| `EMBEDDING_DIM` | 256 | Offline embedding vector dimension |

---

## Installation & Integration

### Via npx (Recommended)

```bash
# No installation required
npx -y @coreidentitylabs/open-graph-memory-mcp
```

### Claude Desktop Config

```json
{
  "mcpServers": {
    "open-memory": {
      "command": "npx",
      "args": ["-y", "@coreidentitylabs/open-graph-memory-mcp"],
      "env": {
        "STORAGE_BACKEND": "json",
        "MEMORY_STORE_PATH": "C:/path/to/memory.json"
      }
    }
  }
}
```

### VS Code MCP Extension

Add as an MCP server with:
- **Command:** `npx`
- **Arguments:** `-y @coreidentitylabs/open-graph-memory-mcp`

### From Source (Development)

```bash
git clone https://github.com/CoreIdentityLabs/open-graph-memory-mcp.git
cd open-graph-memory-mcp
npm install
npm run build
node dist/index.js
```

---

## Dual-Flow Architecture

### Flow 1: Agent-Driven (No API Key)

```
User chats with AI assistant
  → Agent extracts entities/decisions from conversation
  → Agent calls memory_add_entities / memory_add_relations
  → Entities stored with offline n-gram embeddings
  → Before next task, agent calls memory_search or memory_get_context
  → Before complex tasks, agent calls memory_deep_analyze
  → Relevant historical context injected into prompt
  = AI remembers project across sessions
```

**Advantage:** Zero configuration, zero cost beyond the assistant's own LLM.

### Flow 2: Server-Side Encoding (Optional LLM API Key)

```
User passes raw text to memory_encode_text
  → Server-side LLM extracts entities + relationships
  → Entity resolution against existing graph (dedup by name matching)
  → LLM-quality embeddings generated
  → Nodes + edges stored
  = Fully automated — no manual entity extraction needed
```

**Advantage:** Higher quality extraction; raw text (meeting transcripts, code comments, documentation) can be ingested without agent involvement.

---

## Technical Dependencies

**File:** `package.json` (SHA: `5465aa6b`)[^16]

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `@modelcontextprotocol/sdk` | `^1.6.1` | MCP server + stdio transport |
| `dotenv` | `^16.4.7` | Environment variable loading |
| `neo4j-driver` | `^5.27.0` | Neo4j Bolt client |
| `uuid` | `^11.0.5` | UUID v4 for node/edge IDs |
| `zod` | `^3.23.8` | Tool input schema validation |

**Dev dependencies:** TypeScript 5.7, tsx (watch mode), Vitest 4.0, rimraf, `@vitest/coverage-v8`

**Node requirement:** ≥ 18

**Test structure:** `tests/unit/`, `tests/integration/`, `tests/mocks/`, `tests/fixtures/`

---

## Commit History & Development Timeline

**Repository:** [CoreIdentityLabs/open-graph-memory-mcp](https://github.com/CoreIdentityLabs/open-graph-memory-mcp)[^17]

| Date | Commit | Message |
|------|--------|---------|
| 2026-03-02 | `5a3d1cbd` | Initial Open-Memory server implementation |
| 2026-03-02 | `b80c74db` | Added agent skills (.agent/skills/) |
| 2026-03-03 | `fd8e0f66` | Renamed to `@coreidentitylabs/open-graph-memory-mcp` |
| 2026-03-03 | `b050d6d2` | Updated MCP package name in docs |
| 2026-03-04 | `3c9834c2` | **Deep analysis engine** (multi-pass) |
| 2026-03-04 | `47f98905` | Real-world applications + references in README |
| 2026-03-05 | `436960e9` | **Vitest testing suite with CI** |
| 2026-03-05 | `682bbecc` | `.npmignore` to exclude dev files from npm |
| 2026-03-05 | `43048aac` | GitHub Actions workflow for automated npm publishing |

**All commits by:** Chamara Dodandeniya (`dodandeniya`)[^17] — sole author.

---

## Relationship to Sirimath-AI-Agent

This repository is authored by the same person/organization as the `sirimath-ai-agent` project (the current working directory). Specifically:

1. **Same organization:** Both repos are under `CoreIdentityLabs`
2. **Sirimath's CLAUDE.md** already has an `install-skill` tool and skills system — `open-graph-memory-mcp` complements this by providing persistent cross-session memory
3. The `open-graph-memory-mcp` package can be connected to sirimath via MCP configuration (add to `mcp_servers` config if sirimath supports MCP client connections — it uses [VoltAgent](https://voltagent.dev) which has MCP support)
4. The `.agent/skills/` directory in the repo suggests this was likely developed with AI coding assistance, potentially using sirimath-ai-agent itself

---

## Comparison with Similar Projects

| Feature | open-graph-memory-mcp | mem0 MCP | Basic RAG MCP |
|---------|----------------------|----------|---------------|
| Storage | JSON file or Neo4j | External API | Vector DB |
| Embeddings | Offline n-gram (free) | Neural (API) | Neural (API) |
| Relationships | Explicit edges | Semantic only | None |
| Deep analysis | 5-pass graph analysis | No | No |
| Entity resolution | Name + embedding dedup | Semantic | No |
| Temporal reasoning | Calendar-quarter grouping | Limited | No |
| Contradiction detection | Cosine-based | No | No |
| Transitive inference | `depends_on`, `extends`, etc. | No | No |
| Zero-config | ✅ (JSON backend) | ❌ | ❌ |
| LLM required | ❌ (optional) | ✅ | ✅ |
| Transport | stdio | stdio | stdio |

---

## Key Repositories Summary

| Repository | Purpose | Key Files |
|-----------|---------|-----------|
| [CoreIdentityLabs/open-graph-memory-mcp](https://github.com/CoreIdentityLabs/open-graph-memory-mcp) | Main repo | `src/index.ts`, `src/tools/memory-tools.ts`, `src/analysis/deep-analyzer.ts` |
| [modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) | MCP SDK dependency | Used for `McpServer`, `StdioServerTransport` |

---

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|-----------|-------|
| All 6 NodeTypes | **High** | Direct read of `src/types.ts` (SHA: `9c21d2a1`) |
| MemoryNode/MemoryEdge full interfaces | **High** | Same file |
| StorageBackend full interface | **High** | Same file |
| JsonStore atomic write (tmp→rename) | **High** | Direct read of `src/storage/json-store.ts` (SHA: `44bf2d31`) |
| Neo4j constraints and index queries | **High** | Direct read of `src/storage/neo4j-store.ts` (SHA: `700902e2`) |
| 5-pass deep analysis algorithm | **High** | Direct read of `src/analysis/deep-analyzer.ts` (SHA: `896503c4`) |
| Embedding dimensions (256), algorithm | **High** | Direct read of `src/encoding/embedder.ts` (SHA: `6e3c9e97`) |
| Hybrid search 4-signal scoring formula | **High** | Direct read of `src/retrieval/search.ts` (SHA: `557cc146`) |
| Consolidation strategies and thresholds | **High** | Direct read of `src/evolution/consolidator.ts` (SHA: `c9698ca0`) |
| 12 vs 13 tool count (LLM presence) | **High** | `src/index.ts` line: `const toolCount = llm ? 13 : 12` |
| Tool names and parameters | **High** | Confirmed from `src/tools/memory-tools.ts` (preview + file header) |
| Sole author is Chamara Dodandeniya | **High** | All 12 commits by same author (`dodandeniya`, email: `92chamara@gmail.com`) |
| Neo4j vector search currently client-side | **High** | Code comment in `neo4j-store.ts`: "For now, fall back to client-side cosine similarity" |
| Transitive relation whitelist | **High** | Direct read of `consolidator.ts`: `["depends_on", "part_of", "belongs_to", "contains", "extends", "imports"]` |

---

## Footnotes

[^1]: `src/index.ts` (SHA: `edc37210b5f5bf878940f7acf5f5bc53feb8a6d2`) — Entry point. Tool count logic: `const toolCount = llm ? 13 : 12`. Graceful shutdown via `SIGINT`/`SIGTERM`.

[^2]: `src/types.ts` (SHA: `9c21d2a1b072953b9993398eafd8d53196c9cec0`) — All type definitions: `NodeType`, `MemoryNode`, `MemoryEdge`, `StorageBackend`, `LLMProvider`, `ConsolidationResult`, `ConsolidationStrategy`.

[^3]: `src/storage/json-store.ts` (SHA: `44bf2d3169a1ca2661294448ebc1a7ed104638ea`) — Atomic write: `renameSync(tmpPath, this.filePath)`. BFS traversal in `getNeighborhood`. Cosine similarity via `findNodesByEmbedding`.

[^4]: `src/storage/neo4j-store.ts` (SHA: `700902e26b3252104f15b816fe3cadc6e7dd44a7`) — Neo4j `MEMORY_EDGE` relationship type, Cypher `CREATE CONSTRAINT` / `CREATE INDEX`, variable-length path traversal, client-side cosine fallback note.

[^5]: `src/storage/factory.ts` (SHA: `8784ee4739d860cd4af05c6ddbee85c47868677d`) — `createStorageBackend()` factory: reads `STORAGE_BACKEND` env var, instantiates `JsonStore` or `Neo4jStore`.

[^6]: `src/encoding/embedder.ts` (SHA: `6e3c9e9770ce3493edf1a77ab0e8f0de134ae1ca`) — 256-dimension offline embedding: char trigrams + word unigrams + word bigrams, djb2 hash, L2 normalize. `cosineSimilarity` implementation.

[^7]: `src/retrieval/search.ts` (SHA: `557cc146a545872aeb68700a87997ccd3d6809de`) — `hybridSearch`: 5-step pipeline, scoring formula `0.4*semantic + 0.4*text + 0.1*recency + 0.1*access`, graph traversal from top-3 anchors. `getContextForTopic` for markdown prompt injection.

[^8]: `src/analysis/deep-analyzer.ts` (SHA: `896503c42f50501ea2a045325df82a0ca280e830`) — 5-pass analysis: seed search → BFS expansion → degree centrality + cluster detection → temporal grouping by quarter → contradiction detection via cosine similarity < 0.5.

[^9]: `src/evolution/consolidator.ts` (SHA: `c9698ca062e258d3fc4898052e8ee8afa4bd4da5`) — Levenshtein similarity 0.85 threshold for name match, cosine 0.85 for embedding match, transitive inference whitelist, 90-day staleness cutoff.

[^10]: `src/tools/memory-tools.ts` (SHA: `2c20ef54b49f10b4fb80126cfb6007a49d1beb85`) — All 13 tool definitions with Zod schemas.

[^11]: `src/resources/context-resource.ts` (SHA: `2354e78f6323735eb8ffa16f493c5ca74fa37f27`) — Two MCP resources: `memory://entities/recent` and `memory://stats`.

[^12]: `src/llm/provider.ts` (SHA: `9679183f575a09bb6de98afeb04dcb9b2a3b8d87`) — Factory returns `null` without `LLM_API_KEY`. Default models: `gpt-4o-mini`, `text-embedding-3-small`.

[^13]: `src/llm/prompts.ts` (SHA: `e3a784305ec2a34bb6ea2bd991905e644933315a`) — Entity extraction system prompt with 6 NodeTypes, entity resolution via existing entity list, strict JSON output constraint.

[^14]: `.env.example` (SHA: `97482fa6ae8089fa332b6e0a80cd61b3ba88955d`) — All environment variables with defaults and comments.

[^15]: `src/constants.ts` (SHA: `7410e966fdf287ddf3bc5f05e42c10795623467d`) — All configuration constants including `CHARACTER_LIMIT=25000`, `DUPLICATE_SIMILARITY_THRESHOLD=0.85`, `STALE_NODE_AGE_DAYS=90`, `EMBEDDING_DIM=256` (in embedder.ts).

[^16]: `package.json` (SHA: `5465aa6b26866c0a6dafc05803864233f70ca9b8`) — Dependencies, version 1.0.3, npm package name `@coreidentitylabs/open-graph-memory-mcp`, binary entry.

[^17]: Commit history — 12 commits by `dodandeniya` (Chamara Dodandeniya, `92chamara@gmail.com`), spanning 2026-03-02 to 2026-03-05. Latest SHA: `43048aacf65c9ad4b25d1b79ab844c0d8e7dd7cc`.
