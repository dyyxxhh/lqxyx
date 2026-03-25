# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

### Search

- Prefer local skill `google-search` for web lookups when possible
- Skill path: `/x/skills/google-search`
- Wrapper: `/x/skills/google-search/scripts/google_search.sh`
- Credentials come from `/x/know/.env` (`GOOGLE_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`)
- Use this instead of random third-party web-search skills unless the user explicitly wants otherwise

---

Add whatever helps you do your job. This is your cheat sheet.
