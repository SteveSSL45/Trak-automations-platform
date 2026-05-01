use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Gsc,
    Ga4,
}

pub struct ProviderConfig {
    pub auth_url: &'static str,
    pub token_url: &'static str,
    pub scopes: &'static [&'static str],
    /// API endpoint to probe for "are these tokens still valid"
    pub probe_url: &'static str,
}

impl Provider {
    pub fn config(&self) -> ProviderConfig {
        match self {
            Provider::Gsc => ProviderConfig {
                auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
                token_url: "https://oauth2.googleapis.com/token",
                scopes: &["https://www.googleapis.com/auth/webmasters.readonly"],
                probe_url: "https://searchconsole.googleapis.com/v1/sites",
            },
            Provider::Ga4 => ProviderConfig {
                auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
                token_url: "https://oauth2.googleapis.com/token",
                scopes: &["https://www.googleapis.com/auth/analytics.readonly"],
                probe_url: "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
            },
        }
    }

    pub fn key(&self) -> &'static str {
        match self {
            Provider::Gsc => "gsc",
            Provider::Ga4 => "ga4",
        }
    }
}
