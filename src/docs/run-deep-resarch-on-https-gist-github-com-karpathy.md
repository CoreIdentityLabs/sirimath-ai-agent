# Deep Research: Karpathy's "LLM Wiki" Gist

**Source:** [https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)  
**Author:** [Andrej Karpathy](https://github.com/karpathy) — former OpenAI/Tesla researcher, creator of nanoGPT, llm.c, micrograd  
**Document Title:** LLM Wiki — *A pattern for building personal knowledge bases using LLMs*  
**Research Date:** 2026-04-19

---

## Executive Summary

Andrej Karpathy's gist describes a software architecture pattern he calls **"LLM Wiki"** — a method for building a **persistent, compounding personal knowledge base** where a large language model continuously writes and maintains a structured wiki of markdown files, rather than answering questions from raw documents via traditional RAG (Retrieval-Augmented Generation). The document is intentionally abstract ("an idea file") meant to be shared directly with an LLM agent such as Claude Code or OpenAI Codex, which then collaborates with the user to instantiate a concrete implementation. The pattern involves three layers (raw sources, the wiki, a schema/config), three operations (ingest, query, lint), and two navigation files (index.md, log.md). It is inspired by Vannevar Bush's 1945 Memex concept and represents an important shift in thinking from *query-time synthesis* to *incremental, compiled knowledge accumulation*.

---

## Context and Background

### Who Is Andrej Karpathy?

Andrej Karpathy[^1] is one of the most prominent AI researchers and educators in the field. He was:
- Director of AI at Tesla (Autopilot team)
- Founding team member at OpenAI
- Creator of widely-used open-source projects: [nanoGPT](https://github.com/karpathy/nanoGPT) (56.9k stars), [llm.c](https://github.com/karpathy/llm.c) (29.6k stars), [llama2.c](https://github.com/karpathy/llama2.c), and [micrograd](https://github.com/karpathy/micrograd)

This gist is characteristic of his style: a conceptual, implementation-agnostic "idea document" that frames a software pattern at its essence, trusting skilled practitioners to fill in the specifics. The document is designed to be copy-pasted to an LLM agent directly.

### The Vannevar Bush / Memex Connection

Karpathy explicitly invokes Vannevar Bush's **Memex** (1945)[^2] — the hypothetical electromechanical desk described in Bush's essay *"As We May Think"*. Bush envisioned:
- A personal, compressed store of all of a person's books, records, and communications
- **Associative trails** between documents that mimic human memory
- The key insight that *connections between documents are as valuable as the documents themselves*

Bush's Memex was never built — the unsolved problem was maintenance. Who updates the trails, keeps cross-references current, reconciles contradictions? Karpathy's thesis is that **LLMs solve exactly this problem** at near-zero cost.

---

## The Core Problem: RAG's Fundamental Limitation

Standard RAG (Retrieval-Augmented Generation) — as used in NotebookLM, ChatGPT file uploads, most document QA systems — works like this[^3]:

```
User Question
     │
     ▼
Embedding Search → Retrieve Top-K Chunks from Raw Docs
     │
     ▼
LLM synthesizes answer from retrieved chunks
     │
     ▼
Answer (discarded after the session)
```

**The critical flaw:** Every query starts from scratch. The LLM re-discovers the same knowledge on every question. There is no accumulation — no synthesis is preserved, no cross-references are pre-built, no contradictions are pre-flagged. Complex questions requiring synthesis across five documents require the LLM to locate and piece together those fragments *every single time*.

---

## The LLM Wiki Pattern

### The Fundamental Shift

Instead of retrieval at *query time*, LLM Wiki performs synthesis at *ingest time*:

```
New Source Arrives
     │
     ▼
LLM reads source → extracts knowledge → integrates into wiki
     │           ├─ creates/updates entity pages
     │           ├─ updates concept summaries
     │           ├─ flags contradictions with existing claims
     │           └─ appends log entry
     ▼
Wiki: a persistent, compounding artifact
     │
     ▼
User Query → LLM reads index.md → reads relevant wiki pages → synthesizes answer
     │                                                              │
     └──────────────────────────────────────────────────────────────┘
                    (good answers filed back as new wiki pages)
```

Karpathy's framing: **"Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."**[^3]

---

## Architecture: Three Layers

### Layer 1: Raw Sources (Immutable)
- Articles, papers, images, data files
- The LLM reads from but **never modifies** raw sources
- Source of truth — everything else is derived from these
- Populated by the human (curator role)

### Layer 2: The Wiki (LLM-Owned)
A directory of markdown files, entirely written and maintained by the LLM:

| Page Type | Purpose |
|-----------|---------|
| **Summary pages** | Per-source summaries of ingested documents |
| **Entity pages** | Pages for named people, places, organizations, products |
| **Concept pages** | Topic and idea pages (not tied to a single source) |
| **Comparison pages** | Side-by-side analysis of related items |
| **Overview/synthesis** | High-level synthesis across all sources |
| **index.md** | Master catalog with all pages, one-line summaries, metadata |
| **log.md** | Append-only chronological record of all operations |

### Layer 3: The Schema (Human–LLM Co-evolved)
- A configuration document: `CLAUDE.md` (for Claude Code), `AGENTS.md` (for Codex), or similar
- Tells the LLM:
  - Directory structure conventions
  - Page format standards
  - Workflow procedures (how to ingest, how to query, how to lint)
- Described as "the key configuration file — it's what makes the LLM a disciplined wiki maintainer rather than a generic chatbot"[^3]
- Evolves over time as the user discovers what works for their domain

---

## Operations

### 1. Ingest

**Trigger:** Human drops a source into the raw collection and tells the LLM to process it.

**Flow:**
1. LLM reads the source
2. Discusses key takeaways with the human
3. Writes a summary page to the wiki
4. Updates `index.md`
5. Updates relevant entity and concept pages (a single source may touch **10–15 wiki pages**)
6. Appends an entry to `log.md`

**Human involvement:** Karpathy personally prefers one-at-a-time ingestion, staying involved to read summaries and guide emphasis. Batch ingestion is also possible with less supervision.

### 2. Query

**Flow:**
1. User asks a question
2. LLM reads `index.md` to find relevant pages
3. LLM drills into specific pages
4. Synthesizes answer with citations

**Output formats can vary:**
- Markdown page
- Comparison table
- Slide deck (Marp format)
- Chart (matplotlib)
- Canvas

**Key insight:** Good answers should be **filed back into the wiki as new pages** — not discarded into chat history. This causes explorations to compound just like ingested sources do.[^3]

### 3. Lint

A periodic health-check operation where the LLM reviews the wiki for:
- Contradictions between pages
- Stale claims superseded by newer sources
- Orphan pages (no inbound links)
- Important concepts without their own pages
- Missing cross-references
- Data gaps that could be filled via web search
- Suggested new questions to investigate

---

## Indexing and Navigation

### index.md — Content-Oriented Catalog
- Lists every wiki page with a link + one-line summary + optional metadata (date, source count)
- Organized by category (entities, concepts, sources, etc.)
- Updated on **every ingest**
- LLM reads `index.md` first on every query to find relevant pages
- Works at moderate scale (~100 sources, ~hundreds of pages) without embedding-based RAG

### log.md — Chronological Append-Only Record
- Records all operations: ingests, queries, lint passes
- Structured prefix for parseability: `## [2026-04-02] ingest | Article Title`
- Parseable with UNIX tools: `grep "^## \[" log.md | tail -5`
- Gives the LLM context about what's been done recently

---

## Tooling Ecosystem

### Obsidian
Used by Karpathy as the *reading interface* for the wiki:
- **Graph view**: visualizes page connections — hubs, orphans, clusters
- **Web Clipper**: browser extension that converts web articles to markdown (primary source ingestion tool)
- **Local image download**: `Settings → Files → Attachment folder` + hotkey for downloading images locally
- **Marp plugin**: render markdown as slide decks
- **Dataview plugin**: query YAML frontmatter across pages (dynamic tables/lists if LLM adds frontmatter)

### qmd (by [tobi/qmd](https://github.com/tobi/qmd))
Recommended as the wiki search engine at larger scale:

| Feature | Details |
|---------|---------|
| **Search modes** | BM25 keyword, vector semantic, hybrid + LLM re-ranking |
| **Runtime** | Fully on-device via node-llama-cpp with GGUF models |
| **CLI** | `qmd search`, `qmd vsearch`, `qmd query`, `qmd get`, `qmd multi-get` |
| **MCP server** | Exposes `query`, `get`, `multi_get`, `status` tools for LLM agent integration |
| **HTTP transport** | Optional `qmd mcp --http` for shared long-lived server (avoids model reload cost) |
| **Claude Code plugin** | `claude plugin marketplace add tobi/qmd` |
| **SDK** | `@tobilu/qmd` npm package for embedding in Node.js/Bun apps |

**Search strategy qmd supports:**
1. `lex` — BM25 full-text (fast, no model needed)
2. `vec` — Vector similarity (embedding model, semantic)
3. `hyde` — Hypothetical Document Embedding (generate fake doc, embed, compare)
4. Combined via RRF (Reciprocal Rank Fusion) + LLM re-ranking

### Git
- The wiki directory is a plain git repo
- Version history, branching, and collaboration come for free

---

## Use Cases

| Domain | Application |
|--------|-------------|
| **Personal** | Goals, health, psychology, journal entries, podcast notes, self-improvement tracking |
| **Research** | Deep topic exploration over weeks/months — papers, articles, reports → evolving thesis |
| **Book reading** | Chapter-by-chapter filing → character pages, theme pages, plot threads, a companion wiki |
| **Business/team** | Slack threads, meeting transcripts, project docs, customer calls → living internal wiki |
| **Competitive analysis** | Market intelligence compiled and maintained over time |
| **Due diligence** | Investment or M&A research with structured entity/topic pages |
| **Trip planning** | Locations, logistics, interests → organized reference |
| **Course notes** | Lecture-by-lecture ingestion → structured study guide |
| **Hobby deep-dives** | Anything where knowledge accumulates over time |

---

## Why It Works: The Economics of Maintenance

The reason personal wikis fail is not lack of interest — it's the **maintenance burden**:
- Cross-references go stale
- Summaries don't get updated when new sources arrive
- Contradictions pile up unresolved
- Consistent formatting degrades
- The bookkeeping eventually costs more than the value

**LLMs eliminate this cost:**
- Don't get bored
- Don't forget to update a cross-reference
- Can touch 15 files in one pass
- Cost of maintenance approaches zero

Karpathy's human/LLM division of labor[^3]:
- **Human's job:** Curate sources, direct analysis, ask good questions, think about what it means
- **LLM's job:** Everything else — summarizing, cross-referencing, filing, bookkeeping, consistency

---

## Relationship to Prior Art

| System | Relationship |
|--------|-------------|
| **Vannevar Bush's Memex (1945)** | Spiritual predecessor — private, curated, associative trails. LLM solves the maintenance problem Bush couldn't |
| **Traditional RAG** | LLM Wiki replaces query-time synthesis with ingest-time compilation. Complementary, not competing — can be used together |
| **NotebookLM** | Stateless RAG — no persistent compiled knowledge, rediscovers on each query |
| **ChatGPT file uploads** | Same limitation as NotebookLM |
| **Obsidian** | Used as the reading/browsing interface, not replaced |
| **Personal wikis (TiddlyWiki, Notion, Confluence)** | LLM Wiki automates the maintenance that causes human-run wikis to fail |
| **Zettelkasten / Second Brain** | Similar concept of a personal knowledge graph, but LLM Wiki automates the linking/filing labor |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          HUMAN LAYER                            │
│  Curate sources, ask questions, guide analysis, read the wiki   │
└────────────────────────────┬────────────────────────────────────┘
                             │  Sources / Questions
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        LLM AGENT                                │
│  (Claude Code, Codex, etc. — configured by CLAUDE.md/AGENTS.md) │
└──────┬──────────────────────┬──────────────────────┬───────────┘
       │ reads                │ writes               │ reads
       ▼                      ▼                      ▼
┌─────────────┐     ┌──────────────────────┐  ┌────────────────┐
│ Raw Sources │     │      THE WIKI        │  │    Schema      │
│ (immutable) │     │  ┌────────────────┐  │  │  CLAUDE.md /   │
│             │     │  │   index.md     │  │  │  AGENTS.md     │
│ articles    │     │  │   log.md       │  │  │  (conventions, │
│ papers      │     │  │   entities/    │  │  │   workflows)   │
│ images      │     │  │   concepts/    │  │  └────────────────┘
│ transcripts │     │  │   summaries/   │  │
└─────────────┘     │  │   synthesis/   │  │
                    │  └────────────────┘  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │      OBSIDIAN        │
                    │  (reading interface) │
                    │  Graph view, search, │
                    │  Dataview, Marp      │
                    └──────────────────────┘
                               │ (at scale)
                               ▼
                    ┌──────────────────────┐
                    │    qmd search engine │
                    │ BM25 + vector + LLM  │
                    │  re-ranking, MCP     │
                    └──────────────────────┘
```

---

## Implementation Guidance (Derived from the Pattern)

Since the document is intentionally abstract, here is what a concrete implementation should decide:

### Directory Structure (Example)
```
wiki/
├── CLAUDE.md          # Schema — LLM's operating instructions
├── index.md           # Master catalog
├── log.md             # Append-only operation log
├── raw/               # Raw sources (immutable)
│   ├── articles/
│   ├── papers/
│   └── assets/        # Downloaded images
├── entities/          # Named entities (people, orgs, places)
├── concepts/          # Topic and idea pages
├── sources/           # Per-source summaries
├── comparisons/       # Side-by-side analyses
└── synthesis/         # High-level overviews
```

### CLAUDE.md / Schema Content (Example)
```markdown
## Wiki Structure
- entities/ — one page per named entity
- concepts/ — one page per topic
- sources/ — one summary per ingested source
- index.md — master catalog, updated every ingest
- log.md — append-only log, format: ## [YYYY-MM-DD] op | title

## Ingest Workflow
1. Read the source fully
2. Discuss key takeaways with the user
3. Write sources/{title}.md
4. Update entities/ and concepts/ pages as needed
5. Update index.md
6. Append to log.md

## Query Workflow
1. Read index.md to identify relevant pages
2. Read those pages
3. Synthesize and answer with citations
4. Offer to file the answer as a new wiki page

## Lint Workflow
Check for: orphans, contradictions, stale claims, missing pages, data gaps
```

---

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|-----------|-------|
| Gist title, author, and full content | **High** | Directly fetched from gist[^4] |
| Karpathy's background and stature | **High** | GitHub profile[^1] |
| Memex historical accuracy | **High** | Wikipedia[^2] |
| qmd search engine capabilities | **High** | Fetched directly from tobi/qmd README[^5] |
| Specific implementation details (dir structure, CLAUDE.md content) | **Inferred** | Document is intentionally abstract; concrete examples derived from patterns described |
| Karpathy's personal usage of Obsidian | **High** | Explicitly stated in the gist |
| Approximate scale guidance (~100 sources, ~hundreds of pages) | **High** | Directly quoted from gist |

---

## Key Repositories Summary

| Repository | Purpose | Key Files |
|-----------|---------|-----------|
| [karpathy/442a6bf…](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | The LLM Wiki pattern document itself | Single markdown gist |
| [tobi/qmd](https://github.com/tobi/qmd) | Recommended wiki search engine (BM25 + vector + reranking) | README, `@tobilu/qmd` npm package |
| [Obsidian.md](https://obsidian.md) | Recommended reading/browsing UI for the wiki | Web Clipper, Graph View, Dataview, Marp plugins |

---

## Footnotes

[^1]: Andrej Karpathy's GitHub profile: [https://github.com/karpathy](https://github.com/karpathy) — creator of nanoGPT (56.9k stars), nanochat, llm.c, llama2.c, micrograd.

[^2]: Wikipedia — Memex: [https://en.wikipedia.org/wiki/Memex](https://en.wikipedia.org/wiki/Memex) — Vannevar Bush's 1945 hypothetical device for storing all knowledge with associative trails, from the essay *"As We May Think"*.

[^3]: Karpathy's LLM Wiki Gist (raw): [https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw](https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw) — All direct quotes and architectural details sourced from here.

[^4]: Gist rendered page: [https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

[^5]: tobi/qmd README: [https://github.com/tobi/qmd](https://github.com/tobi/qmd) — Capabilities of the recommended search engine: BM25, vector, hybrid, MCP server, Claude Code plugin.
