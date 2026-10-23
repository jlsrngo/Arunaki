pub mod catalog;
pub mod config;
pub mod local_cli;
pub mod oauth;

#[allow(unused_imports)]
pub use config::{read_arunaki_config, write_arunaki_config};

use axum::{
    routing::{delete, get, post, put},
    Router,
};

pub fn router() -> Router {
    Router::new()
        .merge(oauth::router())
        .route("/api/model", get(catalog::handle_model_list))
        .route("/model", get(catalog::handle_model_list))
        .route("/api/provider", get(catalog::handle_provider_list))
        .route("/provider", get(catalog::handle_provider_list))
        .route("/api/provider/:id", get(catalog::handle_provider_get))
        .route("/api/agent", get(catalog::handle_agent_list))
        .route("/agent", get(catalog::handle_agent_list))
        .route("/api/agent/:id", get(catalog::handle_agent_get))
        // UI Provider CRUD endpoints
        .route(
            "/api/providers",
            get(catalog::handle_ui_providers_list).post(catalog::handle_ui_providers_upsert),
        )
        .route(
            "/providers",
            get(catalog::handle_ui_providers_list).post(catalog::handle_ui_providers_upsert),
        )
        .route("/api/providers/status", get(catalog::handle_providers_status))
        .route("/api/providers/connect", post(catalog::handle_providers_connect))
        .route("/api/providers/test", post(catalog::handle_providers_test))
        .route("/providers/test", post(catalog::handle_providers_test))
        .route(
            "/api/providers/fetch-models",
            post(catalog::handle_providers_fetch_models),
        )
        .route(
            "/providers/fetch-models",
            post(catalog::handle_providers_fetch_models),
        )
        // Local-CLI endpoints
        .route(
            "/api/providers/local-cli/status",
            get(local_cli::handle_local_cli_status),
        )
        .route(
            "/providers/local-cli/status",
            get(local_cli::handle_local_cli_status),
        )
        .route(
            "/api/providers/local-cli/quotas",
            get(local_cli::handle_local_cli_quotas).post(local_cli::handle_local_cli_quota_post),
        )
        .route(
            "/api/providers/local-cli/quota",
            get(local_cli::handle_local_cli_quota_post).post(local_cli::handle_local_cli_quota_post),
        )
        .route(
            "/providers/local-cli/quota",
            get(local_cli::handle_local_cli_quota_post).post(local_cli::handle_local_cli_quota_post),
        )
        .route(
            "/api/providers/local-cli/models",
            post(local_cli::handle_local_cli_models),
        )
        .route(
            "/providers/local-cli/models",
            post(local_cli::handle_local_cli_models),
        )
        .route(
            "/api/providers/local-cli/discovered",
            get(local_cli::handle_local_cli_discovered),
        )
        .route(
            "/providers/local-cli/discovered",
            get(local_cli::handle_local_cli_discovered),
        )
        .route(
            "/api/providers/local-cli/connect",
            post(local_cli::handle_local_cli_connect),
        )
        .route(
            "/providers/local-cli/connect",
            post(local_cli::handle_local_cli_connect),
        )
        .route(
            "/api/providers/local-cli/login",
            post(local_cli::handle_local_cli_login),
        )
        .route(
            "/providers/local-cli/login",
            post(local_cli::handle_local_cli_login),
        )
        .route(
            "/api/providers/local-cli/inject",
            post(local_cli::handle_local_cli_inject),
        )
        .route(
            "/providers/local-cli/inject",
            post(local_cli::handle_local_cli_inject),
        )
        .route(
            "/api/providers/local-cli/oauth/start",
            post(local_cli::handle_local_cli_oauth_start),
        )
        .route(
            "/providers/local-cli/oauth/start",
            post(local_cli::handle_local_cli_oauth_start),
        )
        .route(
            "/api/providers/local-cli/oauth/status",
            post(local_cli::handle_local_cli_oauth_status),
        )
        .route(
            "/providers/local-cli/oauth/status",
            post(local_cli::handle_local_cli_oauth_status),
        )
        .route(
            "/api/providers/local-cli/harvest",
            post(local_cli::handle_local_cli_harvest),
        )
        .route(
            "/api/providers/local-cli/signin",
            post(local_cli::handle_local_cli_signin),
        )
        .route(
            "/api/providers/local-cli/token",
            post(local_cli::handle_local_cli_token),
        )
        .route(
            "/api/providers/local-cli/refresh",
            post(local_cli::handle_local_cli_refresh),
        )
        .route(
            "/providers/local-cli/refresh",
            post(local_cli::handle_local_cli_refresh),
        )
        .route(
            "/api/providers/local-cli/:source",
            delete(local_cli::handle_local_cli_delete),
        )
        // Wildcard provider ID routes
        .route(
            "/api/providers/:providerId",
            put(catalog::handle_ui_providers_update).delete(catalog::handle_providers_delete),
        )
        .route(
            "/providers/:providerId",
            put(catalog::handle_ui_providers_update).delete(catalog::handle_providers_delete),
        )
        .route(
            "/api/providers/:providerId/state",
            put(catalog::handle_ui_providers_state),
        )
        .route(
            "/providers/:providerId/state",
            put(catalog::handle_ui_providers_state),
        )
        .route(
            "/api/providers/:providerId/test",
            post(catalog::handle_ui_provider_id_test),
        )
        .route(
            "/providers/:providerId/test",
            post(catalog::handle_ui_provider_id_test),
        )
        .route("/config", get(config::handle_config_get))
        .route("/api/config", get(config::handle_config_get))
        .route("/project", get(config::handle_project_list))
        .route("/project/current", get(config::handle_project_current))
        .route("/path", get(config::handle_path_get))
        .route("/vcs", get(config::handle_vcs_get))
}
