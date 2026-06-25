//! mcm — apt-like Minecraft mod manager CLI.
//!
//! Module map:
//! - `cli` — Clap derive structs (`Cli`, `Command`, `ProfileCommand`, `ProviderChoice`)
//! - `config` — `Side`, `Config`, `Profile`, `ProfileSnapshot` (TOML persistence types)
//! - `lock` — `LockState`, `InstalledMod`, `InstallReason` + reachability/removal helpers
//! - `provider` — `Provider` trait, shared types (`Project`/`Artifact`/...), `CompositeProvider`
//!   + submodules: `mock`, `modrinth`, `curseforge`, `curseforge_dto`
//! - `safety` — filename sanitization, download-URL allowlist, install confirmation
//! - `jar_info` — local jar metadata reader (fabric.mod.json / mods.toml / mcmod.info)
//! - `install` — install planning (`build_plan`, `select_artifact`, `read_mod_list`)
//! - `app` — `App` struct, config/lock IO, provider dispatch, `run()` entry point
//! - `profile_cmd` — `profile` command implementation on `App`
//! - `queries` — `search`/`info`/`list`/`status` command implementations on `App`
//! - `lifecycle` — `install`/`remove`/`autoremove` command implementations on `App`
//! - `util` — `atomic_write`, `sha256_hex`

mod app;
mod cli;
mod config;
mod install;
mod jar_info;
mod lifecycle;
mod lock;
mod profile_cmd;
mod provider;
mod queries;
mod safety;
mod util;

pub use cli::{Cli, Command, ProfileCommand, ProviderChoice};
pub use config::Side;

pub fn run(cli: Cli) -> anyhow::Result<()> {
    app::run(cli)
}
