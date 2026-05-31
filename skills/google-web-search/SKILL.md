---
name: google-web-search
description: "Open a Google web search results page for a user-provided query. Use when: user asks to search Google, look something up on Google, or open Google results for a topic. The search term is appended after https://www.google.com/search?q=."
metadata: { "local": { "requires": { "bins": ["curl"] } } }
---

# Google Web Search

Open a Google search URL for a user-provided query.

## When to Use

Use this skill when the user:

- Asks to search Google for a topic
- Wants a Google results page opened for a phrase
- Wants a quick browser-search URL for a query
- Asks for a Google search link instead of a summarized answer

## When NOT to Use

Do not use this skill when the user:

- Wants a curated summary instead of a search results page
- Needs API-driven structured search results
- Needs private authenticated browsing steps
- Wants a non-Google search engine

## Inputs

- `ARGUMENTS` — the raw search phrase to append after `q=`

## Command

Use `curl` to request the Google search URL built from the user query.

```bash
curl "https://www.google.com/search?q=$ARGUMENTS"
```

## Output

Return the full Google search URL. Example:

```text
https://www.google.com/search?q=ai%20news
```

## Notes

- This skill generates the URL only; it does not scrape or summarize Google results.
- The query is passed directly into the Google search URL.
- If browser automation is needed after generating the URL, pair this skill with a browser-capable workflow.
