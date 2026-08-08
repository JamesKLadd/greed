//! Tauri desktop shell for Greed.
//!
//! The Steam integration is compiled in ONLY under the `steam` cargo feature
//! (`cargo build --features steam` / `tauri build -- --features steam`). With the
//! feature off — the default — `steam_unlock_achievement` is a no-op stub, the
//! `steamworks` crate is not a dependency, and no Steamworks SDK or App ID is
//! needed. This keeps the standard `tauri:build` green. See steam/README.md.

/// Steam runtime, present only under the `steam` feature.
#[cfg(feature = "steam")]
mod steam {
    use std::sync::OnceLock;
    use std::time::Duration;

    // The Client handle is cheap to clone and Send; the SingleClient (which pumps
    // callbacks) is not Send, so it stays on the dedicated thread that created it.
    static CLIENT: OnceLock<steamworks::Client> = OnceLock::new();

    /// Initialise Steam on a dedicated thread and keep pumping its callbacks.
    /// Reads the App ID from `steam_appid.txt` (dev) or the launching Steam client.
    pub fn init() {
        std::thread::spawn(|| match steamworks::Client::init() {
            Ok((client, single)) => {
                client.user_stats().request_current_stats();
                let _ = CLIENT.set(client);
                loop {
                    single.run_callbacks();
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
            Err(e) => log::warn!("Steam init failed (achievements disabled): {e:?}"),
        });
    }

    /// Set + persist one achievement by its Steamworks API name.
    pub fn unlock(api_name: &str) -> Result<(), String> {
        let client = CLIENT.get().ok_or("Steam not initialised")?;
        let stats = client.user_stats();
        stats
            .achievement(api_name)
            .set()
            .map_err(|e| format!("{e:?}"))?;
        stats.store_stats().map_err(|e| format!("{e:?}"))?;
        Ok(())
    }
}

/// Unlock a Steam achievement by API name. No-op unless built with `--features steam`.
#[tauri::command]
fn steam_unlock_achievement(achievement: String) -> Result<(), String> {
    #[cfg(feature = "steam")]
    {
        steam::unlock(&achievement)
    }
    #[cfg(not(feature = "steam"))]
    {
        // Feature disabled: local progression already recorded; nothing to mirror.
        log::debug!("steam_unlock_achievement({achievement}) ignored (steam feature off)");
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            #[cfg(feature = "steam")]
            steam::init();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![steam_unlock_achievement])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
