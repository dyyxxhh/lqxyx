use std::path::PathBuf;

use clap::{Parser, Subcommand, ValueEnum};

use crate::config::Side;

#[derive(Debug, Parser)]
#[command(
    name = "mcm",
    about = "Like a Linux package manager for Minecraft mods and game instances"
)]
pub struct Cli {
    #[arg(long, global = true, value_name = "DIR", env = "MCM_CONFIG_DIR")]
    pub config_dir: Option<PathBuf>,

    #[arg(long, global = true, value_name = "DIR", env = "MCM_STATE_DIR")]
    pub state_dir: Option<PathBuf>,

    #[arg(
        long,
        global = true,
        default_value = "all",
        value_enum,
        env = "MCM_PROVIDER"
    )]
    pub provider: ProviderChoice,

    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum ProviderChoice {
    All,
    Mock,
    Modrinth,
    Curseforge,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Low-power package installer: install a `.mcm` file path or URL.
    Install {
        /// Optional `.mcm` file path or URL. If omitted, selects the
        /// lexicographically smallest `*.mcm` in the current directory.
        target: Option<String>,

        #[arg(short, long)]
        yes: bool,
    },

    /// Upgrade the current/default game only.
    Upgrade,

    /// Upgrade all configured games.
    FullUpgrade {
        #[arg(short, long)]
        yes: bool,
    },

    /// Manually manage imported sources.
    Source {
        #[command(subcommand)]
        command: SourceCommand,
    },

    /// Package download/share/install/make/info flows.
    Pkg {
        #[command(subcommand)]
        command: PkgCommand,
    },

    /// Game/version/instance management.
    Game {
        #[command(subcommand)]
        command: GameCommand,
    },

    /// Execute an `.mcm` file (higher-power executor).
    Do {
        /// Optional `.mcm` file path. Without argument, uses the single
        /// `*.mcm` in the current directory (errors if zero or multiple).
        file: Option<PathBuf>,

        #[arg(short, long)]
        yes: bool,
    },

    /// Launch the default game.
    Run {
        #[arg(long)]
        dry_run: bool,
    },

    /// Interactive global config editor (non-interactive subcommands may be
    /// added later).
    Config,

    /// Mod-manager command group (alias: `mods`).
    #[command(alias = "mod")]
    Mods {
        #[command(subcommand)]
        command: ModsCommand,
    },
}

#[derive(Debug, Subcommand)]
pub enum SourceCommand {
    /// Add a manually imported source (trusted after import).
    Add {
        url: String,
        #[arg(short, long)]
        yes: bool,
    },
    /// Remove an imported source.
    Remove { url: String },
    /// Show info about an imported source.
    Info { url: String },
    /// List all imported sources.
    List,
}

#[derive(Debug, Subcommand)]
pub enum PkgCommand {
    /// Show package info from a `.mcm` file.
    Info { path: PathBuf },
    /// Install a package from a `.mcm` file or share URL.
    Install {
        target: String,
        #[arg(short, long)]
        yes: bool,
    },
    /// Download a package without installing.
    Download {
        target: String,
        #[arg(short, long)]
        yes: bool,
    },
    /// Alias for `download`.
    Dl {
        target: String,
        #[arg(short, long)]
        yes: bool,
    },
    /// Create a `.mcm` package from the current game state.
    Make {
        #[arg(short, long)]
        yes: bool,
    },
    /// Publish/share a package via OIDC-authenticated flow.
    Share {
        target: String,
        #[arg(short, long)]
        yes: bool,
    },
    /// List known packages.
    List,
}

#[derive(Debug, Subcommand)]
pub enum GameCommand {
    /// Show or set the default game.
    Default { name: Option<String> },
    /// Install a Minecraft game version, optionally with a loader.
    /// Smart targets: `mc`, `mc1.21.1`, `mc-neoforge`, `mc1.21.1-neoforge`,
    /// `mc1.21.1-neoforge-21.1.172` (same grammar for fabric/forge/quilt).
    Install {
        /// Game name to create.
        name: String,
        /// Smart install target (e.g. `mc1.21.1-neoforge-21.1.172`).
        target: String,
        #[arg(long)]
        dry_run: bool,
        #[arg(short, long)]
        yes: bool,
    },
    /// Remove a game version/instance.
    Remove {
        name: String,
        #[arg(short, long)]
        yes: bool,
    },
    /// Show info about a game.
    Info { name: String },
    /// Rename a game.
    Rename { old: String, new: String },
    /// Show or set version-scoped config for a game.
    Config { name: String },
    /// List all games.
    List,
}

#[derive(Debug, Subcommand)]
pub enum ModsCommand {
    /// Add a profile (legacy profile-add semantics).
    Add {
        name: String,
        #[arg(long)]
        mods_dir: PathBuf,
        #[arg(long)]
        mc_version: String,
        #[arg(long)]
        loader: String,
        #[arg(long, default_value = "both", value_enum)]
        side: Side,
    },
    /// Set the active profile.
    Use { name: String },
    /// Search for mods.
    Search { query: String },
    /// Show mod info (cloud or local jar).
    Info { query: String },
    /// Install a mod by logical ID or search query.
    Install {
        query: Option<String>,
        #[arg(
            short,
            long,
            value_name = "PATH",
            help = "Install mods from a mod list file"
        )]
        file: Option<PathBuf>,
        #[arg(long)]
        dry_run: bool,
        #[arg(short, long)]
        yes: bool,
    },
    /// List installed mods.
    List,
    /// Show status of installed mods.
    Status,
    /// Remove an installed mod (alias: `uninstall`).
    Remove {
        logical_id: String,
        #[arg(short, long)]
        yes: bool,
    },
    /// Alias for `remove`.
    Uninstall {
        logical_id: String,
        #[arg(short, long)]
        yes: bool,
    },
    /// Remove auto-installed mods no longer required by any manual root.
    Autoremove {
        #[arg(short, long)]
        yes: bool,
    },
    /// Show the active or named profile.
    Show { name: Option<String> },
    /// List profiles.
    ProfileList,
}
