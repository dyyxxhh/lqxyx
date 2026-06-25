use std::collections::BTreeMap;
use std::path::PathBuf;

use clap::ValueEnum;
use serde::{Deserialize, Serialize};

use crate::game_model::{GameRecord, GlobalConfig};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, ValueEnum, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Client,
    Server,
    Both,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub(crate) struct Config {
    pub(crate) active_profile: Option<String>,
    #[serde(default)]
    pub(crate) profiles: BTreeMap<String, Profile>,
    // New game model (coexists with legacy profiles). All fields default so
    // old config.toml files without these keys deserialize cleanly.
    #[serde(default)]
    pub(crate) games: BTreeMap<String, GameRecord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) default_game: Option<String>,
    #[serde(default)]
    pub(crate) global: GlobalConfig,
    // Manually imported custom sources (URL → record). Fresh config starts
    // empty — no author source is preinstalled. Defaulted so old config.toml
    // files without this key deserialize cleanly.
    #[serde(default)]
    pub(crate) sources: BTreeMap<String, SourceRecord>,
}

/// A manually imported custom source. Importing makes it trusted; actionable
/// operations on sources still require confirmation via the centralized policy.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct SourceRecord {
    pub(crate) url: String,
    /// ISO-8601 UTC timestamp of when the source was added.
    pub(crate) added_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct Profile {
    pub(crate) name: String,
    pub(crate) mods_dir: PathBuf,
    pub(crate) mc_version: String,
    pub(crate) loader: String,
    pub(crate) side: Side,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ProfileSnapshot {
    pub(crate) mc_version: String,
    pub(crate) loader: String,
    pub(crate) side: Side,
}
