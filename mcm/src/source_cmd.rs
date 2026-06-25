//! `source` command group implementations on [`App`].
//!
//! Manages manually imported custom sources. Importing a source makes it
//! trusted; the actionable `add` operation still requires confirmation via
//! the centralized policy (`require_confirmation(OperationKind::SourceAction)`).
//! Fresh config has zero custom sources — no author source is preinstalled.

use anyhow::{bail, Context, Result};
use time::OffsetDateTime;

use crate::app::App;
use crate::cli::SourceCommand;
use crate::config::SourceRecord;
use crate::confirmation::{require_confirmation, OperationKind};

impl App {
    pub(crate) fn source(&self, command: SourceCommand) -> Result<()> {
        match command {
            SourceCommand::Add { url, yes } => self.source_add(&url, yes),
            SourceCommand::Remove { url } => self.source_remove(&url),
            SourceCommand::Info { url } => self.source_info(&url),
            SourceCommand::List => self.source_list(),
        }
    }

    fn source_add(&self, url: &str, yes: bool) -> Result<()> {
        require_confirmation(OperationKind::SourceAction, yes)?;
        let mut config = self.load_config()?;
        if config.sources.contains_key(url) {
            bail!("source {url} is already imported");
        }
        let record = SourceRecord {
            url: url.to_owned(),
            added_at: OffsetDateTime::now_utc().to_string(),
        };
        config.sources.insert(url.to_owned(), record);
        self.save_config(&config)?;
        println!("added source {url}");
        Ok(())
    }

    fn source_remove(&self, url: &str) -> Result<()> {
        let mut config = self.load_config()?;
        config
            .sources
            .remove(url)
            .with_context(|| format!("unknown source {url}"))?;
        self.save_config(&config)?;
        println!("removed source {url}");
        Ok(())
    }

    fn source_info(&self, url: &str) -> Result<()> {
        let config = self.load_config()?;
        let record = config
            .sources
            .get(url)
            .with_context(|| format!("unknown source {url}"))?;
        println!("url: {}", record.url);
        println!("status: trusted (manual import)");
        println!("added_at: {}", record.added_at);
        Ok(())
    }

    fn source_list(&self) -> Result<()> {
        let config = self.load_config()?;
        for url in config.sources.keys() {
            println!("{url}");
        }
        Ok(())
    }
}
