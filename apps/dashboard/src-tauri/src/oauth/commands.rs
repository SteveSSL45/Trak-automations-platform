use crate::oauth::{record_id, LoopbackServer, Provider, StoredTokens};
use oauth2::basic::BasicClient;
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl, Scope, TokenUrl,
    TokenResponse,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

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
