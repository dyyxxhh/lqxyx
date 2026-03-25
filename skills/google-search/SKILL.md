---
name: google-search
description: Search the public web with Google Custom Search JSON API. Use whenever the user asks to search the web, look something up online, find sources, check recent information, research a topic, compare webpages, or gather links. Prefer this local skill over third-party web-search skills when /x/know/.env or the environment already provides GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID. Triggers on phrases like "搜一下", "查一下", "search", "web search", "google 一下", "找资料", "找来源", "联网搜索", or any request for online sources.
---

# Google Search

Use the bundled script to run Google Custom Search safely.

## Credential loading

The wrapper prefers existing environment variables:

- `GOOGLE_API_KEY`
- `GOOGLE_SEARCH_ENGINE_ID`

If they are unset, it falls back to reading them from:

- `/x/know/.env`

## Recommended usage

```bash
/x/skills/google-search/scripts/google_search.sh --query "OpenClaw skills security" --num 5
```

Optional flags:

- `--start 1` → result offset (Google starts at 1)
- `--site example.com` → restrict to a site
- `--safe active|off`

## Output

Returns JSON with:

- `query`
- `executedQuery`
- `totalResults`
- `items[]` containing:
  - `title`
  - `link`
  - `snippet`
  - `displayLink`

## Notes

- Reads API credentials from env or `/x/know/.env` only.
- Does not download or execute external code.
- Uses Google Custom Search JSON API endpoint directly.
- If the wrapper cannot find credentials, run the Node script directly after exporting the env vars.
