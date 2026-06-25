//! Unit + CLI-surface tests for the `.mcm` package schema and parser.
//!
//! Schema-validation tests call `parse_mcm_package` directly (preferred for
//! pure schema coverage). CLI-surface tests use the `--config-dir`/`--state-dir`
//! isolation pattern from `tests/mvp.rs` and `tests/game_config.rs`.

use std::fs;
use std::path::PathBuf;

use assert_cmd::Command;
use predicates::prelude::*;
use tempfile::TempDir;

use mcm::parse_mcm_package;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

fn valid_pkg_json() -> String {
    String::from(
        r#"{
            "schema_version": 1,
            "name": "my-pack",
            "version": "1.0.0",
            "description": "a test pack",
            "game_version": "1.20.1",
            "loader": "fabric",
            "dependencies": [
                {"name": "fabric-api", "version_requirement": ">=0.90"}
            ],
            "mods": [
                {
                    "logical_id": "sodium",
                    "provider": "modrinth",
                    "project_id": "AANobbMI",
                    "file_id": "file-1",
                    "version": "0.5.3",
                    "filename": "sodium-fabric-0.5.3.jar",
                    "sha256": "abc123",
                    "download_url": "https://cdn.modrinth.com/data/AANobbMI/versions/0.5.3/sodium-fabric-0.5.3.jar"
                }
            ],
            "shaderpacks": [
                {"path": "shaderpacks/complementary.zip", "source": "referenced", "hash": "deadbeef", "size": 1024}
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

struct TestHome {
    root: TempDir,
    config: PathBuf,
    state: PathBuf,
}

impl TestHome {
    fn new() -> Self {
        let root = tempfile::tempdir().expect("temp dir");
        let config = root.path().join("config");
        let state = root.path().join("state");
        fs::create_dir_all(&config).expect("config dir");
        fs::create_dir_all(&state).expect("state dir");
        Self {
            root,
            config,
            state,
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

    fn write_mcm(&self, name: &str, body: &str) -> PathBuf {
        let path = self.root.path().join(name);
        fs::write(&path, body).expect("write mcm");
        path
    }
}

// ---------------------------------------------------------------------------
// Valid package — direct parser
// ---------------------------------------------------------------------------

#[test]
fn parser_accepts_valid_minimal_package() {
    let json = r#"{"schema_version":1,"name":"a","version":"0.1"}"#;
    let pkg = parse_mcm_package(json).expect("valid minimal package");
    assert_eq!(pkg.schema_version, 1);
    assert_eq!(pkg.name, "a");
    assert_eq!(pkg.version, "0.1");
}

#[test]
fn parser_accepts_valid_full_package() {
    let pkg = parse_mcm_package(&valid_pkg_json()).expect("valid full package");
    assert_eq!(pkg.name, "my-pack");
    assert_eq!(pkg.version, "1.0.0");
    assert_eq!(pkg.description.as_deref(), Some("a test pack"));
    assert_eq!(pkg.game_version.as_deref(), Some("1.20.1"));
    assert_eq!(pkg.loader.as_deref(), Some("fabric"));
    assert_eq!(pkg.dependencies.len(), 1);
    assert_eq!(pkg.mods.len(), 1);
    assert_eq!(pkg.shaderpacks.len(), 1);
    assert_eq!(pkg.configs.len(), 1);
    assert!(pkg.resourcepacks.is_empty());
}

#[test]
fn parser_accepts_package_with_all_optional_fields_present() {
    let json = r#"{
        "schema_version": 1,
        "name": "opt-pack",
        "version": "2.0",
        "description": "all optional fields",
        "game_version": "1.21",
        "loader": "neoforge",
        "dependencies": [],
        "mods": [],
        "shaderpacks": [],
        "resourcepacks": [],
        "datapacks": [],
        "saves": [],
        "configs": [],
        "actions": [{"name":"hello","kind":"shell","command":"echo hi","cwd":"/tmp"}],
        "launch": {"game":"mygame","args":["--width","1280"]},
        "local": {"settings": {"a": 1}, "history": [{"x": 1}]}
    }"#;
    let pkg = parse_mcm_package(json).expect("all optional fields");
    let actions = pkg.actions.expect("actions present");
    assert_eq!(actions.len(), 1);
    assert_eq!(actions[0].name, "hello");
    let launch = pkg.launch.expect("launch present");
    assert_eq!(launch.game.as_deref(), Some("mygame"));
    assert_eq!(launch.args.len(), 2);
    assert!(pkg.local.is_some());
}

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

#[test]
fn parser_rejects_unknown_schema_version() {
    let json = r#"{"schema_version":99,"name":"a","version":"1"}"#;
    let err = parse_mcm_package(json).unwrap_err();
    let msg = format!("{err}");
    assert!(msg.contains("unsupported schema version 99"), "got: {msg}");
}

#[test]
fn parser_rejects_missing_schema_version() {
    let json = r#"{"name":"a","version":"1"}"#;
    assert!(parse_mcm_package(json).is_err());
}

// ---------------------------------------------------------------------------
// Package name normalization
// ---------------------------------------------------------------------------

#[test]
fn parser_rejects_reserved_name_mcm() {
    let json = r#"{"schema_version":1,"name":"mcm","version":"1"}"#;
    let err = parse_mcm_package(json).unwrap_err();
    assert!(format!("{err}").contains("reserved"), "got: {err}");
}

#[test]
fn parser_rejects_windows_reserved_names() {
    for name in ["con", "nul", "aux", "prn"] {
        let json = format!(r#"{{"schema_version":1,"name":"{name}","version":"1"}}"#);
        let err = parse_mcm_package(&json).unwrap_err();
        assert!(
            format!("{err}").contains("reserved"),
            "{name:?} should be rejected as reserved; got: {err}"
        );
    }
}

#[test]
fn parser_rejects_uppercase_and_underscore_in_name() {
    for name in ["MyPack", "my_pack", "my.pack"] {
        let json = format!(r#"{{"schema_version":1,"name":"{name}","version":"1"}}"#);
        let err = parse_mcm_package(&json).unwrap_err();
        assert!(
            format!("{err}").contains("[a-z0-9-]"),
            "{name:?} should be rejected; got: {err}"
        );
    }
}

#[test]
fn parser_rejects_name_with_leading_trailing_hyphen() {
    for name in ["-abc", "abc-", "-abc-"] {
        let json = format!(r#"{{"schema_version":1,"name":"{name}","version":"1"}}"#);
        let err = parse_mcm_package(&json).unwrap_err();
        assert!(
            format!("{err}").contains("alphanumeric"),
            "{name:?} should be rejected; got: {err}"
        );
    }
}

#[test]
fn parser_rejects_name_with_consecutive_hyphens() {
    let json = r#"{"schema_version":1,"name":"a--b","version":"1"}"#;
    let err = parse_mcm_package(json).unwrap_err();
    assert!(
        format!("{err}").contains("consecutive hyphens"),
        "got: {err}"
    );
}

#[test]
fn parser_rejects_name_too_long() {
    let name = "a".repeat(65);
    let json = format!(r#"{{"schema_version":1,"name":"{name}","version":"1"}}"#);
    let err = parse_mcm_package(&json).unwrap_err();
    assert!(format!("{err}").contains("1-64"), "got: {err}");
}

#[test]
fn parser_accepts_longest_valid_name() {
    let name = "a".repeat(64);
    let json = format!(r#"{{"schema_version":1,"name":"{name}","version":"1"}}"#);
    parse_mcm_package(&json).expect("64-char name should be accepted");
}

// ---------------------------------------------------------------------------
// Secret field rejection
// ---------------------------------------------------------------------------

#[test]
fn parser_rejects_top_level_token_field() {
    let json = r#"{"schema_version":1,"name":"a","version":"1","api_token":"x"}"#;
    let err = parse_mcm_package(json).unwrap_err();
    assert!(format!("{err}").contains("secret field"), "got: {err}");
}

#[test]
fn parser_rejects_nested_secret_field_case_insensitive() {
    let json = r#"{
        "schema_version": 1,
        "name": "a",
        "version": "1",
        "local": {"settings": {"PASSWORD": "xxx"}, "history": []}
    }"#;
    let err = parse_mcm_package(json).unwrap_err();
    let msg = format!("{err}");
    assert!(msg.contains("secret field"), "got: {msg}");
}

#[test]
fn parser_rejects_secret_in_array_element() {
    let json = r#"{
        "schema_version": 1,
        "name": "a",
        "version": "1",
        "mods": [{"logical_id":"x","provider":"p","project_id":"p","file_id":"f","version":"v","filename":"x.jar","password":"leak"}]
    }"#;
    let err = parse_mcm_package(json).unwrap_err();
    assert!(format!("{err}").contains("secret field"), "got: {err}");
}

// ---------------------------------------------------------------------------
// Size / depth limits
// ---------------------------------------------------------------------------

#[test]
fn parser_rejects_oversized_json() {
    let mut json = String::from(r#"{"schema_version":1,"name":"a","version":"1","x":""#);
    // 11 MB of padding
    json.push_str(&"x".repeat(11 * 1024 * 1024));
    json.push_str("\"}");
    let err = parse_mcm_package(&json).unwrap_err();
    assert!(format!("{err}").contains("exceeds"), "got: {err}");
}

#[test]
fn parser_rejects_excessive_nesting_depth() {
    let mut json = String::new();
    for _ in 0..100 {
        json.push_str(r#"{"a":"#);
    }
    json.push('1');
    for _ in 0..100 {
        json.push('}');
    }
    let err = parse_mcm_package(&json).unwrap_err();
    assert!(format!("{err}").contains("depth"), "got: {err}");
}

// ---------------------------------------------------------------------------
// Path traversal in asset paths
// ---------------------------------------------------------------------------

#[test]
fn parser_rejects_path_traversal_in_asset() {
    for bad_path in [
        "../escape.zip",
        "a/../../etc/passwd",
        "/abs/path",
        "back\\\\slash.zip",
        "CON.txt",
        "evil\\u0000.zip",
    ] {
        let json = format!(
            r#"{{
                "schema_version": 1,
                "name": "a",
                "version": "1",
                "configs": [{{"path":"{bad_path}","source":"embedded"}}]
            }}"#
        );
        let err = parse_mcm_package(&json).unwrap_err();
        assert!(
            format!("{err}").contains("asset path"),
            "{bad_path:?} should be rejected; got: {err}"
        );
    }
}

#[test]
fn parser_accepts_nested_valid_asset_path() {
    let json = r#"{
        "schema_version": 1,
        "name": "a",
        "version": "1",
        "configs": [{"path": "config/sub/deep.toml", "source": "embedded"}]
    }"#;
    parse_mcm_package(json).expect("nested path should be accepted");
}

// ---------------------------------------------------------------------------
// Missing required fields / empty package
// ---------------------------------------------------------------------------

#[test]
fn parser_rejects_missing_required_fields() {
    for json in [
        r#"{"schema_version":1,"name":"a"}"#,
        r#"{"schema_version":1,"version":"1"}"#,
        r#"{}"#,
        r#""#,
    ] {
        assert!(parse_mcm_package(json).is_err(), "should reject: {json}");
    }
}

#[test]
fn parser_rejects_empty_package_object() {
    let err = parse_mcm_package("{}").unwrap_err();
    assert!(format!("{err}").contains("schema mismatch") || format!("{err}").contains("missing"));
}

// ---------------------------------------------------------------------------
// CLI surface: `pkg info`
// ---------------------------------------------------------------------------

#[test]
fn pkg_info_prints_summary_for_valid_file() {
    let home = TestHome::new();
    let path = home.write_mcm("valid.mcm", &valid_pkg_json());
    home.cmd()
        .args(["pkg", "info", path.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("name: my-pack"))
        .stdout(predicate::str::contains("version: 1.0.0"))
        .stdout(predicate::str::contains("game_version: 1.20.1"))
        .stdout(predicate::str::contains("loader: fabric"))
        .stdout(predicate::str::contains("mods: 1"));
}

#[test]
fn pkg_info_exits_nonzero_for_missing_file() {
    let home = TestHome::new();
    home.cmd()
        .args(["pkg", "info", "/nonexistent/evil.mcm"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("read"));
}

#[test]
fn pkg_info_exits_nonzero_for_secret_field() {
    let home = TestHome::new();
    let json = r#"{"schema_version":1,"name":"a","version":"1","password":"x"}"#;
    let path = home.write_mcm("evil.mcm", json);
    home.cmd()
        .args(["pkg", "info", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains("secret field"));
}

#[test]
fn pkg_info_exits_nonzero_for_path_traversal_asset() {
    let home = TestHome::new();
    let json = r#"{
        "schema_version": 1,
        "name": "a",
        "version": "1",
        "configs": [{"path": "../evil.zip", "source": "embedded"}]
    }"#;
    let path = home.write_mcm("evil.mcm", json);
    home.cmd()
        .args(["pkg", "info", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains("asset path"));
}

#[test]
fn pkg_info_exits_nonzero_for_unknown_schema_version() {
    let home = TestHome::new();
    let json = r#"{"schema_version":7,"name":"a","version":"1"}"#;
    let path = home.write_mcm("evil.mcm", json);
    home.cmd()
        .args(["pkg", "info", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains("unsupported schema version 7"));
}

#[test]
fn pkg_info_exits_nonzero_for_reserved_name() {
    let home = TestHome::new();
    let json = r#"{"schema_version":1,"name":"mcm","version":"1"}"#;
    let path = home.write_mcm("evil.mcm", json);
    home.cmd()
        .args(["pkg", "info", path.to_str().unwrap()])
        .assert()
        .failure()
        .stderr(predicate::str::contains("reserved"));
}

#[test]
fn pkg_info_shows_local_present_when_local_field_set() {
    let home = TestHome::new();
    let json = r#"{
        "schema_version": 1,
        "name": "a",
        "version": "1",
        "local": {"settings": {}, "history": []}
    }"#;
    let path = home.write_mcm("with-local.mcm", json);
    home.cmd()
        .args(["pkg", "info", path.to_str().unwrap()])
        .assert()
        .success()
        .stdout(predicate::str::contains("local: present"));
}

// ---------------------------------------------------------------------------
// Other pkg subcommands are implemented in task 10 (see tests/pkg_cmd.rs).
// These sanity-check that they are no longer stubbed.
// ---------------------------------------------------------------------------

#[test]
fn pkg_install_is_no_longer_stubbed() {
    let home = TestHome::new();
    home.cmd()
        .args(["pkg", "install", "nonexistent.mcm", "--yes"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("not implemented yet").not());
}

#[test]
fn pkg_list_is_no_longer_stubbed() {
    let home = TestHome::new();
    home.cmd()
        .args(["pkg", "list"])
        .assert()
        .success()
        .stdout(predicate::str::is_empty());
}
