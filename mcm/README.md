# mcm

`mcm` is an apt-like Minecraft manager CLI. It started as a mod manager and is growing into a full Minecraft manager: game versions, loaders, Java runtimes, modpacks, custom sources, a sharing service, and one-command install routes.

The project is AGPLv3 licensed (see `LICENSE`). Source availability is required for hosted services under AGPLv3 section 13.

## Overview

MCM manages Minecraft the way `apt` manages a Linux system:

- **Game instances** live under `~/mcm` by default, with configurable paths.
- **Mods** are resolved against providers (Modrinth, CurseForge, mock) and custom sources.
- **Packages** (`.mcm` files) bundle mods, shaders, resource packs, configs, and optional scripts.
- **Sources** are manually imported indexes you trust after import.
- **Sharing** happens through a Rust HTTP service with `share`, `source`, and `both` modes.
- **Install routes** at `https://mc.dyyapp.com/install` bootstrap MCM itself, and `https://mc.dyyapp.com/install/pkg/<name>` installs a named package.

Old mod-manager commands (`profile`, `search`, `install <modid>`, `list`, `status`, `remove`, `autoremove`) have moved under the `mods` (alias `mod`) command group. Old top-level spelling is not preserved.

## CLI grammar

Global flags (accepted before the subcommand):

- `--config-dir <DIR>` or `MCM_CONFIG_DIR`: override config directory.
- `--state-dir <DIR>` or `MCM_STATE_DIR`: override lock state directory.
- `--provider <all|mock|modrinth|curseforge>` or `MCM_PROVIDER` (default `all`): mod provider for search, info, and install.

Top-level commands:

```bash
mcm install [target] [-y]           # low-power .mcm installer (path or URL)
mcm upgrade                         # upgrade current/default game only
mcm full-upgrade [-y]               # upgrade all configured games
mcm source <subcommand>             # manage manually imported sources
mcm pkg <subcommand>                # package download/share/install/make/info
mcm game <subcommand>               # game/version/instance management
mcm do [file] [-y]                  # execute an .mcm file (higher-power)
mcm run [--dry-run]                 # launch the default game
mcm config                          # interactive global config editor
mcm mods <subcommand>               # mod-manager group (alias: mod)
```

### `install [target] [-y]`

Low-power package installer. Accepts a local `.mcm` path or URL plus optional `-y`/`--yes`. Does not accept raw mod names or `mc...` smart targets. Without a target, selects the lexicographically smallest `*.mcm` file in the current directory.

```bash
mcm install ./sample.mcm --yes
mcm install https://example.test/sample.mcm --yes
mcm install                          # auto-selects the only .mcm in cwd
```

### `upgrade` and `full-upgrade [-y]`

`upgrade` upgrades the current or default game. `full-upgrade` upgrades all configured games. Both require confirmation unless `--yes` is supplied. (Implementation in progress.)

### `source` subcommands

Manually manage imported sources. A fresh install has zero sources.

```bash
mcm source add https://example.test/index.json --yes
mcm source list
mcm source info https://example.test/index.json
mcm source remove https://example.test/index.json
```

`source add` requires confirmation unless `--yes` is supplied. Adding the same source twice returns a conflict message.

### `pkg` subcommands

Package flows around `.mcm` files and share URLs. `dl` is an alias for `download`.

```bash
mcm pkg info ./sample.mcm
mcm pkg install ./sample.mcm --yes
mcm pkg download ./sample.mcm --yes     # or: mcm pkg dl ./sample.mcm --yes
mcm pkg make --yes                      # create a .mcm from current game state
mcm pkg share ./sample.mcm --yes        # publish via OIDC flow
mcm pkg list
```

**Publish login flow** (via `pkg share`):

```bash
# 1. Start the publish flow. The CLI prints an OIDC auth URL.
mcm pkg share ./my-pack.mcm

# 2. Open the URL in a browser, log in. The service redirects to
#    https://mc.dyyapp.com/api/auth/oidc/callback and the CLI polls for
#    a short session result.

# 3. Once authenticated, the package is published. The CLI prints a
#    copyable one-command install snippet:
#    curl -fsSL https://mc.dyyapp.com/install/pkg/my-pack | bash
```

`pkg info` is read-only and never prompts. `pkg install`, `download`, and `share` require confirmation unless `--yes` is supplied. `pkg make` defaults to excluding secrets and personal settings or history. Explicit flags are required to export local or private data.

### `game` subcommands

Game, version, and instance management.

```bash
mcm game default                        # show default game
mcm game default dev                    # set default game
mcm game list                           # list all games, mark default with *
mcm game info dev                       # show game details
mcm game rename old-name new-name       # rename a game
mcm game config dev                     # show version-scoped config
mcm game remove dev --yes               # remove game record
mcm game install dev mc1.21.1-neoforge-21.1.172 --yes
mcm game install dev mc --dry-run       # dry-run latest vanilla MC
```

Smart targets for `game install`:

- `mc`: latest vanilla Minecraft.
- `mc1.21.1`: vanilla Minecraft 1.21.1.
- `mc-neoforge`: latest MC supporting latest compatible NeoForge.
- `mc1.21.1-neoforge`: MC 1.21.1 with latest compatible NeoForge.
- `mc1.21.1-neoforge-21.1.172`: MC 1.21.1 with NeoForge 21.1.172.
- Same grammar for `fabric`, `forge`, `quilt`. No `@latest` suffix (omission already means latest).

Top-level `mcm install mc-neoforge` is rejected. Minecraft smart targets belong only under `game install` or package contents.

### `do [file] [-y]`

Higher-power executor for `.mcm` files. Without an argument, uses the single `*.mcm` in the current directory (errors if zero or multiple). (Implementation in progress.)

### `run [--dry-run]`

Launch the default game. `--dry-run` prints the launch command without executing. Microsoft and Mojang auth is supported with mockable provider and session tests. (Implementation in progress.)

### `config`

Interactive global config editor. Non-interactive subcommands may be added later.

### `mods` (alias: `mod`) subcommands

The mod-manager command group. Old top-level mod commands live here.

```bash
mcm mods add dev --mods-dir ./minecraft/mods --mc-version 1.20.1 --loader fabric --side client
mcm mods use dev
mcm mods profile-list
mcm mods show                          # show active profile
mcm mods show dev                      # show named profile

mcm --provider mock mods search root
mcm --provider mock mods info rootmod
mcm mods info ./some-local.jar

mcm --provider mock mods install rootmod --dry-run
mcm --provider mock mods install rootmod --yes
mcm --provider mock mods install --file mods.txt --yes

mcm mods list
mcm mods status
mcm mods remove rootmod --yes
mcm mods uninstall rootmod --yes       # alias for remove
mcm mods autoremove --yes
```

A mod list file contains one mod ID or query per non-empty line. `#` starts a comment.

```text
# mods.txt
rootmod
standalone
```

The resolver selects the latest stable compatible artifact by default. Required dependencies are installed automatically. Optional, incompatible, embedded, and unknown dependencies are surfaced as warnings and are not installed by default.

`list` prints installed logical mods and exact artifact identities. `status` reports owned jars that are missing or changed and shows untracked jars, but it never claims or deletes untracked jars.

`remove` and `uninstall` remove manual roots and their owned jar only. Auto-installed dependencies remain until `autoremove`, which removes auto packages that are no longer reachable through required dependency edges from any remaining manual root.

Use `--config-dir` / `MCM_CONFIG_DIR` and `--state-dir` / `MCM_STATE_DIR` to isolate configuration and lock state, which is useful for tests and disposable profiles.

The mock provider includes deterministic data for a root mod, a required dependency, optional, incompatible, embedded, and unknown dependency warnings, duplicate source candidates for the same logical mod ID, beta and alpha artifacts excluded by default, and a missing-download error case.

## `.mcm` package schema

A `.mcm` file is JSON, schema-versioned (currently version 1), size-limited (10 MB), and depth-limited (64). It can contain:

- Identity: package name (normalized to `[a-z0-9-]`, 1 to 64 chars, alphanumeric start and end, no consecutive hyphens, no reserved names), version, description.
- Game version and loader.
- Dependencies: required, optional, incompatible, embedded, unknown.
- Mods, shaderpacks, resourcepacks, datapacks.
- Saves, NBT, and structure files.
- Configs and version-scoped configs.
- Optional actions (Linux shell scripts only in the first implementation).
- Optional launch request.
- Explicit local or private settings and history (excluded from public sharing by default).

**Secret-field rejection:** the parser recursively scans all JSON keys (case-insensitive) and rejects fields named `token`, `secret`, `password`, `credential`, or `api_key`. This runs before typed parsing, so secrets hidden inside opaque containers are caught.

**Path traversal protection:** asset paths are validated to reject empty, null, `..`, absolute paths, backslashes, and Windows-reserved name components.

**Package import and export** supports the native `.mcm` format plus import from Modrinth `.mrpack` and CurseForge manifests.

## Custom sources

Sources are manually imported indexes. A fresh install has zero custom sources. No source, including the author source, is preloaded by default.

```bash
mcm source add https://example.test/index.json --yes
mcm source list
mcm source info https://example.test/index.json
mcm source remove https://example.test/index.json
```

**Trust model:** a source is trusted once you manually import it. Schema and hash validation still run to catch corruption or bugs. A source can declare capabilities such as `mods`, `packages`, `games`, `loaders`, and `java`. The client uses a source only according to its declared capabilities.

Install, download, delete, and other state-changing actions from a source still require confirmation, even though the source itself is trusted.

## Confirmation policy

MCM centralizes confirmation through a single policy:

- **Read-only actions never prompt.** This includes `list`, `info`, `status`, `search`, `--dry-run`, and `help`.
- **Bypassable actions** (install, download, delete, package install, runtime install, source actions, script execution, launch-on-install, game remove, `autoremove`) require a second confirmation by default. Pass `-y`/`--yes` to bypass these in non-interactive use.
- **Non-bypassable actions** (`RootSystemChange`) always require typed "yes" confirmation, even with `--yes`. In non-TTY mode, they print the exact `sudo`/`pkexec` command instead of failing generically.

**`autoremove` is MC-critical.** It prints a strong warning that removing apparently unused mods or resources may break worlds, saves, or modded structures, then requires second confirmation. With `--yes`, the warning is emitted to stderr and the operation proceeds.

**Package scripts:** if a `.mcm` package declares shell scripts or actions, MCM shows a strong warning unless `--yes` is supplied. Scripts run with the working directory set to the game version or instance root, not the user's current shell directory. If a script needs root, the script itself may invoke `sudo`. MCM does not wrap script execution in automatic sudo.

**Web install exception:** the `curl | bash` package install route at `https://mc.dyyapp.com/install/pkg/<name>` intentionally runs with `--yes` or non-interactive semantics, so package install and declared launch can proceed without prompts.

## Server modes

MCM includes a Rust HTTP service that can run in three modes (implementation in progress):

- **`share` mode:** public download of `.mcm` packages plus authenticated publish, update, and delete. Download is public. Upload requires OIDC login.
- **`source` mode:** serve a manually imported source index and metadata or artifact blobs. Any computer can run it.
- **`both` mode:** enable share and source routes in one process.

The default bind address is `127.0.0.1:8950`. The service does not bind `0.0.0.0` by default.

### PM2 deployment

Run the service behind PM2. Example ecosystem config:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "mcm-share",
      script: "mcm",
      args: "serve --mode both --bind 127.0.0.1:8950",
      env: {
        MCM_SHARE_DATA_DIR: "/var/lib/mcm-share",
        MCM_OIDC_ISSUER: "https://auth.dyyapp.com",
        MCM_OIDC_CLIENT_ID: "<your-client-id>",
        // MCM_OIDC_CLIENT_SECRET: provide via env or secret file, never commit.
      },
      max_restarts: 10,
      autorestart: true,
    },
  ],
};
```

Start with `pm2 start ecosystem.config.js`. Put the service behind a reverse proxy (nginx, Caddy) for TLS.

## OIDC authentication

Package publish, update, and delete use OIDC login. The CLI prints an auth URL, the user logs in through a browser, the service redirects to `https://mc.dyyapp.com/api/auth/oidc/callback`, and the CLI receives a short session to perform publish, update, or delete.

OIDC configuration uses environment variable names only. No secret values are committed to the repository or documented here:

- `MCM_OIDC_ISSUER`: OIDC provider base URL (for example `https://auth.dyyapp.com`).
- `MCM_OIDC_CLIENT_ID`: OIDC client ID.
- `MCM_OIDC_CLIENT_SECRET`: OIDC client secret. Provide through environment or a secret file. Never commit this value.

**No admin token or Turnstile is required for publish/update/delete.** Authentication is OIDC only.

## Data directory

Server package and blob storage defaults outside `/x`. The default data directory is `/var/lib/mcm-share` or a user-specified path via `MCM_SHARE_DATA_DIR`. The service refuses to start if the default data directory is under `/x`.

Local client storage uses the normal MCM user data paths under `~/mcm`.

## One-command install routes

Two `curl | bash` routes are available:

**Bootstrap MCM itself:**

```bash
curl -fsSL https://mc.dyyapp.com/install | bash
```

This downloads and installs the MCM binary for Linux x86_64, verifying checksums or pinned hashes before installing. Other OS or arch combinations are detected and exit with an explicit unsupported-platform message in the first implementation.

**Install a named package permanently:**

```bash
curl -fsSL https://mc.dyyapp.com/install/pkg/<package-name> | bash
```

This ensures MCM is installed, then delegates to the low-power `mcm install <downloaded-or-url .mcm> --yes` flow. Package names are validated and safely quoted. Missing packages return 404. The web install script intentionally runs in yes or non-interactive mode so package install and declared launch can proceed without prompts.

## Publish policy

Authenticated users can publish, update, and delete packages through the CLI. The policy is:

- **One publish or update push per day per user.** Both new publish and update count as the daily push.
- **Max 5 existing packages per user** at the same time.
- **Delete does not count as a push** but also does not reset the daily push limit.
- **2-day slug reservation:** after delete, the slug is reserved for the deleting owner for 2 days, then released. Another user cannot claim it during reservation.
- **Overwrite on update:** updates overwrite the current package. Old package backups are not retained on the server.
- **Owner check on upgrade:** local installs record the package author's user ID. Upgrade refuses and warns if the remote package slug now belongs to a different user ID.
- **Globally unique, case-insensitive slugs.** A duplicate slug returns 409.

## License

MCM is licensed under the GNU Affero General Public License v3 or later (see `LICENSE`). Under AGPLv3 section 13, anyone running a modified version as a network service must offer users the Corresponding Source through a standard means at no charge.

Dependency licenses are audited through `cargo deny check licenses` (see `deny.toml`). Only permissive OSI-approved licenses are allowed for dependencies, avoiding copyleft compatibility questions.

**HMCL and PCL are conceptual UX and product references only.** No HMCL or PCL code, UI text, assets, icons, strings, or implementation structure is copied. Direct HMCL code reuse is forbidden unless a separate explicit license review accepts GPLv3 plus extra-term obligations. PCL and PCL2 code and assets are no-copy due to their custom restricted license.

## Providers

`--provider all` is the default and queries Modrinth plus CurseForge together, merging candidates by logical mod ID. If `CURSEFORGE_API_KEY` is not set, CurseForge is skipped with a warning while Modrinth remains usable. `--provider mock` is deterministic and requires no network. `--provider modrinth` uses the public Modrinth v2 API and works without credentials. `--provider curseforge` uses the CurseForge v1 API and requires `CURSEFORGE_API_KEY` in the environment.

Search and cloud info use the active profile's Minecraft version, loader, and side. Results are grouped by logical mod ID, so the same mod ID from Modrinth, CurseForge, or another source is shown as provider or source candidates rather than distinct packages.

Local jar info reads `fabric.mod.json`, `META-INF/mods.toml`, and legacy `mcmod.info` when present. If metadata is unavailable, it prints basic file information and a SHA-256 hash without inventing provider identity.
