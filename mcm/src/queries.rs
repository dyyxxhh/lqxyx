use std::path::Path;

use anyhow::Result;

use crate::install::{deps_by_kind, select_artifact};
use crate::provider::{candidate_summary, group_projects, DependencyKind};

impl crate::app::App {
    pub(crate) fn search(&self, query: &str) -> Result<()> {
        let profile = self.active_profile()?;
        let provider = self.provider()?;
        for project in group_projects(provider.search(query, &profile)?) {
            println!("{} - {}", project.logical_id, project.title);
            println!("  {}", project.description);
            println!("  candidates: {}", candidate_summary(&project.candidates));
        }
        Ok(())
    }

    pub(crate) fn info(&self, query: &str) -> Result<()> {
        let path = Path::new(query);
        if path.exists() || query.ends_with(".jar") {
            return crate::jar_info::local_jar_info(path);
        }
        let profile = self.active_profile()?;
        let provider = self.provider()?;
        let project = provider.get(query, &profile)?;
        let artifact = select_artifact(&project, &profile)?;
        println!("{} - {}", project.logical_id, project.title);
        println!("{}", project.description);
        println!("candidates: {}", candidate_summary(&project.candidates));
        println!("selected: {} {}", artifact.file_id, artifact.version);
        let required = deps_by_kind(&artifact, DependencyKind::Required);
        let optional = deps_by_kind(&artifact, DependencyKind::Optional);
        if !required.is_empty() {
            println!("required deps: {}", required.join(", "));
        }
        if !optional.is_empty() {
            println!("optional deps: {}", optional.join(", "));
        }
        for dep in artifact.deps.iter().filter(|dep| {
            dep.kind != DependencyKind::Required && dep.kind != DependencyKind::Optional
        }) {
            println!(
                "warning: {:?} dependency {} not installed",
                dep.kind, dep.logical_id
            );
        }
        Ok(())
    }

    pub(crate) fn list(&self) -> Result<()> {
        let profile = self.active_profile()?;
        let lock = self.load_lock(&profile)?;
        for item in lock.installed.values() {
            println!(
                "{} {} {:?} {}/{}",
                item.logical_id, item.version, item.reason, item.provider, item.file_id
            );
        }
        Ok(())
    }

    pub(crate) fn status(&self) -> Result<()> {
        let profile = self.active_profile()?;
        let lock = self.load_lock(&profile)?;
        let mut owned = std::collections::BTreeSet::new();
        for item in lock.installed.values() {
            let filename = crate::safety::sanitize_filename(&item.filename)?;
            let target_path = profile.mods_dir.join(&filename);
            owned.insert(target_path.clone());
            if !target_path.exists() {
                println!("missing: {} ({})", item.logical_id, item.filename);
                continue;
            }
            let bytes = std::fs::read(&target_path)?;
            let actual = crate::util::sha256_hex(&bytes);
            if actual != item.sha256 {
                println!("changed: {} ({})", item.logical_id, item.filename);
            } else {
                println!("ok: {}", item.logical_id);
            }
        }
        if profile.mods_dir.exists() {
            for entry in std::fs::read_dir(&profile.mods_dir)? {
                let path = entry?.path();
                if path.extension().and_then(|ext| ext.to_str()) == Some("jar")
                    && !owned.contains(&path)
                {
                    if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
                        println!("untracked: {name}");
                    }
                }
            }
        }
        Ok(())
    }
}
