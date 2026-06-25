use std::path::PathBuf;

use clap::{Parser, Subcommand, ValueEnum};

use crate::config::Side;

#[derive(Debug, Parser)]
#[command(
    name = "mcm",
    about = "Like a Linux package manager for Minecraft mods"
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
    Profile {
        #[command(subcommand)]
        command: ProfileCommand,
    },
    Search {
        query: String,
    },
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
    Remove {
        logical_id: String,
        #[arg(short, long)]
        yes: bool,
    },
    Uninstall {
        logical_id: String,
        #[arg(short, long)]
        yes: bool,
    },
    Info {
        query: String,
    },
    Autoremove {
        #[arg(short, long)]
        yes: bool,
    },
    List,
    Status,
}

#[derive(Debug, Subcommand)]
pub enum ProfileCommand {
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
    Use {
        name: String,
    },
    List,
    Show {
        name: Option<String>,
    },
}
