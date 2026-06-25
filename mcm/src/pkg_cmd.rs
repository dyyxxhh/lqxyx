//! `pkg` command group dispatch + top-level `install` / `do` on [`App`].
//!
//! Install/download apply logic lives in `pkg_install.rs`; this module owns
//! the dispatch surface, the low-power `.mcm` installer (`install`), the
//! higher-power executor (`do`), and the read-only / stub subcommands
//! (`info`, `make`, `share`, `list`).

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};

use crate::app::App;
use crate::cli::PkgCommand;
use crate::confirmation::{require_confirmation, OperationKind};
use crate::mcm_package::{parse_mcm_package, McmPackage, ModEntry};

impl App {
    pub(crate) fn pkg(&self, command: PkgCommand) -> Result<()> {
        match command {
            PkgCommand::Info { path } => self.pkg_info(&path),
            PkgCommand::Install { target, yes } => self.pkg_install(&target, yes),
            PkgCommand::Download { target, yes } | PkgCommand::Dl { target, yes } => {
                self.pkg_download(&target, yes)
            }
            PkgCommand::Make { yes: _ } => self.pkg_make(),
            PkgCommand::Share { target, yes } => self.pkg_share(&target, yes),
            PkgCommand::List => self.pkg_list(),
        }
    }

    pub(crate) fn top_install(&self, target: Option<String>, yes: bool) -> Result<()> {
        let resolved = match target {
            Some(target) => {
                if target.starts_with("mc") && crate::mc_target::parse_mc_target(&target).is_ok() {
                    bail!(
                        "top-level install does not accept Minecraft smart targets; \
                         use `game install` instead"
                    );
                }
                if !target.ends_with(".mcm") && !target.starts_with("http") {
                    bail!(
                        "top-level install accepts only a `.mcm` file path or URL; \
                         raw mod names are not supported (use `mods install`)"
                    );
                }
                target
            }
            None => {
                let auto = find_single_mcm(Path::new("."))?;
                auto.to_string_lossy().into_owned()
            }
        };
        self.pkg_install(&resolved, yes)
    }

    pub(crate) fn do_file(&self, file: Option<PathBuf>, yes: bool) -> Result<()> {
        let path = match file {
            Some(p) => p,
            None => find_single_mcm(Path::new("."))?,
        };
        let text = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        let pkg = parse_mcm_package(&text)?;
        require_confirmation(OperationKind::ScriptExecution, yes)?;
        let actions = pkg.actions.as_deref().unwrap_or(&[]);
        if actions.is_empty() {
            println!("no scripts to execute");
            return Ok(());
        }
        let root = self.game_root_for_pkg(&pkg)?;
        for action in actions {
            crate::pkg_install::run_action(action, &root)?;
        }
        Ok(())
    }

    fn pkg_make(&self) -> Result<()> {
        let profile = self.active_profile()?;
        let lock = self.load_lock(&profile)?;
        let mods: Vec<ModEntry> = lock
            .installed
            .values()
            .map(|m| ModEntry {
                logical_id: m.logical_id.clone(),
                provider: m.provider.clone(),
                project_id: m.project_id.clone(),
                file_id: m.file_id.clone(),
                version: m.version.clone(),
                filename: m.filename.clone(),
                sha256: Some(m.sha256.clone()),
                download_url: None,
            })
            .collect();
        let pkg = McmPackage {
            schema_version: 1,
            name: profile.name.clone(),
            version: "1.0.0".to_owned(),
            description: None,
            game_version: Some(profile.mc_version.clone()),
            loader: Some(profile.loader.clone()),
            dependencies: Vec::new(),
            mods,
            shaderpacks: Vec::new(),
            resourcepacks: Vec::new(),
            datapacks: Vec::new(),
            saves: Vec::new(),
            configs: Vec::new(),
            actions: None,
            launch: None,
            local: None,
        };
        println!("{}", serde_json::to_string_pretty(&pkg)?);
        Ok(())
    }

    fn pkg_share(&self, target: &str, yes: bool) -> Result<()> {
        require_confirmation(OperationKind::PackageInstall, yes)?;
        let _ = self.load_package(target)?;
        println!("OIDC publish flow not implemented yet");
        Ok(())
    }

    fn pkg_list(&self) -> Result<()> {
        let config = self.load_config()?;
        let mut names: BTreeSet<String> = BTreeSet::new();
        for profile in config.profiles.values() {
            if let Ok(lock) = self.load_lock(profile) {
                for m in lock.installed.values() {
                    names.insert(format!("{} {}", m.logical_id, m.version));
                }
            }
        }
        for name in &names {
            println!("{name}");
        }
        Ok(())
    }
}

fn find_single_mcm(dir: &Path) -> Result<PathBuf> {
    let mut entries: Vec<PathBuf> = Vec::new();
    for entry in fs::read_dir(dir).with_context(|| format!("read dir {}", dir.display()))? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("mcm") {
            entries.push(path);
        }
    }
    if entries.is_empty() {
        bail!("no .mcm file found in current directory");
    }
    entries.sort();
    Ok(entries.remove(0))
}
