use std::fs;

use anyhow::{Context, Result};

use crate::config::{Profile, Side};
use std::path::PathBuf;

impl crate::app::App {
    pub(crate) fn profile_add(
        &self,
        name: String,
        mods_dir: PathBuf,
        mc_version: String,
        loader: String,
        side: Side,
    ) -> Result<()> {
        let mut config = self.load_config()?;
        let profile = Profile {
            name: name.clone(),
            mods_dir,
            mc_version,
            loader,
            side,
        };
        fs::create_dir_all(&profile.mods_dir)?;
        config.profiles.insert(name.clone(), profile);
        config.active_profile = Some(name.clone());
        self.save_config(&config)?;
        println!("added profile {name}");
        Ok(())
    }

    pub(crate) fn profile_use(&self, name: &str) -> Result<()> {
        let mut config = self.load_config()?;
        if !config.profiles.contains_key(name) {
            anyhow::bail!("unknown profile {name}");
        }
        config.active_profile = Some(name.to_owned());
        self.save_config(&config)?;
        println!("active profile {name}");
        Ok(())
    }

    pub(crate) fn profile_list(&self) -> Result<()> {
        let config = self.load_config()?;
        for name in config.profiles.keys() {
            let marker = if config.active_profile.as_deref() == Some(name) {
                "*"
            } else {
                " "
            };
            println!("{marker} {name}");
        }
        Ok(())
    }

    pub(crate) fn profile_show(&self, name: Option<String>) -> Result<()> {
        let config = self.load_config()?;
        let profile = match name {
            Some(name) => config
                .profiles
                .get(&name)
                .cloned()
                .with_context(|| format!("unknown profile {name}"))?,
            None => self.active_profile()?,
        };
        println!("name: {}", profile.name);
        println!("mods_dir: {}", profile.mods_dir.display());
        println!("mc_version: {}", profile.mc_version);
        println!("loader: {}", profile.loader);
        println!("side: {:?}", profile.side);
        Ok(())
    }
}
