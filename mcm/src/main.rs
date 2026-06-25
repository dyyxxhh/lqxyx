use clap::Parser;

fn main() {
    if let Err(error) = mcm::run(mcm::Cli::parse()) {
        eprintln!("Error: {error}");
        std::process::exit(1);
    }
}
