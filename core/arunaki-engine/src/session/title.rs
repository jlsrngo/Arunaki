//! Session Title Generation & Normalization — mirrors OpenCode `packages/core/src/session/title.ts`.
//!
//! Cleans markdown syntax, emoji, and generates concise, descriptive session titles.

pub fn is_emoji_char(c: char) -> bool {
    ('\u{1F300}'..='\u{1FAFF}').contains(&c)
        || ('\u{2600}'..='\u{27BF}').contains(&c)
        || ('\u{1F600}'..='\u{1F64F}').contains(&c)
        || ('\u{1F680}'..='\u{1F6FF}').contains(&c)
}

pub fn derive_session_title(prompt: &str) -> String {
    let first_line = prompt
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .unwrap_or(prompt.trim());

    let no_emoji: String = first_line.chars().filter(|&c| !is_emoji_char(c)).collect();
    let cleaned = no_emoji
        .trim_start_matches(|c: char| {
            c == '#' || c == '*' || c == '-' || c == '>' || c == '`' || c == '@' || c.is_whitespace()
        })
        .trim();

    if cleaned.is_empty() {
        return "New Session".to_string();
    }

    if cleaned.chars().count() > 40 {
        let mut truncated = String::new();
        for ch in cleaned.chars() {
            if truncated.chars().count() >= 37 {
                break;
            }
            truncated.push(ch);
        }
        format!("{}...", truncated.trim())
    } else {
        cleaned.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_session_title() {
        assert_eq!(
            derive_session_title("✨ Rekap laporan keuangan bulan Oktober"),
            "Rekap laporan keuangan bulan Oktober"
        );
        assert_eq!(
            derive_session_title("### Analisis Cash Flow Q3 2026"),
            "Analisis Cash Flow Q3 2026"
        );
        assert_eq!(
            derive_session_title("Tolong periksa semua transaksi invoice yang belum lunas dalam folder"),
            "Tolong periksa semua transaksi invoic..."
        );
        assert_eq!(derive_session_title("   "), "New Session");
    }
}

