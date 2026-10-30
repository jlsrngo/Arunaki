//! Network probes owned by the engine instead of the WebView.
//!
//! The UI used to probe local ports with `fetch()`, which is slow, serial and fills the
//! WebView console with `ERR_CONNECTION_REFUSED`. TCP probing belongs in the engine.

pub mod pos;
pub mod port_scanner;

use axum::{routing::post, Router};

pub fn router() -> Router {
    Router::new()
        .route("/api/desktop/pos-detect", post(pos::handle_pos_detect).get(pos::handle_pos_detect))
        .route("/api/desktop/pos-test", post(pos::handle_pos_test))
}

