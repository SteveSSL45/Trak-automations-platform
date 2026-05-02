use crate::oauth::{record_id, LoopbackServer, Provider, StoredTokens};
use oauth2::basic::BasicClient;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl, RefreshToken,
    Scope, TokenUrl, TokenResponse,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Deserialize)]
struct GoogleOAuthClientFile {
    installed: GoogleInstalledClient,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GoogleInstalledClient {
    pub client_id: String,
    pub client_secret: String,
}

/// Read the operator's GCP OAuth client credentials from
/// `<app_data_dir>/google_oauth_client.json`. The file is the raw download
/// from Google Cloud Console — operator places it there once.
#[tauri::command]
pub fn read_oauth_client(app: AppHandle) -> Result<GoogleInstalledClient, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let path = dir.join("google_oauth_client.json");
    if !path.exists() {
        return Err(format!(
            "missing {}; place the GCP OAuth client JSON there",
            path.display()
        ));
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("read {path:?}: {e}"))?;
    let parsed: GoogleOAuthClientFile =
        serde_json::from_str(&raw).map_err(|e| format!("parse: {e}"))?;
    Ok(parsed.installed)
}

/// Write a Python-readable credentials JSON to
/// `<app_data_dir>/clients/<client-id>/credentials_<provider>.json`.
/// Used by Phase 4 ingest workers to bootstrap OAuth without touching
/// Stronghold. Combines the operator's GCP client_id/client_secret with
/// the per-client refresh_token.
#[tauri::command]
pub fn write_credentials_for_python(
    app: AppHandle,
    target_client_id: String,
    provider: Provider,
    stored_blob: String,
) -> Result<String, String> {
    let installed = read_oauth_client(app.clone())?;
    let tokens: StoredTokens =
        serde_json::from_str(&stored_blob).map_err(|e| format!("parse blob: {e}"))?;

    let payload = serde_json::json!({
        "client_id": installed.client_id,
        "client_secret": installed.client_secret,
        "refresh_token": tokens.refresh_token,
        "scopes": tokens.scopes,
    });

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("clients")
        .join(&target_client_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    let path = dir.join(format!("credentials_{}.json", provider.key()));
    std::fs::write(&path, serde_json::to_string_pretty(&payload).unwrap())
        .map_err(|e| format!("write: {e}"))?;
    Ok(path.display().to_string())
}

#[derive(Debug, Serialize)]
pub struct OAuthConnectResult {
    pub email: String,
    pub scopes_granted: Vec<String>,
    pub record_key: String,
}

#[derive(Debug, Deserialize)]
struct UserInfo {
    email: String,
}

/// Run the full OAuth flow for one client + provider.
#[tauri::command]
pub async fn oauth_connect(
    app: AppHandle,
    target_client_id: String,
    provider: Provider,
    oauth_client_id: String,
    oauth_client_secret: String,
) -> Result<OAuthConnectResult, String> {
    let cfg = provider.config();

    let csrf = CsrfToken::new_random();
    let csrf_secret = csrf.secret().clone();
    let server =
        LoopbackServer::start(csrf_secret.clone()).map_err(|e| format!("loopback start: {e}"))?;
    let port = server.port;
    let redirect = format!("http://127.0.0.1:{port}");

    let mut scopes: Vec<&str> = cfg.scopes.to_vec();
    scopes.push("https://www.googleapis.com/auth/userinfo.email");
    scopes.push("openid");

    let oauth_client = BasicClient::new(ClientId::new(oauth_client_id))
        .set_client_secret(ClientSecret::new(oauth_client_secret))
        .set_auth_uri(AuthUrl::new(cfg.auth_url.into()).map_err(|e| format!("auth url: {e}"))?)
        .set_token_uri(
            TokenUrl::new(cfg.token_url.into()).map_err(|e| format!("token url: {e}"))?,
        )
        .set_redirect_uri(
            RedirectUrl::new(redirect.clone()).map_err(|e| format!("redirect url: {e}"))?,
        );

    let http_client = oauth2::reqwest::ClientBuilder::new()
        .redirect(oauth2::reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    let mut auth_url_builder = oauth_client.authorize_url(|| csrf.clone());
    for s in &scopes {
        auth_url_builder = auth_url_builder.add_scope(Scope::new((*s).into()));
    }
    let (auth_url, _csrf) = auth_url_builder
        .add_extra_param("access_type", "offline")
        .add_extra_param("prompt", "consent")
        .url();

    if let Err(e) = open::that(auth_url.to_string()) {
        return Err(format!("open browser: {e}"));
    }

    let cb = server
        .wait_for_callback(Duration::from_secs(300))
        .ok_or_else(|| "OAuth callback timed out (5 min)".to_string())?;

    let token_result = oauth_client
        .exchange_code(AuthorizationCode::new(cb.code))
        .request_async(&http_client)
        .await
        .map_err(|e| format!("token exchange: {e}"))?;

    let access = token_result.access_token().secret().clone();
    let refresh = token_result
        .refresh_token()
        .ok_or_else(|| {
            "no refresh_token in response (Google omits it on re-grant unless prompt=consent — check OAuth client config)".to_string()
        })?
        .secret()
        .clone();
    let expires_in = token_result
        .expires_in()
        .map(|d| d.as_secs() as i64)
        .unwrap_or(3600);
    let expires_at = chrono::Utc::now().timestamp() + expires_in;
    let scopes_granted: Vec<String> = token_result
        .scopes()
        .map(|v| v.iter().map(|s| s.to_string()).collect())
        .unwrap_or_default();

    let userinfo_text = http_client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(&access)
        .send()
        .await
        .map_err(|e| format!("userinfo fetch: {e}"))?
        .text()
        .await
        .map_err(|e| format!("userinfo body: {e}"))?;
    let userinfo: UserInfo = serde_json::from_str(&userinfo_text)
        .map_err(|e| format!("userinfo parse: {e} (body: {userinfo_text})"))?;

    let stored = StoredTokens {
        access_token: access,
        refresh_token: refresh,
        expires_at_unix: expires_at,
        scopes: scopes_granted.clone(),
        email: userinfo.email.clone(),
    };

    let key = record_id(&target_client_id, provider);
    let blob = serde_json::to_string(&stored).map_err(|e| format!("serialize: {e}"))?;

    // JS side listens for this event and writes the blob into the open
    // Stronghold snapshot. See `state/stronghold-session.ts` (Phase 3 C.1).
    app.emit(
        "oauth:store-token",
        serde_json::json!({ "key": key.clone(), "blob": blob }),
    )
    .map_err(|e| format!("emit: {e}"))?;

    Ok(OAuthConnectResult {
        email: userinfo.email,
        scopes_granted,
        record_key: key,
    })
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OAuthProbeResult {
    Connected {
        email: String,
        expires_at_unix: i64,
        refreshed: bool,
    },
    NeedsReauth {
        reason: String,
    },
    Error {
        reason: String,
    },
}

/// Validate stored tokens by hitting the provider's probe URL.
/// On 401 (or near-expiry) attempts a refresh-token grant and retries once.
/// On refresh success, emits `oauth:store-token` with the updated blob so JS
/// can persist the rotated tokens.
#[tauri::command]
pub async fn oauth_probe(
    app: AppHandle,
    target_client_id: String,
    provider: Provider,
    stored_blob: String,
    oauth_client_id: String,
    oauth_client_secret: String,
) -> Result<OAuthProbeResult, String> {
    let cfg = provider.config();
    let mut tokens: StoredTokens =
        serde_json::from_str(&stored_blob).map_err(|e| format!("blob parse: {e}"))?;

    let http_client = oauth2::reqwest::ClientBuilder::new()
        .redirect(oauth2::reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    // First probe with current access token
    let mut status = probe_status(&http_client, cfg.probe_url, &tokens.access_token).await;
    let mut refreshed = false;

    if status == Some(401) {
        // Try refresh
        let oauth_client = BasicClient::new(ClientId::new(oauth_client_id.clone()))
            .set_client_secret(ClientSecret::new(oauth_client_secret.clone()))
            .set_auth_uri(AuthUrl::new(cfg.auth_url.into()).map_err(|e| format!("auth url: {e}"))?)
            .set_token_uri(
                TokenUrl::new(cfg.token_url.into()).map_err(|e| format!("token url: {e}"))?,
            );

        let refresh_result = oauth_client
            .exchange_refresh_token(&RefreshToken::new(tokens.refresh_token.clone()))
            .request_async(&http_client)
            .await;

        match refresh_result {
            Ok(new_tokens) => {
                tokens.access_token = new_tokens.access_token().secret().clone();
                if let Some(rt) = new_tokens.refresh_token() {
                    tokens.refresh_token = rt.secret().clone();
                }
                let expires_in = new_tokens
                    .expires_in()
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(3600);
                tokens.expires_at_unix = chrono::Utc::now().timestamp() + expires_in;

                let key = record_id(&target_client_id, provider);
                let blob = serde_json::to_string(&tokens).map_err(|e| format!("serialize: {e}"))?;
                app.emit(
                    "oauth:store-token",
                    serde_json::json!({ "key": key, "blob": blob }),
                )
                .map_err(|e| format!("emit: {e}"))?;
                refreshed = true;
                // Re-probe with the new token
                status = probe_status(&http_client, cfg.probe_url, &tokens.access_token).await;
            }
            Err(e) => {
                return Ok(OAuthProbeResult::NeedsReauth {
                    reason: format!("refresh rejected: {e}"),
                });
            }
        }
    }

    match status {
        Some(s) if (200..300).contains(&s) => Ok(OAuthProbeResult::Connected {
            email: tokens.email,
            expires_at_unix: tokens.expires_at_unix,
            refreshed,
        }),
        Some(401) => Ok(OAuthProbeResult::NeedsReauth {
            reason: "401 after refresh attempt".into(),
        }),
        Some(s) => Ok(OAuthProbeResult::Error {
            reason: format!("probe HTTP {s}"),
        }),
        None => Ok(OAuthProbeResult::Error {
            reason: "probe network error".into(),
        }),
    }
}

async fn probe_status(
    client: &oauth2::reqwest::Client,
    url: &str,
    access_token: &str,
) -> Option<u16> {
    client
        .get(url)
        .bearer_auth(access_token)
        .send()
        .await
        .ok()
        .map(|r| r.status().as_u16())
}
