// SIZE_OK: non-test source is ~220 LOC; the rest is the `#[cfg(test)] mod
// tests` block (select_artifact / build_plan / composite regression tests)
// which is test fixture and stays with the code it exercises.
use std::collections::{BTreeMap, VecDeque};
use std::fs;
use std::path::Path;

use anyhow::{bail, Context, Result};

use crate::config::{Profile, Side};
use crate::lock::{InstallReason, LockState};
use crate::provider::{
    group_projects, Artifact, DependencyKind, Plan, PlannedInstall, Project, Provider,
};

pub(crate) fn search_install_roots(
    provider: &dyn Provider,
    profile: &Profile,
    roots: &[String],
) -> Result<Vec<String>> {
    let mut selected = Vec::new();
    for query in roots {
        let mut results = group_projects(provider.search(query, profile)?);
        if results.is_empty() {
            bail!("mod {query} not found by search");
        }
        let project = results.remove(0);
        println!("selected {} from search result {query}", project.logical_id);
        selected.push(project.logical_id);
    }
    Ok(selected)
}

pub(crate) fn deps_by_kind(artifact: &Artifact, kind: DependencyKind) -> Vec<String> {
    artifact
        .deps
        .iter()
        .filter(|dep| dep.kind == kind)
        .map(|dep| dep.logical_id.clone())
        .collect()
}

pub(crate) fn build_plan(
    provider: &dyn Provider,
    profile: &Profile,
    roots: &[String],
    lock: &LockState,
) -> Result<Plan> {
    let mut planned: BTreeMap<String, PlannedInstall> = BTreeMap::new();
    let mut warnings = Vec::new();
    let mut queue: VecDeque<(String, InstallReason)> = roots
        .iter()
        .cloned()
        .map(|root| (root, InstallReason::Manual))
        .collect();
    while let Some((query, reason)) = queue.pop_front() {
        let project = provider.get(&query, profile)?;
        let logical_id = project.logical_id.clone();
        if planned.contains_key(&logical_id) {
            if reason == InstallReason::Manual {
                if let Some(existing) = planned.get_mut(&logical_id) {
                    existing.reason = InstallReason::Manual;
                }
            }
            continue;
        }
        if let Some(existing) = lock.installed.get(&logical_id) {
            if existing.reason == InstallReason::Auto && reason == InstallReason::Manual {
                let mut candidate = project
                    .candidates
                    .first()
                    .cloned()
                    .context("project has no candidates")?;
                let artifact = select_artifact(&project, profile)?;
                candidate.artifacts = vec![artifact.clone()];
                planned.insert(
                    logical_id.clone(),
                    PlannedInstall {
                        logical_id,
                        candidate,
                        artifact,
                        reason,
                        required_deps: Vec::new(),
                    },
                );
            }
            continue;
        }
        let artifact = select_artifact(&project, profile)?;
        let candidate = project
            .candidates
            .iter()
            .find(|candidate| {
                candidate
                    .artifacts
                    .iter()
                    .any(|artifact_item| artifact_item.file_id == artifact.file_id)
            })
            .cloned()
            .or_else(|| project.candidates.first().cloned())
            .context("project has no candidates")?;
        let mut required_deps = Vec::new();
        for dep in &artifact.deps {
            match dep.kind {
                DependencyKind::Required => {
                    let dep_project = provider.get(&dep.logical_id, profile)?;
                    required_deps.push(dep_project.logical_id);
                    queue.push_back((dep.logical_id.clone(), InstallReason::Auto));
                }
                DependencyKind::Optional => warnings.push(format!(
                    "optional dependency {} not installed",
                    dep.logical_id
                )),
                DependencyKind::Embedded => warnings.push(format!(
                    "embedded dependency {} not installed",
                    dep.logical_id
                )),
                DependencyKind::Incompatible => warnings.push(format!(
                    "incompatible dependency {} not installed",
                    dep.logical_id
                )),
                DependencyKind::Unknown => warnings.push(format!(
                    "unknown dependency {} not installed",
                    dep.logical_id
                )),
            }
        }
        planned.insert(
            logical_id.clone(),
            PlannedInstall {
                logical_id,
                candidate,
                artifact,
                reason,
                required_deps,
            },
        );
    }
    Ok(Plan {
        installs: planned.into_values().collect(),
        warnings,
    })
}

pub(crate) fn print_plan(plan: &Plan, dry_run: bool) {
    if dry_run {
        println!("dry run");
    }
    for item in &plan.installs {
        println!(
            "install {} {} {:?}",
            item.logical_id, item.artifact.version, item.reason
        );
    }
    for warning in &plan.warnings {
        println!("warning: {warning}");
    }
}

pub(crate) fn select_artifact(project: &Project, profile: &Profile) -> Result<Artifact> {
    project
        .candidates
        .iter()
        .flat_map(|candidate| candidate.artifacts.iter())
        .filter(|artifact| artifact.release == crate::provider::ReleaseKind::Stable)
        .filter(|artifact| {
            artifact
                .mc_versions
                .iter()
                .any(|version| version == &profile.mc_version)
        })
        .filter(|artifact| {
            artifact
                .loaders
                .iter()
                .any(|loader| loader == &profile.loader)
        })
        .filter(|artifact| {
            artifact.side == Side::Both
                || artifact.side == profile.side
                || profile.side == Side::Both
        })
        .fold(
            None,
            |selected: Option<&Artifact>, artifact| match selected {
                Some(current) if !artifact_is_better(artifact, current) => Some(current),
                _ => Some(artifact),
            },
        )
        .cloned()
        .with_context(|| format!("no stable compatible artifact for {}", project.logical_id))
}

fn artifact_is_better(candidate: &Artifact, current: &Artifact) -> bool {
    if candidate.version == current.version {
        return candidate.download_count.unwrap_or(0) > current.download_count.unwrap_or(0);
    }
    match (
        parse_dotted_version(&candidate.version),
        parse_dotted_version(&current.version),
    ) {
        (Some(candidate_version), Some(current_version)) => {
            candidate_version > current_version
                || (candidate_version == current_version
                    && candidate.download_count.unwrap_or(0) > current.download_count.unwrap_or(0))
        }
        _ => false,
    }
}

fn parse_dotted_version(version: &str) -> Option<Vec<u64>> {
    let mut parts = Vec::new();
    for part in version.split('.') {
        if part.is_empty() || !part.chars().all(|ch| ch.is_ascii_digit()) {
            return None;
        }
        parts.push(part.parse().ok()?);
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts)
    }
}

pub(crate) fn read_mod_list(path: &Path) -> Result<Vec<String>> {
    let text = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    Ok(text
        .lines()
        .map(|line| line.split('#').next().unwrap_or_default().trim())
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Profile, Side};
    use crate::lock::{test_installed_mod, LockState};
    use crate::provider::mock::test_helpers::{artifact, dep};
    use crate::provider::{Artifact, Candidate, DependencyKind, Project, Provider};
    use std::path::PathBuf;

    fn test_profile() -> Profile {
        Profile {
            name: "test".to_owned(),
            mods_dir: PathBuf::from("mods"),
            mc_version: "1.20.1".to_owned(),
            loader: "fabric".to_owned(),
            side: Side::Both,
        }
    }

    #[test]
    fn select_artifact_uses_numeric_versions_and_download_count_tiebreaker() {
        let mut low = artifact(
            "low",
            "1.9.0",
            "mod-1.9.0.jar",
            Some("https://cdn.example/low.jar"),
            vec![],
        );
        low.download_count = Some(1000);
        let mut high = artifact(
            "high",
            "1.10.0",
            "mod-1.10.0.jar",
            Some("https://cdn.example/high.jar"),
            vec![],
        );
        high.download_count = Some(1);
        let mut same_low = artifact(
            "same-low",
            "1.10.0",
            "mod-1.10.0-low.jar",
            Some("https://cdn.example/same-low.jar"),
            vec![],
        );
        same_low.download_count = Some(2);
        let mut same_high = artifact(
            "same-high",
            "1.10.0",
            "mod-1.10.0-high.jar",
            Some("https://cdn.example/same-high.jar"),
            vec![],
        );
        same_high.download_count = Some(20);
        let project = Project {
            logical_id: "versioned".into(),
            title: "Versioned".into(),
            description: String::new(),
            candidates: vec![Candidate {
                provider: "mock".into(),
                project_id: "versioned".into(),
                artifacts: vec![low, high, same_low, same_high],
            }],
        };

        let selected = select_artifact(&project, &test_profile()).expect("selected artifact");
        assert_eq!(selected.file_id, "same-high");
    }

    #[test]
    fn build_plan_records_resolved_dependency_logical_id_for_reachability() {
        struct MismatchProvider;

        impl Provider for MismatchProvider {
            fn search(&self, _query: &str, profile: &Profile) -> Result<Vec<Project>> {
                self.get("root", profile).map(|project| vec![project])
            }

            fn get(&self, query: &str, _profile: &Profile) -> Result<Project> {
                match query {
                    "root" => Ok(Project {
                        logical_id: "root".into(),
                        title: "Root".into(),
                        description: String::new(),
                        candidates: vec![Candidate {
                            provider: "mock".into(),
                            project_id: "root".into(),
                            artifacts: vec![artifact(
                                "root-file",
                                "1.0.0",
                                "root.jar",
                                Some("https://cdn.example/root.jar"),
                                vec![dep("raw-dep-id", DependencyKind::Required)],
                            )],
                        }],
                    }),
                    "raw-dep-id" => Ok(Project {
                        logical_id: "resolved-dep".into(),
                        title: "Resolved Dep".into(),
                        description: String::new(),
                        candidates: vec![Candidate {
                            provider: "mock".into(),
                            project_id: "raw-dep-id".into(),
                            artifacts: vec![artifact(
                                "dep-file",
                                "1.0.0",
                                "dep.jar",
                                Some("https://cdn.example/dep.jar"),
                                vec![],
                            )],
                        }],
                    }),
                    _ => bail!("unexpected query {query}"),
                }
            }

            fn download(&self, _artifact: &Artifact) -> Result<Vec<u8>> {
                Ok(Vec::new())
            }
        }

        let plan = build_plan(
            &MismatchProvider,
            &test_profile(),
            &["root".into()],
            &LockState::default(),
        )
        .expect("plan");
        let root = plan
            .installs
            .iter()
            .find(|item| item.logical_id == "root")
            .expect("root planned");
        assert_eq!(root.required_deps, vec!["resolved-dep"]);

        let mut lock = LockState::default();
        for item in plan.installs {
            lock.installed.insert(
                item.logical_id.clone(),
                test_installed_mod(
                    item.logical_id,
                    item.candidate.provider,
                    item.candidate.project_id,
                    item.artifact.file_id,
                    item.artifact.version,
                    item.artifact.filename,
                    item.reason,
                    item.required_deps,
                ),
            );
        }
        assert!(crate::lock::reachable_required_deps(&lock).contains("resolved-dep"));
    }

    #[test]
    fn composite_provider_merges_projects_from_multiple_sources() {
        struct StaticProvider {
            project: Project,
        }

        impl Provider for StaticProvider {
            fn search(&self, _query: &str, _profile: &Profile) -> Result<Vec<Project>> {
                Ok(vec![self.project.clone()])
            }

            fn get(&self, _query: &str, _profile: &Profile) -> Result<Project> {
                Ok(self.project.clone())
            }

            fn download(&self, _artifact: &Artifact) -> Result<Vec<u8>> {
                Ok(Vec::new())
            }
        }

        let provider = crate::provider::CompositeProvider::new(vec![
            Box::new(StaticProvider {
                project: Project {
                    logical_id: "same".into(),
                    title: "Same".into(),
                    description: "first".into(),
                    candidates: vec![Candidate {
                        provider: "one".into(),
                        project_id: "same-one".into(),
                        artifacts: vec![artifact(
                            "one-file",
                            "1.0.0",
                            "same.jar",
                            Some("https://cdn.example/one.jar"),
                            vec![],
                        )],
                    }],
                },
            }),
            Box::new(StaticProvider {
                project: Project {
                    logical_id: "same".into(),
                    title: "Same".into(),
                    description: "second".into(),
                    candidates: vec![Candidate {
                        provider: "two".into(),
                        project_id: "same-two".into(),
                        artifacts: vec![artifact(
                            "two-file",
                            "1.0.0",
                            "same.jar",
                            Some("https://cdn.example/two.jar"),
                            vec![],
                        )],
                    }],
                },
            }),
        ]);

        let found = provider
            .search("same", &test_profile())
            .expect("composite search");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].candidates.len(), 2);
    }
}
