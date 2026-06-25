use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use time::OffsetDateTime;

use crate::config::ProfileSnapshot;
use crate::confirmation::{emit_mc_critical_warning, OperationKind};
use crate::install::{build_plan, print_plan, read_mod_list, search_install_roots};
use crate::lock::{reachable_required_deps, remove_owned_file, InstallReason, InstalledMod};
use crate::safety::{confirm_install, sanitize_filename, validate_download_url};
use crate::util::sha256_hex;

impl crate::app::App {
    pub(crate) fn install(
        &self,
        query: Option<String>,
        file: Option<PathBuf>,
        dry_run: bool,
        yes: bool,
    ) -> Result<()> {
        let mut roots = Vec::new();
        if let Some(query) = query {
            roots.push(query);
        }
        if let Some(file) = file {
            roots.extend(read_mod_list(&file)?);
        }
        if roots.is_empty() {
            bail!("install requires a query or --file <PATH>");
        }
        let profile = self.active_profile()?;
        let provider = self.provider()?;
        let mut lock = self.load_lock(&profile)?;
        let roots = search_install_roots(provider.as_ref(), &profile, &roots)?;
        let plan = build_plan(provider.as_ref(), &profile, &roots, &lock)?;
        print_plan(&plan, dry_run);
        if !yes && !dry_run && !confirm_install()? {
            bail!("installation cancelled");
        }
        if dry_run {
            return Ok(());
        }
        fs::create_dir_all(&profile.mods_dir)?;
        let mut staged = Vec::new();
        for item in &plan.installs {
            let url = item
                .artifact
                .download_url
                .as_deref()
                .context("missing download URL")?;
            validate_download_url(url)?;
            let bytes = provider.download(&item.artifact)?;
            let hash = sha256_hex(&bytes);
            if let Some(expected) = &item.artifact.sha256 {
                if expected != &hash {
                    bail!("hash mismatch for {}", item.logical_id);
                }
            }
            staged.push((item, bytes, hash));
        }
        for (item, bytes, hash) in staged {
            let filename = sanitize_filename(&item.artifact.filename)?;
            let target = profile.mods_dir.join(&filename);
            crate::util::atomic_write(&target, &bytes)?;
            lock.installed.insert(
                item.logical_id.clone(),
                InstalledMod {
                    logical_id: item.logical_id.clone(),
                    provider: item.candidate.provider.clone(),
                    project_id: item.candidate.project_id.clone(),
                    file_id: item.artifact.file_id.clone(),
                    version: item.artifact.version.clone(),
                    filename,
                    sha256: hash,
                    reason: item.reason,
                    required_deps: item.required_deps.clone(),
                    profile: ProfileSnapshot {
                        mc_version: profile.mc_version.clone(),
                        loader: profile.loader.clone(),
                        side: profile.side,
                    },
                    installed_at: OffsetDateTime::now_utc().to_string(),
                },
            );
        }
        self.save_lock(&profile, &lock)?;
        Ok(())
    }

    pub(crate) fn remove(&self, logical_id: &str, yes: bool) -> Result<()> {
        let profile = self.active_profile()?;
        let mut lock = self.load_lock(&profile)?;
        let Some(item) = lock.installed.get(logical_id).cloned() else {
            bail!("{logical_id} is not installed");
        };
        if item.reason != InstallReason::Manual {
            bail!("{logical_id} is automatic; use autoremove when no roots require it");
        }
        if !yes {
            bail!("confirmation required; pass --yes to apply");
        }
        remove_owned_file(&profile, &item)?;
        lock.installed.remove(logical_id);
        self.save_lock(&profile, &lock)?;
        println!("removed {logical_id}");
        Ok(())
    }

    pub(crate) fn autoremove(&self, yes: bool) -> Result<()> {
        let profile = self.active_profile()?;
        let mut lock = self.load_lock(&profile)?;
        let needed = reachable_required_deps(&lock);
        let removable: Vec<String> = lock
            .installed
            .iter()
            .filter(|(id, item)| item.reason == InstallReason::Auto && !needed.contains(*id))
            .map(|(id, _)| id.clone())
            .collect();
        if removable.is_empty() {
            println!("nothing to autoremove");
            return Ok(());
        }
        if !yes {
            bail!("confirmation required; pass --yes to apply");
        }
        emit_mc_critical_warning(OperationKind::Autoremove);
        for id in removable {
            if let Some(item) = lock.installed.remove(&id) {
                remove_owned_file(&profile, &item)?;
                println!("removed {id}");
            }
        }
        self.save_lock(&profile, &lock)?;
        Ok(())
    }
}
