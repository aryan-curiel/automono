#[tauri::command]
pub async fn write_text_file_cmd(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn writes_contents_to_path() {
        let path = std::env::temp_dir()
            .join(format!("automono_export_test_{}.csv", std::process::id()))
            .to_string_lossy()
            .to_string();

        write_text_file_cmd(path.clone(), "a,b,c".to_string())
            .await
            .unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "a,b,c");
        std::fs::remove_file(&path).ok();
    }
}
