# Learnings: MCM Minecraft Manager Expansion

## 2026-06-25T11:48:00Z Task: 3

### AGPL & Compliance Gates

1. **cargo-deny 0.19 changed config format.** The old `deny = [...]`, `unlicensed`, `copyleft`, `default`, `allow-osi-fsf-free` keys have been removed (per https://github.com/EmbarkStudios/cargo-deny/pull/611). The new config uses only `allow = [...]` plus `exceptions`. Unlisted licenses are denied by default. This is cleaner but means any template from older docs is wrong.

2. **Transitive dep licenses to allow:** ICU Unicode crates (icu_*) use `Unicode-3.0`, not `Unicode-DFS-2016`. `webpki-roots` uses `CDLA-Permissive-2.0`. Both are OSI-approved and permissive.

3. **Workspace crate license vs dep license:** The project's own AGPL license must be in the allow list for `cargo deny` to pass on the workspace crate itself. A clarifying comment is necessary here to distinguish "we license our own code as AGPL" from "we allow AGPL dependencies."

4. **`cargo deny check licenses`** does not require an advisory DB fetch — it runs purely against the resolved dependency graph. This makes it suitable for CI without network access (for the license check; advisories need the DB).

5. **AGPLv3 text** is ~670 lines from gnu.org. The "How to Apply" section at the bottom should include the project name and copyright holder.

6. **Clean-room policy:** HMCL is GPLv3+extra-terms; PCL/PCL2 is custom restricted. Both forbid code copying. Only conceptual UX reference is permitted.
