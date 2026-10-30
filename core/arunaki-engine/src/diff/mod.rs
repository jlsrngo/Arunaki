//! Modular text & document diffing package (`engine::diff`).
//!
//! Offloads line-by-line LCS diffing and side-by-side row pairing from the WebView2
//! UI thread into native Rust with common prefix/suffix trimming.

pub mod line_diff;

use axum::{routing::post, Router};

pub fn router() -> Router {
    Router::new()
        .route("/api/desktop/line-diff", post(line_diff::handle_line_diff))
        .route("/api/diff/line", post(line_diff::handle_line_diff))
}

