use std::collections::BTreeMap;
use std::path::PathBuf;

use clap::ValueEnum;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, ValueEnum, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Client,
    Server,
    Both,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct Config {
    pub(crate) active_profile: Option<String>,
    pub(crate) profiles: BTreeMap<String, Profile>,
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
