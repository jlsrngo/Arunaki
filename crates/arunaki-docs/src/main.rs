use arunaki_docs::{build_excel_map, build_pdf_map, build_ppt_map, build_word_map};
use std::env;
use std::process;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: arunaki-docs <excel|word|ppt|pdf> <filePath> [maxPages]");
        process::exit(2);
    }
    let cmd = args[1].as_str();
    let file_path = args[2].as_str();
    let max_pages = args.get(3).and_then(|s| s.parse::<usize>().ok());

    let result = match cmd {
        "excel" => build_excel_map(file_path),
        "word" => build_word_map(file_path),
        "ppt" => build_ppt_map(file_path),
        "pdf" => build_pdf_map(file_path, max_pages),
        other => Err(format!("Unsupported command: {}", other)),
    };

    match result {
        Ok(json) => {
            println!("{}", json);
        }
        Err(err) => {
            eprintln!("{}", err);
            process::exit(1);
        }
    }
}
