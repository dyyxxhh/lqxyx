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
        // If the URL is HTTP(S), attempt to fetch and parse the live index
        // to display capabilities + package count. On any fetch/parse
        // failure, fall back to the stored record (already printed above)
        // and emit a note — config is never mutated by `source info`.
        if url.starts_with("http") {
            match fetch_index_for_info(url) {
                Ok(index) => {
                    println!("source_id: {}", index.source_id);
                    if !index.capabilities.is_empty() {
                        println!("capabilities: {}", index.capabilities.join(", "));
                    }
                    println!("packages: {}", index.packages.len());
                    if let Some(actions) = &index.actions {
                        println!("actions: {} (declared, not auto-executed)", actions.len());
                    }
                }
                Err(error) => {
                    println!("index: unavailable ({error})");
                }
            }
        }
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

/// Fetch and parse a source index for display in `source info`.
///
/// Uses a fresh blocking reqwest client (no redirect following) so a
/// malformed remote cannot silently redirect to a different host. Errors
/// are surfaced to the caller as a string so `source info` can print a
/// note without crashing.
fn fetch_index_for_info(url: &str) -> Result<crate::source_index::SourceIndex> {
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .context("build HTTP client")?;
    let body = client
        .get(url)
        .header("User-Agent", "mcm/0.1.0 (Minecraft mod manager)")
        .send()
        .with_context(|| format!("fetch source index {url}"))?
        .error_for_status()
        .with_context(|| format!("source index {url} returned error status"))?
        .text()
        .context("read source index body")?;
    crate::source_index::parse_source_index(&body)
}
