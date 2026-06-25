//! Package install/download apply logic, split from `pkg_cmd.rs` to stay
//! under the 250 pure-LOC ceiling. Bridges `.mcm` `ModEntry`s to provider
//! `Artifact`s, writes mod jars + shader/resource/datapack/save/config
//! assets to the game root, and runs declared shell actions.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use anyhow::{bail, Context, Result};
use time::OffsetDateTime;

use crate::app::App;
use crate::config::ProfileSnapshot;
use crate::confirmation::{require_confirmation, OperationKind};
use crate::lock::{InstallReason, InstalledMod};
use crate::mcm_package::{
    parse_mcm_package, validate_asset_path, Action, ActionKind, Asset, AssetSource, McmPackage,
    ModEntry,
};
use crate::provider::{Artifact, ReleaseKind};
use crate::safety::{sanitize_filename, validate_download_url};

const SCRIPT_WARNING: &str =
    "WARNING: this package contains scripts that will be executed. Review them carefully.";

impl App {
    pub(crate) fn pkg_install(&self, target: &str, yes: bool) -> Result<()> {
        let pkg = self.load_package(target)?;
        warn_if_scripts(&pkg);
        require_confirmation(OperationKind::PackageInstall, yes)?;
        self.apply_package(&pkg, false)?;
        println!("installed package {} {}", pkg.name, pkg.version);
        Ok(())
    }

    pub(crate) fn pkg_download(&self, target: &str, yes: bool) -> Result<()> {
        let pkg = self.load_package(target)?;
        warn_if_scripts(&pkg);
        require_confirmation(OperationKind::Download, yes)?;
        self.apply_package(&pkg, true)?;
        println!("downloaded package {} {}", pkg.name, pkg.version);
        Ok(())
    }

    pub(crate) fn game_root_for_pkg(&self, pkg: &McmPackage) -> Result<PathBuf> {
        let _ = pkg;
        let profile = self.active_profile()?;
        profile
            .mods_dir
            .parent()
            .map(Path::to_path_buf)
            .context("could not resolve game root from active profile mods_dir")
    }

    pub(crate) fn load_package(&self, target: &str) -> Result<McmPackage> {
        let text = if target.starts_with("http") {
            fetch_url(target)?
        } else {
            let path = Path::new(target);
            fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?
        };
        parse_mcm_package(&text)
    }

    fn apply_package(&self, pkg: &McmPackage, download_only: bool) -> Result<()> {
        let profile = self.active_profile()?;
        check_duplicate_assets(pkg)?;
        if !pkg.mods.is_empty() {
            self.install_pkg_mods(pkg, &profile, download_only)?;
        }
        if !download_only {
            self.install_assets(pkg)?;
            if let Some(actions) = &pkg.actions {
                if !actions.is_empty() {
                    let root = self.game_root_for_pkg(pkg)?;
                    for action in actions {
                        run_action(action, &root)?;
                    }
                }
            }
        }
        Ok(())
    }

    fn install_pkg_mods(
        &self,
        pkg: &McmPackage,
        profile: &crate::config::Profile,
        download_only: bool,
    ) -> Result<()> {
        let provider = self.provider()?;
        let mut lock = self.load_lock(profile)?;
        fs::create_dir_all(&profile.mods_dir)?;
        for entry in &pkg.mods {
            let artifact = mod_entry_to_artifact(entry);
            if let Some(url) = &artifact.download_url {
                validate_download_url(url)?;
            }
            let bytes = provider.download(&artifact)?;
            let hash = crate::util::sha256_hex(&bytes);
            if let Some(expected) = &artifact.sha256 {
                if expected != &hash {
                    bail!("hash mismatch for {}", entry.logical_id);
                }
            }
            if download_only {
                continue;
            }
            let filename = sanitize_filename(&entry.filename)?;
            let target = profile.mods_dir.join(&filename);
            crate::util::atomic_write(&target, &bytes)?;
            lock.installed.insert(
                entry.logical_id.clone(),
                InstalledMod {
                    logical_id: entry.logical_id.clone(),
                    provider: entry.provider.clone(),
                    project_id: entry.project_id.clone(),
                    file_id: entry.file_id.clone(),
                    version: entry.version.clone(),
                    filename,
                    sha256: hash,
                    reason: InstallReason::Manual,
                    required_deps: Vec::new(),
                    profile: ProfileSnapshot {
                        mc_version: profile.mc_version.clone(),
                        loader: profile.loader.clone(),
                        side: profile.side,
                    },
                    installed_at: OffsetDateTime::now_utc().to_string(),
                },
            );
        }
        if !download_only {
            self.save_lock(profile, &lock)?;
        }
        Ok(())
    }

    fn install_assets(&self, pkg: &McmPackage) -> Result<()> {
        let root = self.game_root_for_pkg(pkg)?;
        for asset in all_assets(pkg) {
            validate_asset_path(&asset.path)?;
            let target = root.join(&asset.path);
            crate::util::atomic_write(&target, &asset_bytes(asset))?;
        }
        Ok(())
    }
}

fn warn_if_scripts(pkg: &McmPackage) {
    if let Some(actions) = &pkg.actions {
        if !actions.is_empty() {
            eprintln!("{SCRIPT_WARNING}");
        }
    }
}

fn all_assets(pkg: &McmPackage) -> impl Iterator<Item = &Asset> {
    pkg.shaderpacks
        .iter()
        .chain(&pkg.resourcepacks)
        .chain(&pkg.datapacks)
        .chain(&pkg.saves)
        .chain(&pkg.configs)
}

fn mod_entry_to_artifact(entry: &ModEntry) -> Artifact {
    Artifact {
        file_id: entry.file_id.clone(),
        version: entry.version.clone(),
        release: ReleaseKind::Stable,
        mc_versions: Vec::new(),
        loaders: Vec::new(),
        side: crate::config::Side::Both,
        filename: entry.filename.clone(),
        download_url: entry.download_url.clone(),
        sha256: entry.sha256.clone(),
        download_count: None,
        deps: Vec::new(),
    }
}

fn check_duplicate_assets(pkg: &McmPackage) -> Result<()> {
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for asset in all_assets(pkg) {
        if !seen.insert(asset.path.clone()) {
            bail!("duplicate asset path in package: {}", asset.path);
        }
    }
    Ok(())
}

fn asset_bytes(asset: &Asset) -> Vec<u8> {
    let kind = match asset.source {
        AssetSource::Embedded => "embedded",
        AssetSource::Referenced => "referenced",
    };
    format!(
        "mcm {kind} asset: {}\nhash: {}\n",
        asset.path,
        asset.hash.as_deref().unwrap_or("(none)")
    )
    .into_bytes()
}

pub(crate) fn run_action(action: &Action, cwd: &Path) -> Result<()> {
    match action.kind {
        ActionKind::Shell => {
            let mut cmd = StdCommand::new("sh");
            cmd.arg("-c").arg(&action.command).current_dir(cwd);
            let status = cmd
                .status()
                .with_context(|| format!("run action {}", action.name))?;
            if !status.success() {
                bail!("action {} exited with status {}", action.name, status);
            }
            Ok(())
        }
    }
}

fn fetch_url(url: &str) -> Result<String> {
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .context("build HTTP client")?;
    client
        .get(url)
        .header("User-Agent", "mcm/0.1.0 (Minecraft mod manager)")
        .send()
        .with_context(|| format!("fetch {url}"))?
        .error_for_status()
        .with_context(|| format!("{url} returned error status"))?
        .text()
        .context("read response body")
}
