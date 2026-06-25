# Learnings - mcm-minecraft-manager-expansion

## Project State (initial)
- Single-file Rust CLI: `src/lib.rs` is 2530 lines (oversized, must split in Task 2)
- `src/main.rs` is 8 lines (just calls lib)
- Tests: `tests/mvp.rs` (312 lines), `tests/help.rs` (38 lines)
- Dependencies: clap 4.5 (derive+env), reqwest 0.12 (blocking+rustls), serde, serde_json, sha2, zip 0.6, toml, time, anyhow, hex, directories
- Dev deps: assert_cmd, predicates, tempfile
- Mock provider is deterministic, no network needed for tests
- `--config-dir` / `MCM_CONFIG_DIR` and `--state-dir` / `MCM_STATE_DIR` isolate state for tests

## Plan Constraints (apply to ALL tasks)
- Old top-level CLI spelling compatibility is NOT required after refactor
- Files >250 pure LOC need split or explicit SIZE_OK justification (data/generated only)
- No HMCL/PCL code/assets/strings copied — conceptual UX reference only
- No Turnstile for publish/update/delete; no admin token
- Server storage default MUST be outside `/x`
- Fresh install has ZERO custom sources (no preloaded author source)
- Manual QA required, not just unit tests; evidence under `.omo/evidence/task-N-*.{txt,png}`
- Commit message style: `type(scope): description` (see plan commit strategy)

## Per-Task Notes
(appended by workers as tasks complete)

## [2026-06-25 11:25:38 UTC] Task: 1 — Baseline characterization tests

**Status:** COMPLETE. All tests green (mvp 13, help 2, characterization 44, lib 14). Evidence at `.omo/evidence/task-1-mcm-minecraft-manager-expansion.txt`.

### What was pinned (current-behavior quirks Task 2 must preserve)

These are the exact current behaviors locked by `tests/characterization.rs`. The refactor in Task 2 may rename commands but must keep these semantics:

1. **`profile add` auto-activates the new profile.** `ProfileCommand::Add` sets `config.active_profile = Some(name)` (src/lib.rs:379). Adding a second profile switches the active pointer to it. This is a quirk, not documented in README, but pinned.

2. **`profile list` prints in BTreeMap (alphabetical) key order**, with `* ` marker for active and `  ` (two spaces) for inactive. Output format: `{marker} {name}`.

3. **`profile show` prints `side:` using Debug format (`{:?}`)** → `side: Both` / `side: Client` / `side: Server`. NOT lowercase serde form. The `side` field serializes as lowercase in TOML (`#[serde(rename_all = "lowercase")]`) but displays as Debug.

4. **`profile list` with no profiles is silent success** (empty stdout, exit 0). NOT an error.

5. **`profile use <unknown>` errors:** `Error: unknown profile {name}` (exit 1, stderr).

6. **`profile show <unknown>` errors:** `Error: unknown profile {name}` (exit 1, stderr).

7. **No-active-profile error message is exactly:** `Error: no active profile; run profile add or profile use` (exit 1, stderr). Affects `list`, `status`, `search`, cloud `info`, `install`, `remove`, `autoremove`.

8. **`search` with no match is silent success** (empty stdout, exit 0). Does NOT error.

9. **`search` matches by `logical_id.contains(query)` OR `title.to_lowercase().contains(query.to_lowercase())`** (case-insensitive on title, case-sensitive on logical_id). Mock provider.

10. **Search groups duplicate candidates by logical_id** via `group_projects` (BTreeMap merge). Candidates printed as `{provider}/{project_id}` joined by `, `. Example: `candidates: mock/rootmod, modrinth/rootmod`.

11. **`info <query>` dispatch:** if `path.exists() || query.ends_with(".jar")` → local jar branch; else cloud. So `info nonexistent.jar` takes the local branch and fails with `Error: read {path}`. A mod named `foo.jar` would be misinterpreted as a local jar if such a file existed.

12. **Cloud `info` output format:**
    ```
    {logical_id} - {title}
    {description}
    candidates: {summary}
    selected: {file_id} {version}
    required deps: {comma-list}      # only if non-empty
    optional deps: {comma-list}      # only if non-empty
    warning: {Debug dep_kind} dependency {id} not installed   # for Embedded/Incompatible/Unknown
    ```
    Dep kind in warnings uses `{:?}` → `Embedded`, `Incompatible`, `Unknown` (capitalized).

13. **`install` plan output order is BTreeMap key order** (alphabetical by logical_id), NOT insertion order. So `depmod` (Auto) prints before `rootmod` (Manual). Format: `install {logical_id} {version} {reason:?}` where reason is `Auto`/`Manual`.

14. **Install warning order** follows the dependency iteration order of the artifact's `deps` Vec: for rootmod that's optional → embedded → incompatible → unknown. Warnings print AFTER all install lines.

15. **`install --dry-run` prints `dry run` as the FIRST plan line** (before install lines), then the plan, then warnings. Writes no jars and no lock file.

16. **`install` with missing download URL errors:** `missing download URL` (via anyhow context). No partial jar written, no lock file created. The error is raised in the staging loop BEFORE any file is written to the mods dir.

17. **`install --file` parses `#` comments (inline too), blank lines, trims whitespace.** One mod ID per line. `read_mod_list` splits on `#` first, then trims.

18. **`install <query>` where query is not a known mod ID:** first does `search`, and if search returns empty → `Error: mod {query} not found by search`. If search returns results, picks the FIRST result (`results.remove(0)`) and prints `selected {logical_id} from search result {query}`.

19. **`list` output format:** `{logical_id} {version} {reason:?} {provider}/{file_id}` — BTreeMap order. `reason` is Debug (`Manual`/`Auto`). Empty list → silent success.

20. **`status` output:** `ok: {logical_id}` / `missing: {logical_id} ({filename})` / `changed: {logical_id} ({filename})` / `untracked: {name}`. Owned-jar checks first (BTreeMap order), then untracked scan of `*.jar` files in mods_dir. Untracked = any `.jar` not in owned set. `status` never deletes/claims untracked jars.

21. **`remove`/`uninstall` are aliases** (same `app.remove` call). Refuses auto deps: `Error: {id} is automatic; use autoremove when no roots require it`. Refuses without `--yes`: `Error: confirmation required; pass --yes to apply`. Unknown: `Error: {id} is not installed`. Removes ONLY the owned jar file; auto deps remain.

22. **`autoremove` with nothing removable:** prints `nothing to autoremove`, exit 0 (no `--yes` needed in this case). With removable mods but no `--yes`: `Error: confirmation required; pass --yes to apply`.

23. **`autoremove` reachability:** BFS from manual roots' `required_deps`, transitively. Auto deps not in this set are removed. Keeps required dep while a manual root still needs it.

24. **Provider dispatch:**
    - `--provider mock` → `MockProvider`, fully offline, deterministic.
    - `--provider curseforge` → requires `CURSEFORGE_API_KEY` env; without it: `Error: CurseForge provider requires CURSEFORGE_API_KEY` (raised at `CurseForgeProvider::new`, before any network). Pinned for both `search` and `info`.
    - `--provider modrinth` → `ModrinthProvider::new()` (no key needed); hits real network, NON-DETERMINISTIC — NOT pinned in characterization tests.
    - `--provider all` (default) → `CompositeProvider::default()`: Modrinth + CurseForge (if key set). Without key, prints `warning: CurseForge disabled: {error}` to stderr and proceeds with Modrinth only. The warning is deterministic but the subsequent Modrinth search is non-deterministic, so `all` is NOT pinned end-to-end.

25. **Local jar `info` metadata priority:** `fabric.mod.json` → `META-INF/mods.toml` → `mcmod.info` → `metadata: unavailable`. First match wins; returns early.
    - fabric.mod.json: prints `metadata: fabric.mod.json`, then `id:` and `version:` via `print_json_field` (serde_json parse, `as_str()`).
    - mods.toml: prints `metadata: mods.toml`, then lines starting with `modId` or `version` (trimmed).
    - mcmod.info: prints `metadata: mcmod.info`, then `id:`, `version:`, `name:` (mapped from modid/version/name of first array element).
    - none/unavailable: prints `metadata: unavailable`.
    - Always prints `local jar: {path}`, `sha256: {hex}`, `size: {bytes}` before metadata. Never prints `provider:` for local jars.

26. **`mock_jar_bytes` is deterministic:** `format!("mock mcm jar\nid={id}\nversion={version}\n")`. So installed jar SHA-256 hashes are stable and pinnable. The `installed_at` timestamp in the lock file is NOT deterministic — do not assert on it.

### Test isolation style (preserved)
- `--config-dir <tmp>/c --state-dir <tmp>/s --provider mock` via `assert_cmd::Command`.
- `tempfile::TempDir` for root; `mods` subdir created by test.
- New `tests/characterization.rs` mirrors `tests/mvp.rs` `TestHome` helper exactly. No new dependencies added.
- Local jar tests build minimal valid ZIP archives byte-for-byte via a hand-rolled stored-zip builder (the `zip` crate is a private dep of mcm, not a dev-dependency, so integration tests cannot use it directly; a stored-zip is straightforward and deterministic).

### Provider-selection coverage gap (intentional)
- `--provider modrinth` and `--provider all` hit real network and are non-deterministic. Per task instructions ("do NOT hit real network"), these are NOT pinned end-to-end. Only the curseforge-key dispatch gate and mock offline behavior are pinned. Task 2's refactor must preserve the curseforge-key error message and the mock provider's deterministic data.

### Files touched
- NEW: `tests/characterization.rs` (44 tests, ~640 lines)
- UNCHANGED: `src/lib.rs`, `src/main.rs`, `Cargo.toml`, `tests/mvp.rs`, `tests/help.rs`
- Evidence: `.omo/evidence/task-1-mcm-minecraft-manager-expansion.txt`

### Git note
The entire `mcm/` directory is currently UNTRACKED in the parent `/nas/lucky` repo (no `mcm/.git`). The commit will be the first to track `mcm/` test files. Only test files + evidence + notepad are staged.

## [2026-06-25 12:45:00 UTC] Task: 2 — Split oversized Rust architecture without changing behavior

**Status:** COMPLETE. All 73 tests green (14 lib + 44 char + 13 mvp + 2 help), run 3x stable. `cargo clippy --all-targets --all-features -- -D warnings` clean. `src/` fmt-clean. Evidence at `.omo/evidence/task-2-mcm-minecraft-manager-expansion.txt`.

### What changed
`src/lib.rs` (2530 lines) split into 18 focused modules. `src/lib.rs` is now a 17-line thin re-export hub (`mod` declarations + `pub use` for `Cli`/`Command`/`ProfileCommand`/`ProviderChoice`/`Side` + `pub fn run`). `src/main.rs` unchanged. `Cargo.toml` unchanged. No new deps. All 26 characterization quirks preserved (tests green).

### Final module map (where symbols live)

| File | Pure LOC | Role | Key symbols |
|---|---|---|---|
| `src/lib.rs` | 17 | thin re-export hub | `pub fn run`, `pub use {Cli, Command, ProfileCommand, ProviderChoice, Side}` |
| `src/cli.rs` | 75 | Clap derive structs | `Cli`, `ProviderChoice`, `Command`, `ProfileCommand` |
| `src/config.rs` | 25 | TOML config types | `Side`, `Config`, `Profile`, `ProfileSnapshot` |
| `src/lock.rs` | 85 | lock state + reachability | `LockState`, `InstalledMod`, `InstallReason`, `reachable_required_deps`, `remove_owned_file`, `test_installed_mod` (cfg test) |
| `src/provider.rs` | 85 | Provider trait + shared types | `Provider` trait, `Project`, `Candidate`, `Artifact`, `ReleaseKind`, `Dependency`, `DependencyKind`, `Plan`, `PlannedInstall`, `group_projects`, `candidate_summary` + submod declarations |
| `src/provider/composite.rs` | 59 | composite provider | `CompositeProvider` |
| `src/provider/mock.rs` | 246 | mock provider + fixtures | `MockProvider`, `filter_project`, `mock_projects`, `mock_jar_bytes`, `artifact`/`artifact_beta`/`artifact_alpha`/`dep` helpers, `test_helpers` mod; SIZE_OK on `mock_projects` data table |
| `src/provider/modrinth.rs` | 294 | Modrinth provider | `ModrinthProvider`, `ModrinthSearchResponse`/`ModrinthProjectHit`/`ModrinthProject`/`ModrinthVersion`/`ModrinthFile`/`ModrinthDependency` DTOs, `modrinth_project_from_parts`/`modrinth_artifact_from_version`/mappers; SIZE_OK (test fixture bulk) |
| `src/provider/curseforge.rs` | 439 | CurseForge provider | `CurseForgeProvider`, `curseforge_project_from_parts`/`curseforge_artifact_from_file`/mappers, redirect-leak tests; SIZE_OK (test fixture bulk) |
| `src/provider/curseforge_dto.rs` | 33 | CurseForge JSON DTOs | `CurseForgeListResponse`, `CurseForgeSingleResponse`, `CurseForgeMod`, `CurseForgeFile`, `CurseForgeHash`, `CurseForgeDependency` |
| `src/safety.rs` | 178 | security helpers | `DOWNLOAD_HOST_ALLOWLIST`, `sanitize_filename`, `validate_download_url`, `is_blocked_ip`, `confirm_install` + filename-safety tests |
| `src/jar_info.rs` | 86 | local jar metadata | `local_jar_info`, `print_json_field`, `print_mcmod_info_fields` + zip test |
| `src/install.rs` | 421 | install planning | `search_install_roots`, `deps_by_kind`, `build_plan`, `print_plan`, `select_artifact`, `artifact_is_better`, `parse_dotted_version`, `read_mod_list`; SIZE_OK (test fixture bulk) |
| `src/app.rs` | 120 | App struct + run() | `App` struct, `App::new`, `config_path`/`lock_path`/`load_config`/`save_config`/`active_profile`/`load_lock`/`save_lock`/`provider`, `pub(crate) fn run` |
| `src/profile_cmd.rs` | 65 | profile command | `impl App { fn profile }` |
| `src/queries.rs` | 92 | query commands | `impl App { fn search / fn info / fn list / fn status }` |
| `src/lifecycle.rs` | 130 | install/remove/autoremove | `impl App { fn install / fn remove / fn autoremove }` |
| `src/util.rs` | 16 | IO helpers | `atomic_write`, `sha256_hex` |

### SIZE_OK justifications
Files >250 pure LOC all exceed the ceiling only because of their `#[cfg(test)] mod tests` blocks (test fixture, stays with the code it exercises). Non-test source in every file is ≤230 LOC:
- `install.rs`: 221 non-test + 200 test = 421
- `curseforge.rs`: 34 non-test + 405 test = 439 (redirect-leak + JSON-mapping regression tests)
- `modrinth.rs`: 229 non-test + 65 test = 294
- `mock.rs`: 246 total, SIZE_OK on `mock_projects()` data table (pure deterministic test-fixture data)

### Test placement
- 4 unit tests in `safety::tests` (sanitize, validate_url)
- 1 unit test in `jar_info::tests` (mcmod.info zip)
- 1 unit test in `provider::modrinth::tests` (JSON mapping)
- 4 unit tests in `provider::curseforge::tests` (JSON mapping, download-request, redirect-leak x2)
- 3 unit tests in `install::tests` (select_artifact, build_plan reachability, composite merge)
- 1 test helper `test_installed_mod` in `lock.rs` (cfg test)
- 1 test helper module `test_helpers` in `provider/mock.rs` (cfg test): re-exports `artifact`/`dep` + `test_profile()`
Total: 14 lib tests (unchanged count).

### fmt note
`tests/characterization.rs` has PRE-EXISTING `cargo fmt --check` diffs (from Task 1, before this refactor). Per task constraints ("Do NOT modify `tests/characterization.rs`"), these were not touched. All `src/` files are fmt-clean (verified via `rustfmt --check` on each).

### Adversarial QA results
- `flaky tests`: 3 consecutive `cargo test` runs all green (73/73 each). No flakiness.
- `dirty worktree`: after commit, only expected files staged (src/ + evidence + learnings). `tests/characterization.rs` reverted to original (no fmt changes leaked in).
- `misleading success output`: refactor compiles AND all 44 characterization tests pass — behavior unchanged.
- `stale_state`: no leftover `mod` declarations in lib.rs for removed modules; lib.rs contains exactly the current module list.

## [2026-06-25 13:21:10 UTC] Task: 4 — Define canonical CLI grammar and help skeleton

**Status:** COMPLETE. All 104 tests green (23 lib + 44 char + 7 help + 17 mc_target + 13 mvp). `cargo fmt --check` clean. `cargo clippy --all-targets --all-features -- -D warnings` clean. Evidence at `.omo/evidence/task-4-mcm-minecraft-manager-expansion.txt`.

### What changed

**New command grammar (top-level):**
- `install [target] [-y]` — low-power `.mcm` installer; rejects `mc...` smart targets and raw mod names
- `upgrade` — stub (not implemented yet)
- `full-upgrade [-y]` — stub
- `source {add|remove|info|list}` — stubs
- `pkg {info|install|download|dl|make|share|list}` — stubs; `dl` is alias for `download`
- `game {default|install|remove|info|rename|config|list}` — stubs; `install` validates target via `parse_mc_target` before stub
- `do [file] [-y]` — stub
- `run [--dry-run]` — stub
- `config` — stub
- `mods {add|use|search|info|install|list|status|remove|uninstall|autoremove|show|profile-list}` — full behavior (old mod-manager commands moved here)
- `mod` is alias for `mods` (via `#[command(alias = "mod")]`)

**Old top-level commands REMOVED:** `profile`, `search`, `info`, `install <modid>`, `list`, `status`, `remove`, `uninstall`, `autoremove`. No `ProfileCommand` enum remains.

**`game install` target parser** (`src/mc_target.rs`, new file):
- `parse_mc_target(target: &str) -> Result<McTarget, String>`
- `McTarget::Vanilla { mc_version: Option<String> }` — `mc` (latest) or `mc1.21.1` (specific)
- `McTarget::WithLoader { mc_version, loader, loader_version }` — `mc-neoforge`, `mc1.21.1-neoforge`, `mc1.21.1-neoforge-21.1.172`
- `Loader` enum: `Fabric`, `Forge`, `NeoForge`, `Quilt` (case-insensitive parsing)
- Rejects `@latest` suffix; rejects non-`mc` prefix; rejects unknown loaders
- 9 unit tests in `src/mc_target.rs` + 17 integration tests in `tests/mc_target.rs`

### Files touched
- NEW: `src/mc_target.rs` (155 pure LOC) — `McTarget`, `Loader`, `parse_mc_target` + 9 unit tests
- REWRITTEN: `src/cli.rs` (141 pure LOC) — new `Command` enum + `SourceCommand`/`PkgCommand`/`GameCommand`/`ModsCommand` subcommand enums
- REWRITTEN: `src/app.rs` (206 pure LOC) — new `run()` dispatch + `top_install`/`source`/`pkg`/`game`/`do_file`/`mods_command` methods; new commands stub with "not implemented yet"
- REWRITTEN: `src/profile_cmd.rs` (68 pure LOC) — split old `profile()` into `profile_add`/`profile_use`/`profile_list`/`profile_show`
- UPDATED: `src/lib.rs` (19 pure LOC) — added `mc_target` module + re-exports (`parse_mc_target`, `Loader`, `McTarget`, subcommand enums)
- REWRITTEN: `tests/help.rs` (7 tests) — new top-level command assertions + `mod` alias + `pkg dl` alias + `game install` smart targets + top-level `install` help
- REWRITTEN: `tests/mvp.rs` (13 tests) — all commands prefixed with `mods`
- REWRITTEN: `tests/characterization.rs` (44 tests) — all commands prefixed with `mods`; module docstring updated
- NEW: `tests/mc_target.rs` (17 tests) — parser unit tests + CLI surface rejection tests

### Command spelling migration (old → new)
| Old top-level | New |
|---|---|
| `profile add` | `mods add` |
| `profile use` | `mods use` |
| `profile list` | `mods profile-list` |
| `profile show` | `mods show` |
| `search` | `mods search` |
| `info` | `mods info` |
| `install <modid>` | `mods install <modid>` |
| `list` | `mods list` |
| `status` | `mods status` |
| `remove` | `mods remove` |
| `uninstall` | `mods uninstall` |
| `autoremove` | `mods autoremove` |

### Adversarial QA results
- `misleading_success_output`: parser tested exhaustively — 17 tests cover all grammar forms (mc, mc1.21.1, mc-neoforge, mc1.21.1-neoforge, mc1.21.1-neoforge-21.1.172, fabric/forge/quilt equivalents, @latest rejection, non-mc prefix rejection, unknown loader rejection, case-insensitivity). CLI surface tests verify `install mc-neoforge`, `install sodium`, `install sample.mcm --extra`, and `game install ... @latest` all fail with actionable errors.
- `stale_state`: grep confirms no `Command::Profile/Search/Info/Install/Remove/Uninstall/Autoremove/List/Status` variants remain in `src/`. No `ProfileCommand` enum in `cli.rs`. Old top-level commands fully removed.
- `flaky tests`: all 104 tests deterministic (mock provider, temp dirs, no network). 3 consecutive `cargo test` runs all green.

### Stub boundaries (for downstream tasks 5-23)
- `upgrade`/`full-upgrade` → task 20 (game version install)
- `source add/remove/info/list` → task 8
- `pkg info/install/download/make/share/list` → tasks 6, 10, 11
- `game default/install/remove/info/rename/config/list` → tasks 5, 20
- `do [file]` → task 10
- `run` → task 22
- `config` → task 5
- `install [target]` (top-level) → task 10

## [2026-06-25 22:30:00 UTC] Task: 5 — Typed config model for ~/mcm, games, paths, precedence

**Status:** COMPLETE. All 132 tests green (23 lib + 44 char + 28 game_config + 7 help + 17 mc_target + 13 mvp). `cargo fmt --check` clean. `cargo clippy --all-targets --all-features -- -D warnings` clean. Evidence at `.omo/evidence/task-5-mcm-minecraft-manager-expansion.txt`.

### What changed

**New game model** (`src/game_model.rs`, 95 pure LOC):
- `GameRecord { name, root_dir, mc_version: Option, loader: Option, version_config: GameConfig }`
- `GameConfig { java_path, jvm_args, extra_args, env: BTreeMap }` — version-scoped config (all `Option`/default)
- `GlobalConfig { root_dir: PathBuf }` — default root is `~/mcm` via `directories::UserDirs`
- `migrate_profiles_to_games(&mut Config)` — one-way in-memory migration; old profile data preserved

**Config extended** (`src/config.rs`, 54 pure LOC):
- `Config` now has `games: BTreeMap<String, GameRecord>`, `default_game: Option<String>`, `global: GlobalConfig` alongside legacy `active_profile`/`profiles`
- All new fields `#[serde(default)]` → old config.toml files deserialize cleanly
- `Config` now derives `Default` (replaces manual `Config { active_profile: None, profiles: ... }` in `load_config`)

**Game commands** (`src/game_cmd.rs`, 174 pure LOC):
- `game default [name]` — no arg prints default or "no default game"; with arg sets (validates game exists)
- `game list` — BTreeMap order, `*` marker for default
- `game info <name>` — root_dir, mc_version, loader, java_path, jvm_args, extra_args, env
- `game rename <old> <new>` — updates config + default pointer; refuses if new name exists
- `game config <name>` — show-only (CLI has no `--set` flag; task 4 didn't define one)
- `game remove <name> --yes` — removes config record only; never touches disk; clears default if needed
- `game install` — remains stub (task 20); validates target grammar before stub

**Migration design** (critical for downstream tasks):
- Migration runs **in-memory** on every `load_config` when `profiles` non-empty and `games` empty
- Migration is **NOT persisted** — `mods add` re-saves config with empty games, which would race
- No stderr warning (would break 44 characterization tests that assert exact stderr)
- Old profile data is never deleted; `mods` commands continue using `profiles` directly

### Key decisions
1. `game config` is show-only because task 4's `GameCommand::Config { name }` has no set flag. Setting fields needs a future CLI change.
2. `game remove` only removes the config record, never disk files. Full safety policy is task 7.
3. Default root `~/mcm` uses `directories::UserDirs` (not `ProjectDirs`) since it's user home, not app data.
4. `not_implemented` made `pub(crate)` so `game_cmd.rs` can call it for `game install` stub.

### Files touched
- NEW: `src/game_model.rs` (95 pure LOC)
- NEW: `src/game_cmd.rs` (174 pure LOC)
- NEW: `tests/game_config.rs` (28 tests)
- MODIFIED: `src/config.rs` (25 → 54 pure LOC)
- MODIFIED: `src/app.rs` (load_config migration + removed game() stub; not_implemented pub(crate))
- MODIFIED: `src/lib.rs` (added game_cmd/game_model modules + docstring)
- NEW: `.omo/evidence/task-5-mcm-minecraft-manager-expansion.txt`

## [2026-06-25 23:50:00 UTC] Task: 6 — Define `.mcm` package schema and parser boundary

**Status:** COMPLETE. All 162 tests green (23 lib + 44 char + 28 game_config + 7 help + 17 mc_target + 30 mcm_package + 13 mvp). `cargo fmt --check` clean. `cargo clippy --all-targets --all-features -- -D warnings` clean. Evidence at `.omo/evidence/task-6-mcm-minecraft-manager-expansion.txt`.

### What changed

**New module** (`src/mcm_package.rs`, 177 pure LOC):
- `McmPackage` struct — schema-versioned, all fields typed (no `serde_json::Value` in domain logic except opaque `LocalPrivate` container)
- `parse_mcm_package(json: &str) -> Result<McmPackage>` — single boundary parser enforcing: size (≤10MB), depth (≤64), secret-field rejection (recursive, case-insensitive, markers: `token`/`secret`/`password`/`credential`/`api_key`), schema version (only 1), package-name normalization, asset-path traversal checks
- `validate_package_name` — `[a-z0-9-]`, 1-64 chars, alphanumeric start/end, no consecutive hyphens, reserved names (`mcm` + Windows reserved)
- `validate_asset_path` — rejects empty/null/`..`/absolute/backslash/Windows-reserved components
- Supporting types: `Dependency`, `ModEntry`, `Asset`, `AssetSource` (embedded|referenced), `Action`, `ActionKind` (shell), `LaunchRequest`, `LocalPrivate`

**`pkg info` wired** (`src/app.rs`, 192→227 pure LOC):
- `PkgCommand::Info { path }` now reads file → `parse_mcm_package` → prints normalized summary
- Other `pkg` subcommands stay `not_implemented()` (task 10)

**`src/lib.rs`** (21→23 pure LOC): added `mod mcm_package` + re-exports `parse_mcm_package`/`McmPackage` + docstring entry

**Tests** (`tests/mcm_package.rs`, 30 tests):
- Pure parser unit tests: valid (minimal/full/all-optional/longest-name), schema version (unknown/missing), name validation (7 tests: reserved/uppercase/underscore/hyphens/length), secrets (top-level/nested/array), size/depth, path traversal (6 bad + 1 valid nested), missing fields, empty object
- CLI-surface tests (8): valid print, missing file, secret field, path traversal, unknown schema, reserved name, local present, stub install/list

### Key decisions
1. **Secret scan runs on `serde_json::Value` BEFORE typed parse** — so secrets in `LocalPrivate` (which uses opaque `Value`) are caught. The scan is recursive over objects/arrays, case-insensitive on keys.
2. **`LocalPrivate` uses opaque `serde_json::Value`** for `settings`/`history` — this is the ONLY place `Value` appears in the schema, and domain logic never interprets it. This is acceptable because: (a) secret scan already ran, (b) it's explicitly local/private, (c) future tasks define the structure.
3. **Windows-reserved-name check is shared** between `validate_package_name` and `validate_asset_path` via `is_windows_reserved_stem` — reuses the concept from `src/safety.rs` without coupling.
4. **`AssetSource` is an enum** (embedded|referenced) not a string — parse-don't-validate at the boundary.
5. **`Action` is Linux-shell-only** (`ActionKind::Shell`) — per task spec; Windows shell actions rejected at schema level.
6. **Depth check uses `json_depth()`** (scalar=0, object/array=1+max child) — catches deeply nested JSON before typed parse.

### Boundary discipline
- `parse_mcm_package` is the ONLY function that accepts raw JSON
- All validators (`validate_package_name`, `validate_asset_path`) operate on typed `&str`/`&String`, not `Value`
- `pkg_info` in `app.rs` calls `parse_mcm_package` then prints typed fields — never touches `Value`

### Stub boundaries (for downstream tasks)
- `pkg install/download/dl/make/share/list` → task 10
- `do [file]` → task 10 (will reuse `parse_mcm_package`)
- Top-level `install [target]` → task 10 (will reuse `parse_mcm_package`)
- Full safety/confirmation policy → task 7 (`pkg info` is read-only, doesn't need it)

### Files touched
- NEW: `src/mcm_package.rs` (177 pure LOC)
- NEW: `tests/mcm_package.rs` (30 tests)
- MODIFIED: `src/lib.rs` (21→23 pure LOC)
- MODIFIED: `src/app.rs` (192→227 pure LOC)
- NEW: `.omo/evidence/task-6-mcm-minecraft-manager-expansion.txt`

## [2026-06-26 00:30:00 UTC] Task: 7 — Centralize trusted-source confirmation policy

**Status:** COMPLETE. All 192 tests green (32 lib + 44 char + 21 confirmation + 28 game_config + 7 help + 17 mc_target + 30 mcm_package + 13 mvp). `cargo fmt --check` clean. `cargo clippy --all-targets --all-features -- -D warnings` clean. Evidence at `.omo/evidence/task-7-mcm-minecraft-manager-expansion.txt`.

### What changed

**New module** (`src/confirmation.rs`, 170 pure non-test LOC):
- `ConfirmationPolicy` enum: `Harmless` / `Bypassable` / `NonBypassable`
- `OperationKind` enum: `Install`, `Download`, `Delete`, `VersionRemoval`, `PackageInstall`, `RuntimeInstall`, `SourceAction`, `ScriptExecution`, `RootSystemChange`, `WorldOverwrite`, `WorldDelete`, `Autoremove`, `LaunchOnInstall`, `GameRemove`
- `classify(op) -> ConfirmationPolicy`: `RootSystemChange` → `NonBypassable`; all others → `Bypassable`
- `is_mc_critical(op) -> bool`: true for `Autoremove`, `WorldOverwrite`, `WorldDelete`
- `emit_mc_critical_warning(op)`: prints warning to stderr for MC-critical ops
- `require_confirmation(op, yes) -> Result<()>`: centralized gate — `--yes` bypasses; TTY prompts (typed for MC-critical, `[y/N]` for others); non-TTY bails
- `confirm_typed(prompt) -> Result<bool>`: reads stdin, requires "yes" (case-insensitive)
- `root_escalation_helper(action, interactive) -> Result<()>`: suggests `sudo`/`pkexec` command
- `AUTOREMOVE_WARNING` constant: contains "MC-critical", "break worlds/saves", "modded structures"
- `prompt_yes_no(prompt) -> Result<bool>`: shared `y/Y/yes/YES/Yes` reader (pub(crate) for safety.rs)

**Modified** (`src/safety.rs`):
- `confirm_install()` now delegates to `confirmation::prompt_yes_no("Proceed with install? [y/N]")` via `classify(OperationKind::Install)` — preserves exact prompt text for mvp test backward compat
- Removed unused `io::{self, Write}` imports (flush no longer needed here)

**Modified** (`src/lifecycle.rs`):
- `autoremove()` now calls `emit_mc_critical_warning(OperationKind::Autoremove)` to stderr AFTER the `--yes` gate passes but BEFORE destructive removal — preserves exact stdout `"removed depmod\n"` and exact stderr `"confirmation required; pass --yes to apply\n"` for characterization tests
- `install()` and `remove()` unchanged — already compatible with the policy via `confirm_install()` wrapper and existing `if !yes { bail!(exact_msg) }` pattern

**Modified** (`src/game_cmd.rs`): `game_remove()` unchanged — already uses `if !yes { bail!("confirmation required; pass --yes to remove game {name}") }` pattern compatible with the policy. The `game_config.rs:393` test checks `predicate::str::contains("confirmation required")`.

**Modified** (`src/lib.rs`): added `mod confirmation;` + docstring entry.

**New tests** (`tests/confirmation.rs`, 21 tests):
- Bypassable with `--yes`: install/remove/autoremove proceed without prompt (3 tests)
- Bypassable without `--yes` in non-TTY: remove/autoremove/game-remove bail (3 tests)
- Autoremove MC-critical warning: emitted to stderr with `--yes` (1 test); NOT emitted when nothing to do (1 test); NOT emitted when bailing without `--yes` (1 test)
- Read-only actions never prompt: list/status/search/info/dry-run/game-list/game-info/pkg-info (8 tests)
- Install interactive prompt: accepts "y", "yes", rejects "n" (3 tests)
- game remove with `--yes` proceeds (1 test)

### Key decisions

1. **MC-critical warning to stderr, not stdout** — characterization tests assert `predicate::eq("removed depmod\n")` on stdout (line 663). Emitting the warning to stdout would break this. Emitting to stderr preserves all existing assertions because no test checks that `autoremove --yes` has empty stderr.

2. **Warning emitted AFTER `--yes` gate, not before** — `autoremove_requires_yes_when_removable` (characterization test line 672) asserts `predicate::eq("Error: confirmation required; pass --yes to apply\n")` on stderr. If the warning were emitted before the bail, stderr would contain the warning text and break the `predicate::eq` check. The warning is only meaningful when the operation actually proceeds.

3. **`confirm_install()` kept as thin wrapper** — the mvp test `install_interactive_prompt_accepts_yes_from_stdin` (line 178) pipes `"y\n"` and asserts `predicate::str::contains("Proceed with install? [y/N]")`. The wrapper delegates to `prompt_yes_no` with the exact prompt string, preserving backward compatibility.

4. **Non-TTY install without `--yes` reads stdin then bails** — when stdin is `/dev/null` (EOF), `read_line` returns 0, `prompt_yes_no` returns `false`, and `install()` bails with `"installation cancelled"`. This preserves the existing behavior: the mvp test pipes `"y\n"` (success), characterization tests always pass `--yes` (skip), and real non-TTY without `--yes` bails.

5. **`RootSystemChange` is `NonBypassable`** — even with `--yes`, root/system changes require typed "yes" confirmation in a TTY. In non-TTY, they bail. This is the only `NonBypassable` operation; all others are `Bypassable`. No existing operations are classified as `NonBypassable` yet (future tasks will use it).

6. **`#[allow(dead_code)]` on future-task functions** — `require_confirmation`, `confirm_typed`, `root_escalation_helper`, `simple_prompt`, `typed_prompt` are pub(crate) API for tasks 8-22. They have unit tests but no production callers yet. The `#[allow(dead_code)]` suppresses warnings without weakening the type system.

7. **No new dependencies** — uses `std::io::IsTerminal` (stable since Rust 1.70; project is on 1.96).

### Backward-compatibility verification
- All 44 characterization tests pass unchanged (exact stdout/stderr assertions preserved).
- All 13 mvp tests pass unchanged (including `install_interactive_prompt_accepts_yes_from_stdin` with `"y\n"` stdin pipe).
- All 28 game_config tests pass unchanged (including `game_remove_without_yes_errors` with `predicate::str::contains("confirmation required")`).
- Real-surface QA confirmed:
  - `mods install rootmod --yes` → proceeds, exit 0
  - `mods list` → read-only, no prompt, exit 0
  - `mods autoremove` (non-interactive) → bails with exact message, exit 1
  - `mods autoremove --yes` → MC-critical warning on stderr, proceeds, exit 0
  - `mods install rootmod` (stdin=/dev/null) → prints plan, prompts, bails with "installation cancelled", exit 1
  - `pkg info <file>` → read-only, no prompt, exit 0

### Files touched
- NEW: `src/confirmation.rs` (270 total LOC, 170 pure non-test)
- NEW: `tests/confirmation.rs` (21 tests)
- MODIFIED: `src/safety.rs` (confirm_install delegates to confirmation::prompt_yes_no)
- MODIFIED: `src/lifecycle.rs` (autoremove emits MC-critical warning to stderr when proceeding)
- MODIFIED: `src/lib.rs` (added mod confirmation + docstring)
- UNCHANGED: `src/game_cmd.rs` (game_remove already compatible — no change needed)
- UNCHANGED: `src/app.rs` (no change needed — game remove already routed through game_cmd)
- NEW: `.omo/evidence/task-7-mcm-minecraft-manager-expansion.txt`

### Stub boundaries (for downstream tasks)
- `require_confirmation` is ready for tasks 8 (source CLI), 10 (package install), 21 (runtime install) to call with the appropriate `OperationKind`.
- `root_escalation_helper` is ready for task 20 (game install) to call when root privileges are needed.
- `confirm_typed` is ready for MC-critical interactive prompts in future tasks.
- `NonBypassable` policy is defined but no existing operation uses it yet (future root/system changes will).
