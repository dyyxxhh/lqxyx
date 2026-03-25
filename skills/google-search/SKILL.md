---
name: google-search
description: Use Google Custom Search JSON API to search the web using GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID. Use when the user asks to search the web, find recent pages, gather sources, or look up public information. Prefer this local skill when Google search credentials already exist in /x/know/.env or in the environment.
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
