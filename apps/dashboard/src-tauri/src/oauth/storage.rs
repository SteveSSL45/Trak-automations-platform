use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at_unix: i64,
    pub scopes: Vec<String>,
    pub email: String,
}

pub fn record_id(client_id: &str, provider: super::Provider) -> String {
    format!("{client_id}::{}", provider.key())
}
