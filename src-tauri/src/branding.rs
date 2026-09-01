use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Copies `source` into `dest_dir` as `logo.<ext>`, always overwriting any previous logo —
/// unlike contract/expense attachments there's only ever one current logo, so there's nothing
/// to preserve by keeping the old file around.
fn copy_logo(source: &Path, dest_dir: &Path) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dest_dir)?;
    let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let dest_path = dest_dir.join(format!("logo.{ext}"));

    // Remove any previous logo with a different extension so replacing a .png with a .jpg
    // doesn't leave the old file behind forever.
    if let Ok(entries) = std::fs::read_dir(dest_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path != dest_path && path.file_stem().and_then(|s| s.to_str()) == Some("logo") {
                std::fs::remove_file(&path)?;
            }
        }
    }

    std::fs::copy(source, &dest_path)?;
    Ok(dest_path)
}

fn attach_business_logo(app: &AppHandle, source_path: &str) -> std::io::Result<String> {
    let dest_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("branding");
    let dest_path = copy_logo(Path::new(source_path), &dest_dir)?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn attach_business_logo_cmd(app: AppHandle, source_path: String) -> Result<String, String> {
    attach_business_logo(&app, &source_path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_logo_names_the_file_logo_with_the_source_extension() {
        let tmp = std::env::temp_dir().join(format!("automono_logo_test_{}", std::process::id()));
        let source_dir = tmp.join("source");
        std::fs::create_dir_all(&source_dir).unwrap();
        let source_path = source_dir.join("mi-logo.png");
        std::fs::write(&source_path, b"fake-png-bytes").unwrap();

        let dest_dir = tmp.join("dest");
        let dest_path = copy_logo(&source_path, &dest_dir).expect("copy succeeds");

        assert_eq!(std::fs::read(&dest_path).unwrap(), b"fake-png-bytes");
        assert_eq!(dest_path.file_name().unwrap().to_str().unwrap(), "logo.png");
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn copy_logo_overwrites_a_previous_logo_of_the_same_extension() {
        let tmp = std::env::temp_dir().join(format!("automono_logo_overwrite_test_{}", std::process::id()));
        let source_dir = tmp.join("source");
        std::fs::create_dir_all(&source_dir).unwrap();
        let source_path = source_dir.join("logo.png");
        let dest_dir = tmp.join("dest");

        std::fs::write(&source_path, b"v1").unwrap();
        copy_logo(&source_path, &dest_dir).unwrap();
        std::fs::write(&source_path, b"v2").unwrap();
        let dest_path = copy_logo(&source_path, &dest_dir).unwrap();

        assert_eq!(std::fs::read(&dest_path).unwrap(), b"v2");
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn copy_logo_removes_previous_logo_of_a_different_extension() {
        let tmp = std::env::temp_dir().join(format!("automono_logo_ext_change_test_{}", std::process::id()));
        let source_dir = tmp.join("source");
        std::fs::create_dir_all(&source_dir).unwrap();
        let dest_dir = tmp.join("dest");

        let png_source = source_dir.join("logo.png");
        std::fs::write(&png_source, b"png-bytes").unwrap();
        let png_dest = copy_logo(&png_source, &dest_dir).unwrap();
        assert!(png_dest.exists());

        let jpg_source = source_dir.join("logo.jpg");
        std::fs::write(&jpg_source, b"jpg-bytes").unwrap();
        let jpg_dest = copy_logo(&jpg_source, &dest_dir).unwrap();

        assert!(!png_dest.exists(), "old logo.png must be removed once logo.jpg replaces it");
        assert!(jpg_dest.exists());
        std::fs::remove_dir_all(&tmp).ok();
    }
}
