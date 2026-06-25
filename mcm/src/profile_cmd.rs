use std::fs;

use anyhow::{bail, Context, Result};

use crate::cli::ProfileCommand;
use crate::config::Profile;

impl crate::app::App {
    pub(crate) fn profile(&self, command: ProfileCommand) -> Result<()> {
        let mut config = self.load_config()?;
        match command {
            ProfileCommand::Add {
                name,
                mods_dir,
                mc_version,
                loader,
                side,
            } => {
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
            }
            ProfileCommand::Use { name } => {
                if !config.profiles.contains_key(&name) {
                    bail!("unknown profile {name}");
                }
                config.active_profile = Some(name.clone());
                self.save_config(&config)?;
                println!("active profile {name}");
            }
            ProfileCommand::List => {
                for name in config.profiles.keys() {
                    let marker = if config.active_profile.as_deref() == Some(name) {
                        "*"
                    } else {
                        " "
                    };
                    println!("{marker} {name}");
                }
            }
            ProfileCommand::Show { name } => {
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
            }
        }
        Ok(())
    }
}
