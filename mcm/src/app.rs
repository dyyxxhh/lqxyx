use std::env;
use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use directories::ProjectDirs;

use crate::cli::{Cli, Command, ProviderChoice};
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
            return Ok(Config {
                active_profile: None,
                profiles: std::collections::BTreeMap::new(),
            });
        }
        let text = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        toml::from_str(&text).with_context(|| format!("parse {}", path.display()))
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
        Some(Command::Profile { command }) => app.profile(command),
        Some(Command::Search { query }) => app.search(&query),
        Some(Command::Install {
            query,
            file,
            dry_run,
            yes,
        }) => app.install(query, file, dry_run, yes),
        Some(Command::Remove { logical_id, yes })
        | Some(Command::Uninstall { logical_id, yes }) => app.remove(&logical_id, yes),
        Some(Command::Info { query }) => app.info(&query),
        Some(Command::Autoremove { yes }) => app.autoremove(yes),
        Some(Command::List) => app.list(),
        Some(Command::Status) => app.status(),
        None => Ok(()),
    }
}
