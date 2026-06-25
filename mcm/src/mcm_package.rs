//! Schema-versioned types for `.mcm` packages and the boundary parser.
//!
//! Untrusted JSON is parsed once at the boundary into typed values. Raw
//! [`serde_json::Value`] is used only here for pre-parse scanning (secrets,
//! depth) and as an opaque container for `local`/`private` blobs — it never
//! enters domain logic functions.

use std::collections::BTreeMap;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

const SCHEMA_VERSION: u32 = 1;
const MAX_JSON_BYTES: usize = 10 * 1024 * 1024;
const MAX_DEPTH: usize = 64;

/// Case-insensitive substrings that mark a key as secret.
const SECRET_MARKERS: &[&str] = &["token", "secret", "password", "credential", "api_key"];

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

/// A parsed `.mcm` package. All fields are typed — no `serde_json::Value`
/// leaks into domain logic (opaque `local` container excepted).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McmPackage {
    pub schema_version: u32,
    pub name: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loader: Option<String>,
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    #[serde(default)]
    pub mods: Vec<ModEntry>,
    #[serde(default)]
    pub shaderpacks: Vec<Asset>,
    #[serde(default)]
    pub resourcepacks: Vec<Asset>,
    #[serde(default)]
    pub datapacks: Vec<Asset>,
    #[serde(default)]
    pub saves: Vec<Asset>,
    #[serde(default)]
    pub configs: Vec<Asset>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actions: Option<Vec<Action>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch: Option<LaunchRequest>,
    /// Local/private data — explicitly excluded from public export by default.
    /// Secret scan runs before typed parse, so secrets here are pre-rejected.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local: Option<LocalPrivate>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Dependency {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_requirement: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModEntry {
    pub logical_id: String,
    pub provider: String,
    pub project_id: String,
    pub file_id: String,
    pub version: String,
    pub filename: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AssetSource {
    Embedded,
    Referenced,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Asset {
    pub path: String,
    pub source: AssetSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ActionKind {
    Shell,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Action {
    pub name: String,
    pub kind: ActionKind,
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<PathBuf>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LaunchRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
}

/// Opaque local/private container. Domain logic never interprets these values.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LocalPrivate {
    #[serde(default)]
    pub settings: BTreeMap<String, serde_json::Value>,
    #[serde(default)]
    pub history: Vec<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// Boundary parser
// ---------------------------------------------------------------------------

/// Parse a `.mcm` JSON document into a typed [`McmPackage`].
///
/// Enforces: size (≤ 10 MB), nesting depth (≤ 64), secret-field rejection,
/// schema version (currently 1), package-name normalization, and asset-path
/// traversal checks. This is the single boundary — callers receive typed
/// values and never touch raw [`serde_json::Value`].
pub fn parse_mcm_package(json: &str) -> Result<McmPackage> {
    if json.len() > MAX_JSON_BYTES {
        bail!("package JSON exceeds {MAX_JSON_BYTES} bytes");
    }
    let value: serde_json::Value = serde_json::from_str(json).context("invalid package JSON")?;
    let depth = json_depth(&value);
    if depth > MAX_DEPTH {
        bail!("package JSON nesting depth {depth} exceeds {MAX_DEPTH}");
    }
    scan_for_secrets(&value)?;
    let pkg: McmPackage = serde_json::from_value(value).context("package schema mismatch")?;
    if pkg.schema_version != SCHEMA_VERSION {
        bail!("unsupported schema version {}", pkg.schema_version);
    }
    validate_package_name(&pkg.name)?;
    for asset in all_assets(&pkg) {
        validate_asset_path(&asset.path)?;
    }
    Ok(pkg)
}

fn all_assets(pkg: &McmPackage) -> impl Iterator<Item = &Asset> {
    pkg.shaderpacks
        .iter()
        .chain(&pkg.resourcepacks)
        .chain(&pkg.datapacks)
        .chain(&pkg.saves)
        .chain(&pkg.configs)
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/// Validate that a package name is in normalized form: lowercase ASCII
/// `[a-z0-9-]`, 1–64 chars, starts/ends alphanumeric, no consecutive hyphens,
/// not a reserved name.
pub fn validate_package_name(name: &str) -> Result<()> {
    if name.is_empty() || name.len() > 64 {
        bail!("package name must be 1-64 characters");
    }
    if !name
        .chars()
        .all(|c| matches!(c, 'a'..='z' | '0'..='9' | '-'))
    {
        bail!("package name must contain only [a-z0-9-]");
    }
    let first = name.chars().next();
    let last = name.chars().last();
    if !first.is_some_and(|c| c.is_ascii_alphanumeric())
        || !last.is_some_and(|c| c.is_ascii_alphanumeric())
    {
        bail!("package name must start and end with an alphanumeric character");
    }
    if name.contains("--") {
        bail!("package name must not contain consecutive hyphens");
    }
    if is_reserved_package_name(name) {
        bail!("package name {name} is reserved");
    }
    Ok(())
}

/// Reserved package names: `mcm` plus Windows reserved names.
fn is_reserved_package_name(name: &str) -> bool {
    name == "mcm" || is_windows_reserved_stem(name)
}

/// Check if a name (possibly with an extension) has a Windows-reserved stem.
fn is_windows_reserved_stem(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name);
    let upper = stem.to_ascii_uppercase();
    matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || upper
            .strip_prefix("COM")
            .and_then(|s| s.parse::<u8>().ok())
            .is_some_and(|n| (1..=9).contains(&n))
        || upper
            .strip_prefix("LPT")
            .and_then(|s| s.parse::<u8>().ok())
            .is_some_and(|n| (1..=9).contains(&n))
}

/// Validate an asset path: no empty, null bytes, `..`, absolute paths,
/// backslashes, or Windows-reserved path components.
pub fn validate_asset_path(path: &str) -> Result<()> {
    if path.is_empty() || path.contains('\0') {
        bail!("asset path must not be empty or contain null bytes");
    }
    if path.contains("..") || path.starts_with('/') || path.contains('\\') {
        bail!("asset path must not be absolute or traverse: {path}");
    }
    for component in path.split('/') {
        if is_windows_reserved_stem(component) {
            bail!("asset path component {component} is a reserved name");
        }
    }
    Ok(())
}

/// Recursively scan a JSON value for keys that look like secret fields.
fn scan_for_secrets(value: &serde_json::Value) -> Result<()> {
    match value {
        serde_json::Value::Object(map) => {
            for (key, val) in map {
                let lower = key.to_ascii_lowercase();
                if SECRET_MARKERS.iter().any(|m| lower.contains(m)) {
                    bail!("package contains secret field: {key}");
                }
                scan_for_secrets(val)?;
            }
        }
        serde_json::Value::Array(arr) => {
            for val in arr {
                scan_for_secrets(val)?;
            }
        }
        _ => {}
    }
    Ok(())
}

/// Maximum nesting depth of a JSON value (scalar = 0, object/array = 1 + max child).
fn json_depth(value: &serde_json::Value) -> usize {
    match value {
        serde_json::Value::Object(map) => map.values().map(json_depth).max().unwrap_or(0) + 1,
        serde_json::Value::Array(arr) => arr.iter().map(json_depth).max().unwrap_or(0) + 1,
        _ => 0,
    }
}
