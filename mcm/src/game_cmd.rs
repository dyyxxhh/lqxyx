//! `game` command group implementations on [`App`].
//!
//! `game install` remains a stub (task 20). All other subcommands are wired
//! to real implementations operating on the new game model in
//! [`crate::game_model`]. `game remove` only removes the game record from
//! config — it never touches on-disk instance files (full safety policy is
//! task 7; here we only require `--yes`).

use anyhow::{bail, Context, Result};

use crate::app::App;
use crate::cli::GameCommand;

impl App {
    pub(crate) fn game(&self, command: GameCommand) -> Result<()> {
        match command {
            GameCommand::Default { name } => self.game_default(name),
            GameCommand::Install { target, .. } => {
                // Validate the smart target grammar even though install is stubbed.
                crate::mc_target::parse_mc_target(&target).map_err(anyhow::Error::msg)?;
                Self::not_implemented("game install")
            }
            GameCommand::Remove { name, yes } => self.game_remove(&name, yes),
            GameCommand::Info { name } => self.game_info(&name),
            GameCommand::Rename { old, new } => self.game_rename(&old, &new),
            GameCommand::Config { name } => self.game_config_show(&name),
            GameCommand::List => self.game_list(),
        }
    }

    fn game_default(&self, name: Option<String>) -> Result<()> {
        let mut config = self.load_config()?;
        match name {
            None => match &config.default_game {
                Some(g) => println!("{g}"),
                None => println!("no default game"),
            },
            Some(g) => {
                if !config.games.contains_key(&g) {
                    bail!("unknown game {g}");
                }
                config.default_game = Some(g.clone());
                self.save_config(&config)?;
                println!("default game {g}");
            }
        }
        Ok(())
    }

    fn game_list(&self) -> Result<()> {
        let config = self.load_config()?;
        for name in config.games.keys() {
            let marker = if config.default_game.as_deref() == Some(name.as_str()) {
                "*"
            } else {
                " "
            };
            println!("{marker} {name}");
        }
        Ok(())
    }

    fn game_info(&self, name: &str) -> Result<()> {
        let config = self.load_config()?;
        let game = config
            .games
            .get(name)
            .with_context(|| format!("unknown game {name}"))?;
        println!("name: {}", game.name);
        println!("root_dir: {}", game.root_dir.display());
        println!(
            "mc_version: {}",
            game.mc_version.as_deref().unwrap_or("(unset)")
        );
        println!("loader: {}", game.loader.as_deref().unwrap_or("(unset)"));
        let vc = &game.version_config;
        println!(
            "java_path: {}",
            vc.java_path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "(unset)".into())
        );
        println!("jvm_args: {}", vc.jvm_args.as_deref().unwrap_or("(unset)"));
        println!(
            "extra_args: {}",
            vc.extra_args.as_deref().unwrap_or("(unset)")
        );
        if vc.env.is_empty() {
            println!("env: (none)");
        } else {
            for (k, v) in &vc.env {
                println!("env: {k}={v}");
            }
        }
        Ok(())
    }

    fn game_rename(&self, old: &str, new: &str) -> Result<()> {
        let mut config = self.load_config()?;
        if !config.games.contains_key(old) {
            bail!("unknown game {old}");
        }
        if config.games.contains_key(new) {
            bail!("game {new} already exists");
        }
        let mut game = config
            .games
            .remove(old)
            .context("game removed mid-rename")?;
        game.name = new.to_owned();
        config.games.insert(new.to_owned(), game);
        if config.default_game.as_deref() == Some(old) {
            config.default_game = Some(new.to_owned());
        }
        self.save_config(&config)?;
        println!("renamed game {old} -> {new}");
        Ok(())
    }

    /// `game config <name>`: show version-scoped config fields.
    /// (Setting fields requires a CLI flag that task 4 did not define; the
    /// set/show interface is read-only for now.)
    fn game_config_show(&self, name: &str) -> Result<()> {
        let config = self.load_config()?;
        let game = config
            .games
            .get(name)
            .with_context(|| format!("unknown game {name}"))?;
        let vc = &game.version_config;
        println!("game: {}", game.name);
        println!(
            "java_path: {}",
            vc.java_path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "(unset)".into())
        );
        println!("jvm_args: {}", vc.jvm_args.as_deref().unwrap_or("(unset)"));
        println!(
            "extra_args: {}",
            vc.extra_args.as_deref().unwrap_or("(unset)")
        );
        if vc.env.is_empty() {
            println!("env: (none)");
        } else {
            for (k, v) in &vc.env {
                println!("env: {k}={v}");
            }
        }
        Ok(())
    }

    /// `game remove <name>`: remove only the game record from config.
    /// Requires `--yes`. Never touches on-disk files. Prints what was removed.
    fn game_remove(&self, name: &str, yes: bool) -> Result<()> {
        if !yes {
            bail!("confirmation required; pass --yes to remove game {name}");
        }
        let mut config = self.load_config()?;
        let game = config
            .games
            .remove(name)
            .with_context(|| format!("unknown game {name}"))?;
        let was_default = config.default_game.as_deref() == Some(name);
        if was_default {
            config.default_game = None;
        }
        self.save_config(&config)?;
        println!("removed game record: {}", game.name);
        println!("root_dir (left on disk): {}", game.root_dir.display());
        if was_default {
            println!("default game cleared");
        }
        Ok(())
    }
}
