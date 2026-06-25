//! mcm — apt-like Minecraft mod manager and game instance CLI.
//!
//! Module map:
//! - `cli` — Clap derive structs (`Cli`, `Command`, `ModsCommand`, `ProviderChoice`, ...)
//! - `config` — `Side`, `Config`, `Profile`, `ProfileSnapshot` (TOML persistence types)
//! - `game_model` — `GameRecord`, `GameConfig`, `GlobalConfig`, profile→game migration
//! - `lock` — `LockState`, `InstalledMod`, `InstallReason` + reachability/removal helpers
//! - `provider` — `Provider` trait, shared types (`Project`/`Artifact`/...), `CompositeProvider`
//!   + submodules: `mock`, `modrinth`, `curseforge`, `curseforge_dto`
//! - `safety` — filename sanitization, download-URL allowlist, install confirmation
//! - `confirmation` — centralized trusted-source confirmation policy (Harmless/Bypassable/NonBypassable)
//! - `jar_info` — local jar metadata reader (fabric.mod.json / mods.toml / mcmod.info)
//! - `install` — install planning (`build_plan`, `select_artifact`, `read_mod_list`)
//! - `mc_target` — `game install` smart target parser (`mc`, `mc1.21.1-neoforge-21.1.172`, ...)
//! - `mcm_package` — schema-versioned `.mcm` package types + boundary parser
//! - `source_index` — schema-versioned custom source index types + boundary parser
//! - `app` — `App` struct, config/lock IO, provider dispatch, `run()` entry point
//! - `profile_cmd` — `mods add`/`use`/`show`/`profile-list` implementations on `App`
//! - `game_cmd` — `game default/list/info/rename/config/remove` implementations on `App`
//! - `source_cmd` — `source add/remove/info/list` implementations on `App`
//! - `pkg_cmd` — `pkg install/download/make/share/list` + top-level `install` / `do` on `App`
//! - `pkg_install` — package apply logic (mod jars + assets + script execution)
//! - `queries` — `search`/`info`/`list`/`status` command implementations on `App`
//! - `lifecycle` — `install`/`remove`/`autoremove` command implementations on `App`
//! - `util` — `atomic_write`, `sha256_hex`

mod app;
mod cli;
mod config;
mod confirmation;
mod game_cmd;
mod game_model;
mod install;
mod jar_info;
mod lifecycle;
mod lock;
mod mc_target;
mod mcm_package;
mod pkg_cmd;
mod pkg_install;
mod profile_cmd;
mod provider;
mod queries;
mod safety;
mod source_cmd;
mod source_index;
mod util;

pub use cli::{Cli, Command, GameCommand, ModsCommand, PkgCommand, ProviderChoice, SourceCommand};
pub use config::Side;
pub use mc_target::{parse_mc_target, Loader, McTarget};
pub use mcm_package::{parse_mcm_package, McmPackage};
pub use source_index::{parse_source_index, SourceIndex};

pub fn run(cli: Cli) -> anyhow::Result<()> {
    app::run(cli)
}
