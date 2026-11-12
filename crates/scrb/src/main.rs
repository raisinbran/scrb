use std::process::ExitCode;

fn main() -> ExitCode {
    scrb::cli::run(std::env::args_os())
}
