//! Integration tests for the `pkg` command group + top-level `install` / `do`.
//!
//! Covers:
//! - `pkg install <path> --yes`: writes mod jars + assets, records lock entries.
//! - `pkg install` without `--yes` in non-TTY: bails with confirmation-required.
//! - `pkg download` / `pkg dl` alias: matches `download` behavior.
//! - `pkg make`: creates valid JSON parseable by `parse_mcm_package`.
//! - `pkg list`: read-only, no confirmation.
//! - `pkg info`: regression — still works.
//! - `pkg share`: stub prints "not implemented yet" but requires confirmation.
//! - Top-level `install` auto-selects smallest `.mcm` when no target.
//! - Top-level `install <path>` installs.
//! - Script-containing package warns to stderr unless `--yes`.
//! - Duplicate asset path aborts without partial install.
//! - `do <file> --yes` executes scripts from the game root.

use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

use mcm::parse_mcm_package;

struct TestHome {
    #[allow(dead_code)]
    root: TempDir,
    config: PathBuf,
    state: PathBuf,
    mods: PathBuf,
}

impl TestHome {
    fn new() -> Self {
        let root = tempfile::tempdir().expect("temp dir");
        let config = root.path().join("config");
        let state = root.path().join("state");
        let mods = root.path().join("mods");
        fs::create_dir_all(&mods).expect("mods dir");
        Self {
            root,
            config,
            state,
            mods,
        }
    }

    fn cmd(&self) -> Command {
        let mut cmd = Command::cargo_bin("mcm").expect("mcm binary");
        cmd.args([
            "--config-dir",
            self.config.to_str().unwrap(),
            "--state-dir",
            self.state.to_str().unwrap(),
            "--provider",
            "mock",
        ]);
        cmd
    }

    fn profile(&self) {
        self.cmd()
            .args([
                "mods",
                "add",
                "dev",
                "--mods-dir",
                self.mods.to_str().unwrap(),
                "--mc-version",
                "1.20.1",
                "--loader",
                "fabric",
            ])
            .assert()
            .success()
            .stdout(predicate::str::contains("added profile dev"));
    }

    fn write_mcm(&self, name: &str, json: &str) -> PathBuf {
        let path = self.root.path().join(name);
        fs::write(&path, json).expect("write mcm");
        path
    }
}

fn pkg_with_mod_json() -> String {
    String::from(
        r#"{
            "schema_version": 1,
            "name": "test-pkg",
            "version": "1.0.0",
            "game_version": "1.20.1",
            "loader": "fabric",
            "dependencies": [],
            "mods": [
                {
                    "logical_id": "rootmod",
                    "provider": "mock",
                    "project_id": "rootmod",
                    "file_id": "rootmod-file",
                    "version": "1.0.0",
                    "filename": "rootmod-1.0.0.jar",
                    "download_url": "https://cdn.modrinth.com/mock/rootmod"
                }
            ],
            "shaderpacks": [
                {"path": "shaderpacks/complementary.zip", "source": "embedded", "hash": "deadbeef", "size": 1024}
            ],
            "resourcepacks": [],
            "datapacks": [],
            "saves": [],
            "configs": [
                {"path": "config/sodium.toml", "source": "embedded"}
            ]
        }"#,
    )
}

fn pkg_empty_json() -> String {
    String::from(
        r#"{
            "schema_version": 1,
            "name": "empty-pkg",
            "version": "1.0.0",
            "dependencies": [],
            "mods": [],
            "shaderpacks": [],
            "resourcepacks": [],
            "datapacks": [],
            "saves": [],
            "configs": []
        }"#,
    )
}

fn pkg_with_script_json() -> String {
    let root = std::env::temp_dir();
    let marker = root.join("mcm_do_marker.txt");
    format!(
        r#"{{
            "schema_version": 1,
            "name": "script-pkg",
            "version": "1.0.0",
            "dependencies": [],
            "mods": [],
            "shaderpacks": [],
            "resourcepacks": [],
            "datapacks": [],
            "saves": [],
            "configs": [],
            "actions": [
                {{
                    "name": "touch-marker",
                    "kind": "shell",
                    "command": "echo ran > {marker}"
                }}
            ]
        }}"#,
        marker = marker.display()
    )
}

fn pkg_with_duplicate_asset_json() -> String {
    String::from(
        r#"{
            "schema_version": 1,
            "name": "dup-pkg",
            "version": "1.0.0",
            "dependencies": [],
            "mods": [],
            "shaderpacks": [
                {"path": "shaderpacks/dup.zip", "source": "embedded"}
            ],
            "resourcepacks": [],
            "datapacks": [],
            "saves": [],
            "configs": [
                {"path": "shaderpacks/dup.zip", "source": "embedded"}
            ]
        }"#,
    )
}

// ---------------------------------------------------------------------------
// pkg install --yes writes mod jars + assets + lock entries
// ---------------------------------------------------------------------------

#[test]
fn pkg_install_with_yes_writes_mod_jars_and_assets() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "install", path.to_str().unwrap(), "--yes"])
        .assert()
        .success()
        .stdout(predicate::str::contains("installed package test-pkg 1.0.0"));
    assert!(home.mods.join("rootmod-1.0.0.jar").exists());
    let root = home.mods.parent().unwrap();
    assert!(root.join("shaderpacks/complementary.zip").exists());
    assert!(root.join("config/sodium.toml").exists());
}

#[test]
fn pkg_install_with_yes_records_lock_entry() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "install", path.to_str().unwrap(), "--yes"])
        .assert()
        .success();
    let lock_text = fs::read_to_string(home.state.join("dev.lock.json")).expect("lock file");
    assert!(lock_text.contains("rootmod"));
    assert!(lock_text.contains("manual"));
}

// ---------------------------------------------------------------------------
// pkg install without --yes in non-TTY bails
// ---------------------------------------------------------------------------

#[test]
fn pkg_install_without_yes_bails_in_non_tty() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "install", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "confirmation required; pass --yes to proceed",
        ));
    assert!(!home.mods.join("rootmod-1.0.0.jar").exists());
}

// ---------------------------------------------------------------------------
// pkg download / pkg dl alias
// ---------------------------------------------------------------------------

#[test]
fn pkg_download_with_yes_proceeds() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "download", path.to_str().unwrap(), "--yes"])
        .assert()
        .success()
        .stdout(predicate::str::contains(
            "downloaded package test-pkg 1.0.0",
        ));
}

#[test]
fn pkg_dl_alias_matches_download() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "dl", path.to_str().unwrap(), "--yes"])
        .assert()
        .success()
        .stdout(predicate::str::contains(
            "downloaded package test-pkg 1.0.0",
        ));
}

#[test]
fn pkg_download_without_yes_bails() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "download", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "confirmation required; pass --yes to proceed",
        ));
}

#[test]
fn pkg_dl_without_yes_bails() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "dl", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "confirmation required; pass --yes to proceed",
        ));
}

// ---------------------------------------------------------------------------
// pkg make creates valid JSON
// ---------------------------------------------------------------------------

#[test]
fn pkg_make_creates_valid_json() {
    let home = TestHome::new();
    home.profile();
    let output = home
        .cmd()
        .args(["pkg", "make"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let json = String::from_utf8(output).expect("utf8");
    let pkg = parse_mcm_package(&json).expect("make output should parse");
    assert_eq!(pkg.name, "dev");
    assert_eq!(pkg.schema_version, 1);
}

#[test]
fn pkg_make_excludes_secrets_by_default() {
    let home = TestHome::new();
    home.profile();
    let output = home
        .cmd()
        .args(["pkg", "make"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let json = String::from_utf8(output).expect("utf8");
    assert!(!json.contains("token"));
    assert!(!json.contains("secret"));
    assert!(!json.contains("password"));
}

// ---------------------------------------------------------------------------
// pkg list is read-only
// ---------------------------------------------------------------------------

#[test]
fn pkg_list_on_fresh_config_is_empty() {
    let home = TestHome::new();
    home.cmd()
        .args(["pkg", "list"])
        .assert()
        .success()
        .stdout(predicate::str::is_empty());
}

#[test]
fn pkg_list_after_install_shows_entry() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "install", path.to_str().unwrap(), "--yes"])
        .assert()
        .success();
    home.cmd()
        .args(["pkg", "list"])
        .assert()
        .success()
        .stdout(predicate::str::contains("rootmod"));
}

#[test]
fn pkg_list_never_prompts_without_yes() {
    let home = TestHome::new();
    home.profile();
    home.cmd()
        .args(["pkg", "list"])
        .assert()
        .success()
        .stderr(predicate::str::contains("confirmation required").not());
}

// ---------------------------------------------------------------------------
// pkg info regression
// ---------------------------------------------------------------------------

#[test]
fn pkg_info_still_works() {
    let home = TestHome::new();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "info", path.to_str().unwrap()])
        .assert()
        .success()
        .stdout(
            predicate::str::contains("name: test-pkg")
                .and(predicate::str::contains("version: 1.0.0"))
                .and(predicate::str::contains("mods: 1")),
        );
}

// ---------------------------------------------------------------------------
// pkg share stub
// ---------------------------------------------------------------------------

#[test]
fn pkg_share_with_yes_prints_not_implemented() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "share", path.to_str().unwrap(), "--yes"])
        .assert()
        .success()
        .stdout(predicate::str::contains("not implemented yet"));
}

#[test]
fn pkg_share_without_yes_bails() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "share", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "confirmation required; pass --yes to proceed",
        ));
}

// ---------------------------------------------------------------------------
// Top-level install auto-selects smallest .mcm when no target
// ---------------------------------------------------------------------------

#[test]
fn top_install_auto_selects_smallest_mcm() {
    let home = TestHome::new();
    home.profile();
    let _ = home.write_mcm("zzz.mcm", &pkg_empty_json());
    let _ = home.write_mcm("aaa.mcm", &pkg_empty_json());
    let cwd = home.root.path();
    let mut cmd = Command::cargo_bin("mcm").expect("mcm binary");
    cmd.current_dir(cwd).args([
        "--config-dir",
        home.config.to_str().unwrap(),
        "--state-dir",
        home.state.to_str().unwrap(),
        "--provider",
        "mock",
        "install",
        "--yes",
    ]);
    cmd.assert().success().stdout(predicate::str::contains(
        "installed package empty-pkg 1.0.0",
    ));
}

#[test]
fn top_install_with_target_installs() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["install", path.to_str().unwrap(), "--yes"])
        .assert()
        .success()
        .stdout(predicate::str::contains("installed package test-pkg 1.0.0"));
}

#[test]
fn top_install_without_yes_bails() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["install", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "confirmation required; pass --yes to proceed",
        ));
}

#[test]
fn top_install_rejects_mc_smart_target() {
    let home = TestHome::new();
    home.profile();
    home.cmd()
        .args(["install", "mc1.21.1-neoforge", "--yes"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("Minecraft smart targets"));
}

#[test]
fn top_install_rejects_raw_mod_name() {
    let home = TestHome::new();
    home.profile();
    home.cmd()
        .args(["install", "sodium", "--yes"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("raw mod names"));
}

#[test]
fn top_install_no_mcm_in_cwd_errors() {
    let home = TestHome::new();
    home.profile();
    let cwd = home.root.path();
    let mut cmd = Command::cargo_bin("mcm").expect("mcm binary");
    cmd.current_dir(cwd).args([
        "--config-dir",
        home.config.to_str().unwrap(),
        "--state-dir",
        home.state.to_str().unwrap(),
        "--provider",
        "mock",
        "install",
        "--yes",
    ]);
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("no .mcm file found"));
}

// ---------------------------------------------------------------------------
// Script-containing package warns to stderr unless --yes
// ---------------------------------------------------------------------------

#[test]
fn pkg_install_with_script_warns_on_stderr_with_yes() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("script.mcm", &pkg_with_script_json());
    home.cmd()
        .args(["pkg", "install", path.to_str().unwrap(), "--yes"])
        .assert()
        .success()
        .stderr(predicate::str::contains(
            "WARNING: this package contains scripts",
        ));
}

#[test]
fn pkg_install_without_script_no_warning() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("test.mcm", &pkg_with_mod_json());
    home.cmd()
        .args(["pkg", "install", path.to_str().unwrap(), "--yes"])
        .assert()
        .success()
        .stderr(predicate::str::contains("contains scripts").not());
}

// ---------------------------------------------------------------------------
// Duplicate asset path aborts without partial install
// ---------------------------------------------------------------------------

#[test]
fn pkg_install_duplicate_asset_aborts_without_partial() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("dup.mcm", &pkg_with_duplicate_asset_json());
    home.cmd()
        .args(["pkg", "install", path.to_str().unwrap(), "--yes"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("duplicate asset path"));
    let root = home.mods.parent().unwrap();
    assert!(!root.join("shaderpacks/dup.zip").exists());
}

// ---------------------------------------------------------------------------
// do <file> --yes executes scripts from game root
// ---------------------------------------------------------------------------

#[test]
fn do_with_yes_executes_scripts_from_game_root() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("script.mcm", &pkg_with_script_json());
    let marker = std::env::temp_dir().join("mcm_do_marker.txt");
    let _ = fs::remove_file(&marker);
    home.cmd()
        .args(["do", path.to_str().unwrap(), "--yes"])
        .assert()
        .success();
    assert!(marker.exists(), "script should have created marker file");
    let _ = fs::remove_file(&marker);
}

#[test]
fn do_without_yes_bails() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("script.mcm", &pkg_with_script_json());
    home.cmd()
        .args(["do", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "confirmation required; pass --yes to proceed",
        ));
}

#[test]
fn do_with_no_scripts_prints_nothing_to_execute() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("empty.mcm", &pkg_empty_json());
    home.cmd()
        .args(["do", path.to_str().unwrap(), "--yes"])
        .assert()
        .success()
        .stdout(predicate::str::contains("no scripts to execute"));
}

#[test]
fn do_auto_selects_single_mcm_in_cwd() {
    let home = TestHome::new();
    home.profile();
    let _ = home.write_mcm("only.mcm", &pkg_empty_json());
    let cwd = home.root.path();
    let mut cmd = Command::cargo_bin("mcm").expect("mcm binary");
    cmd.current_dir(cwd).args([
        "--config-dir",
        home.config.to_str().unwrap(),
        "--state-dir",
        home.state.to_str().unwrap(),
        "--provider",
        "mock",
        "do",
        "--yes",
    ]);
    cmd.assert()
        .success()
        .stdout(predicate::str::contains("no scripts to execute"));
}

// ---------------------------------------------------------------------------
// Empty package install (no mods, no assets, no scripts) succeeds
// ---------------------------------------------------------------------------

#[test]
fn pkg_install_empty_package_succeeds() {
    let home = TestHome::new();
    home.profile();
    let path = home.write_mcm("empty.mcm", &pkg_empty_json());
    home.cmd()
        .args(["pkg", "install", path.to_str().unwrap(), "--yes"])
        .assert()
        .success()
        .stdout(predicate::str::contains(
            "installed package empty-pkg 1.0.0",
        ));
}
