use std::env;
use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use directories::ProjectDirs;

use crate::cli::{Cli, Command, ModsCommand, ProviderChoice};
use crate::config::Config;
use crate::lock::LockState;
use crate::provider::{
    CompositeProvider, CurseForgeProvider, MockProvider, ModrinthProvider, Provider,
};

pub(crate) struct App {
    pub(crate) config_dir: PathBuf,
    pub(crate) state_dir: PathBuf,
    pub(crate) provider_choice: ProviderChoice,
}

impl App {
    pub(crate) fn new(cli: &Cli) -> Result<Self> {
        let project_dirs =
            ProjectDirs::from("dev", "lucky", "mcm").context("could not resolve project dirs")?;
        let config_dir = cli
            .config_dir
            .clone()
            .or_else(|| env::var_os("MCM_CONFIG_DIR").map(PathBuf::from))
            .unwrap_or_else(|| project_dirs.config_dir().to_path_buf());
        let state_dir = cli
            .state_dir
            .clone()
            .or_else(|| env::var_os("MCM_STATE_DIR").map(PathBuf::from))
            .unwrap_or_else(|| project_dirs.data_dir().to_path_buf());
        Ok(Self {
            config_dir,
            state_dir,
            provider_choice: cli.provider,
        })
    }

    pub(crate) fn config_path(&self) -> PathBuf {
        self.config_dir.join("config.toml")
    }

    pub(crate) fn lock_path(&self, profile: &str) -> PathBuf {
        self.state_dir.join(format!("{profile}.lock.json"))
    }

    pub(crate) fn load_config(&self) -> Result<Config> {
        let path = self.config_path();
        if !path.exists() {
            return Ok(Config::default());
        }
        let text = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        let mut config: Config =
            toml::from_str(&text).with_context(|| format!("parse {}", path.display()))?;
        // One-way in-memory migration: if old profile data exists and no games
        // have been recorded yet, derive game records from profiles so `game`
        // commands see them. Old profile data is preserved on disk; the
        // migrated games are not persisted (that would race with `mods add`
        // which still operates on the legacy profile model).
        crate::game_model::migrate_profiles_to_games(&mut config);
        Ok(config)
    }

    pub(crate) fn save_config(&self, config: &Config) -> Result<()> {
        fs::create_dir_all(&self.config_dir)?;
        crate::util::atomic_write(
            &self.config_path(),
            toml::to_string_pretty(config)?.as_bytes(),
        )
    }

    pub(crate) fn active_profile(&self) -> Result<crate::config::Profile> {
        let config = self.load_config()?;
        let name = config
            .active_profile
            .as_deref()
            .context("no active profile; run profile add or profile use")?;
        config
            .profiles
            .get(name)
            .cloned()
            .with_context(|| format!("active profile {name} is missing"))
    }

    pub(crate) fn load_lock(&self, profile: &crate::config::Profile) -> Result<LockState> {
        let path = self.lock_path(&profile.name);
        if !path.exists() {
            return Ok(LockState::default());
        }
        let text = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        serde_json::from_str(&text).with_context(|| format!("parse {}", path.display()))
    }

    pub(crate) fn save_lock(
        &self,
        profile: &crate::config::Profile,
        lock: &LockState,
    ) -> Result<()> {
        fs::create_dir_all(&self.state_dir)?;
        crate::util::atomic_write(
            &self.lock_path(&profile.name),
            serde_json::to_string_pretty(lock)?.as_bytes(),
        )
    }

    pub(crate) fn provider(&self) -> Result<Box<dyn Provider>> {
        match self.provider_choice {
            ProviderChoice::All => Ok(Box::new(CompositeProvider::default()?)),
            ProviderChoice::Mock => Ok(Box::new(MockProvider::new())),
            ProviderChoice::Modrinth => Ok(Box::new(ModrinthProvider::new())),
            ProviderChoice::Curseforge => Ok(Box::new(CurseForgeProvider::new()?)),
        }
    }
}

pub(crate) fn run(cli: Cli) -> Result<()> {
    let app = App::new(&cli)?;
    match cli.command {
        // Low-power `.mcm` installer (stub: downstream task 10 fills behavior).
        Some(Command::Install { target, yes }) => app.top_install(target, yes),

        // New command families — stubbed with "not implemented yet".
        Some(Command::Upgrade) => Err(anyhow!("upgrade is not implemented yet")),
        Some(Command::FullUpgrade { yes: _ }) => {
            Err(anyhow!("full-upgrade is not implemented yet"))
        }
        Some(Command::Source { command }) => app.source(command),
        Some(Command::Pkg { command }) => app.pkg(command),
        Some(Command::Game { command }) => app.game(command),
        Some(Command::Do { file, yes }) => app.do_file(file, yes),
        Some(Command::Run { dry_run: _ }) => Err(anyhow!("run is not implemented yet")),
        Some(Command::Config) => Err(anyhow!("config is not implemented yet")),

        // Mod-manager group (`mods` / `mod` alias).
        Some(Command::Mods { command }) => app.mods_command(command),

        None => Ok(()),
    }
}

impl App {
    pub(crate) fn not_implemented(name: &str) -> Result<()> {
        Err(anyhow!("{name} is not implemented yet"))
    }

    /// Top-level `install [target] [-y]`: low-power `.mcm` installer.
    /// Validates the target is a `.mcm` path/URL; rejects raw mod names and
    /// `mc...` smart targets. Actual install behavior is filled by task 10.
    fn top_install(&self, target: Option<String>, _yes: bool) -> Result<()> {
        if let Some(target) = target {
            if target.starts_with("mc") && crate::mc_target::parse_mc_target(&target).is_ok() {
                return Err(anyhow!(
                    "top-level install does not accept Minecraft smart targets; \
                     use `game install` instead"
                ));
            }
            if !target.ends_with(".mcm") && !target.starts_with("http") {
                return Err(anyhow!(
                    "top-level install accepts only a `.mcm` file path or URL; \
                     raw mod names are not supported (use `mods install`)"
                ));
            }
            Self::not_implemented("install <.mcm>")
        } else {
            Self::not_implemented("install (auto-select .mcm)")
        }
    }

    fn source(&self, command: crate::cli::SourceCommand) -> Result<()> {
        match command {
            crate::cli::SourceCommand::Add { .. } => Self::not_implemented("source add"),
            crate::cli::SourceCommand::Remove { .. } => Self::not_implemented("source remove"),
            crate::cli::SourceCommand::Info { .. } => Self::not_implemented("source info"),
            crate::cli::SourceCommand::List => Self::not_implemented("source list"),
        }
    }

    fn pkg(&self, command: crate::cli::PkgCommand) -> Result<()> {
        match command {
            crate::cli::PkgCommand::Info { .. } => Self::not_implemented("pkg info"),
            crate::cli::PkgCommand::Install { .. } => Self::not_implemented("pkg install"),
            crate::cli::PkgCommand::Download { .. } | crate::cli::PkgCommand::Dl { .. } => {
                Self::not_implemented("pkg download")
            }
            crate::cli::PkgCommand::Make { .. } => Self::not_implemented("pkg make"),
            crate::cli::PkgCommand::Share { .. } => Self::not_implemented("pkg share"),
            crate::cli::PkgCommand::List => Self::not_implemented("pkg list"),
        }
    }

    fn do_file(&self, _file: Option<PathBuf>, _yes: bool) -> Result<()> {
        Self::not_implemented("do")
    }

    /// Dispatch the mod-manager command group (`mods` / `mod`).
    fn mods_command(&self, command: ModsCommand) -> Result<()> {
        match command {
            ModsCommand::Add {
                name,
                mods_dir,
                mc_version,
                loader,
                side,
            } => self.profile_add(name, mods_dir, mc_version, loader, side),
            ModsCommand::Use { name } => self.profile_use(&name),
            ModsCommand::ProfileList => self.profile_list(),
            ModsCommand::Show { name } => self.profile_show(name),
            ModsCommand::Search { query } => self.search(&query),
            ModsCommand::Info { query } => self.info(&query),
            ModsCommand::Install {
                query,
                file,
                dry_run,
                yes,
            } => self.install(query, file, dry_run, yes),
            ModsCommand::List => self.list(),
            ModsCommand::Status => self.status(),
            ModsCommand::Remove { logical_id, yes }
            | ModsCommand::Uninstall { logical_id, yes } => self.remove(&logical_id, yes),
            ModsCommand::Autoremove { yes } => self.autoremove(yes),
        }
    }
}
