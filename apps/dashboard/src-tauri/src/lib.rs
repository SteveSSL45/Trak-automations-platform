mod oauth;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn derive_stronghold_key(password: &[u8]) -> Vec<u8> {
    use argon2::{Algorithm, Argon2, Params, Version};
    // Phase 3 uses a static salt. Acceptable here because Stronghold itself
    // applies the derived key only to its own snapshot — no offline cracking
    // surface beyond losing the laptop. Phase 7+ should rotate to a random
    // salt stored alongside the snapshot.
    let salt = b"trak-automations-stronghold-salt";
    let params = Params::new(10_000, 10, 4, Some(32)).expect("argon2 params");
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut output = vec![0u8; 32];
    argon2
        .hash_password_into(password, salt, &mut output)
        .expect("argon2 hash failed");
    output
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| derive_stronghold_key(password.as_bytes()))
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
