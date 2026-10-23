pub mod graph;
pub mod store;
pub mod sync;

pub use store::get_active_knowledge_for_workspace;

use axum::{
    routing::{delete, get, patch, post},
    Router,
};

pub fn router() -> Router {
    Router::new()
        .route("/api/knowledge", get(graph::handle_list).post(graph::handle_create))
        .route("/api/knowledge/upload", post(sync::handle_upload))
        .route("/api/knowledge/sync", post(sync::handle_sync))
        .route(
            "/api/knowledge/edges",
            get(graph::handle_list_edges).post(graph::handle_create_edge),
        )
        .route("/api/knowledge/edges/:id", delete(graph::handle_delete_edge))
        .route("/api/knowledge/:id/position", patch(graph::handle_update_pos))
        .route("/api/knowledge/:id/toggle", patch(graph::handle_toggle))
        .route(
            "/api/knowledge/:id",
            get(graph::handle_get).patch(graph::handle_update).delete(graph::handle_delete_node),
        )
}
