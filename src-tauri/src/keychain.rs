//! macOS Keychain storage for LLM provider API keys. The rest of `llm_settings` (selected
//! provider, per-provider model override) stays in SQLite — only the secret lives here.
//! See issue #16.

/// Keychain service name — the Tauri app identifier.
const SERVICE: &str = "com.nagarestudio.automono";

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, provider).map_err(|e| e.to_string())
}

/// Keys saved before the identifier rename live under the old service name; `get` moves them
/// across the first time they're read.
fn legacy_entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(crate::legacy_data::LEGACY_IDENTIFIER, provider).map_err(|e| e.to_string())
}

/// The stored key for `provider` (`"anthropic"` / `"openai"` / `"openrouter"`), or `None` if
/// nothing is set.
pub fn get(provider: &str) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => match legacy_entry(provider)?.get_password() {
            Ok(key) => {
                // Write the new entry before deleting the old one, so a failure never loses the key.
                entry(provider)?.set_password(&key).map_err(|e| e.to_string())?;
                let _ = legacy_entry(provider)?.delete_credential();
                Ok(Some(key))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        },
        Err(e) => Err(e.to_string()),
    }
}

/// Store `key` for `provider`. A blank key clears the entry instead of storing an empty secret.
pub fn set(provider: &str, key: &str) -> Result<(), String> {
    if key.trim().is_empty() {
        return clear(provider);
    }
    entry(provider)?.set_password(key).map_err(|e| e.to_string())
}

/// Remove any stored key for `provider`. A missing entry is not an error.
pub fn clear(provider: &str) -> Result<(), String> {
    // Clear the legacy entry too, or the next `get` would bring a cleared key back.
    for e in [entry(provider)?, legacy_entry(provider)?] {
        match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(err) => return Err(err.to_string()),
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_llm_api_key_cmd(provider: String) -> Result<Option<String>, String> {
    get(&provider)
}

#[tauri::command]
pub fn set_llm_api_key_cmd(provider: String, api_key: String) -> Result<(), String> {
    set(&provider, &api_key)
}

#[tauri::command]
pub fn clear_llm_api_key_cmd(provider: String) -> Result<(), String> {
    clear(&provider)
}

// Round-trips against the real login Keychain, so it only runs on macOS (incl. the CI
// `backend` job, which is macOS). Uses a throwaway "provider" so it can't touch a real key.
#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    const TEST_PROVIDER: &str = "automono_keychain_selftest";

    #[test]
    fn set_get_clear_round_trips() {
        clear(TEST_PROVIDER).unwrap(); // start clean
        assert_eq!(get(TEST_PROVIDER).unwrap(), None);

        set(TEST_PROVIDER, "sk-test-abc123").unwrap();
        assert_eq!(get(TEST_PROVIDER).unwrap(), Some("sk-test-abc123".to_string()));

        set(TEST_PROVIDER, "sk-test-updated").unwrap();
        assert_eq!(get(TEST_PROVIDER).unwrap(), Some("sk-test-updated".to_string()));

        set(TEST_PROVIDER, "   ").unwrap(); // blank clears
        assert_eq!(get(TEST_PROVIDER).unwrap(), None);

        clear(TEST_PROVIDER).unwrap(); // idempotent on a missing entry
    }

    #[test]
    fn get_moves_a_legacy_key_to_the_new_service() {
        const P: &str = "automono_keychain_selftest_legacy";
        clear(P).unwrap();
        legacy_entry(P).unwrap().set_password("sk-legacy").unwrap();

        assert_eq!(get(P).unwrap(), Some("sk-legacy".to_string()));
        assert!(matches!(legacy_entry(P).unwrap().get_password(), Err(keyring::Error::NoEntry)));
        assert_eq!(entry(P).unwrap().get_password().unwrap(), "sk-legacy");

        clear(P).unwrap();
    }
}
