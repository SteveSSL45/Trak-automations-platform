use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Client {
    pub id: String,
    pub name: String,
    pub domain: String,
    pub industry: String,
    pub icon_name: String,
    /// GSC property URL — e.g. "sc-domain:example.com" or "https://example.com/"
    /// Filled in after the operator runs the OAuth grant; nullable until then.
    #[serde(default)]
    pub gsc_site: Option<String>,
    /// GA4 property ID (numeric, like "123456789").
    #[serde(default)]
    pub ga4_property_id: Option<String>,
    pub created_at_unix: i64,
}

const SEED_CLIENTS_JSON: &str = r#"[
  {
    "id": "lawn-care-co",
    "name": "Lawn Care Co.",
    "domain": "lawncare-pilot.com",
    "industry": "Lawn care + landscaping (Genesee County)",
    "icon_name": "Trees",
    "gsc_site": null,
    "ga4_property_id": null,
    "created_at_unix": 0
  },
  {
    "id": "home-improvement-co",
    "name": "Home Improvement Co.",
    "domain": "homeimprovement-pilot.com",
    "industry": "Home remodeling + handyman (Genesee County)",
    "icon_name": "Hammer",
    "gsc_site": null,
    "ga4_property_id": null,
    "created_at_unix": 0
  },
  {
    "id": "trak-automations",
    "name": "Trak Automations",
    "domain": "trakautomations.com",
    "industry": "AI/automation agency (eat-your-own-dog-food)",
    "icon_name": "Cpu",
    "gsc_site": "sc-domain:trakautomations.com",
    "ga4_property_id": "535548482",
    "created_at_unix": 0
  }
]"#;

fn clients_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("clients.json"))
}

fn read_or_seed(app: &AppHandle) -> Result<Vec<Client>, String> {
    let path = clients_path(app)?;
    if !path.exists() {
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| format!("mkdir: {e}"))?;
        std::fs::write(&path, SEED_CLIENTS_JSON).map_err(|e| format!("seed write: {e}"))?;
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("read {path:?}: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse: {e}"))
}

fn write_clients(app: &AppHandle, clients: &[Client]) -> Result<(), String> {
    let path = clients_path(app)?;
    let raw = serde_json::to_string_pretty(clients).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&path, raw).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn read_clients(app: AppHandle) -> Result<Vec<Client>, String> {
    read_or_seed(&app)
}

#[tauri::command]
pub fn add_client(app: AppHandle, client: Client) -> Result<Vec<Client>, String> {
    let mut clients = read_or_seed(&app)?;
    if clients.iter().any(|c| c.id == client.id) {
        return Err(format!("client id '{}' already exists", client.id));
    }
    clients.push(client);
    write_clients(&app, &clients)?;
    Ok(clients)
}

#[tauri::command]
pub fn update_client(app: AppHandle, id: String, patch: Value) -> Result<Vec<Client>, String> {
    let mut clients = read_or_seed(&app)?;
    let target = clients
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or_else(|| format!("client id '{id}' not found"))?;
    // Merge: serialize target → object → splat patch fields → deserialize back.
    let mut current = serde_json::to_value(&target).map_err(|e| format!("serialize: {e}"))?;
    if let (Value::Object(current_map), Value::Object(patch_map)) = (&mut current, patch) {
        for (k, v) in patch_map {
            current_map.insert(k, v);
        }
    } else {
        return Err("patch must be a JSON object".into());
    }
    *target = serde_json::from_value(current).map_err(|e| format!("merge: {e}"))?;
    write_clients(&app, &clients)?;
    Ok(clients)
}
