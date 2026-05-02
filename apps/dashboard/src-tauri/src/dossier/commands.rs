use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct DecisionFile {
    pub client_id: String,
    pub date: String,
    pub decided_at_unix: i64,
    pub decisions: Vec<Decision>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Decision {
    pub deliverable_id: String,
    pub action: String, // "approve" | "edit" | "reject"
    pub edited_to: Option<String>,
    pub reason: Option<String>,
}

fn client_dir(app: &AppHandle, client_id: &str) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("clients")
        .join(client_id))
}

#[tauri::command]
pub fn read_dossier(
    app: AppHandle,
    client_id: String,
    date: String,
) -> Result<Option<Value>, String> {
    let path = client_dir(&app, &client_id)?
        .join("dossiers")
        .join(format!("{date}.json"));
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("read {path:?}: {e}"))?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| format!("parse: {e}"))?;
    Ok(Some(value))
}

#[tauri::command]
pub fn read_action_plan(
    app: AppHandle,
    client_id: String,
    date: String,
) -> Result<Option<Value>, String> {
    // Real source (Phase 5+): clients/<id>/swarm_runs/<date>/08_executor.json
    let path = client_dir(&app, &client_id)?
        .join("swarm_runs")
        .join(&date)
        .join("08_executor.json");
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("read {path:?}: {e}"))?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| format!("parse: {e}"))?;
    Ok(Some(value))
}

#[tauri::command]
pub fn read_decisions(
    app: AppHandle,
    client_id: String,
    date: String,
) -> Result<Option<DecisionFile>, String> {
    let path = client_dir(&app, &client_id)?
        .join("approved")
        .join(format!("{date}.json"));
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("read {path:?}: {e}"))?;
    let parsed: DecisionFile = serde_json::from_str(&raw).map_err(|e| format!("parse: {e}"))?;
    Ok(Some(parsed))
}

#[tauri::command]
pub fn write_decisions(
    app: AppHandle,
    client_id: String,
    date: String,
    decisions: Vec<Decision>,
) -> Result<String, String> {
    let dir = client_dir(&app, &client_id)?.join("approved");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    let path = dir.join(format!("{date}.json"));

    let file = DecisionFile {
        client_id,
        date,
        decided_at_unix: chrono::Utc::now().timestamp(),
        decisions,
    };
    let raw = serde_json::to_string_pretty(&file).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&path, raw).map_err(|e| format!("write: {e}"))?;
    Ok(path.display().to_string())
}
