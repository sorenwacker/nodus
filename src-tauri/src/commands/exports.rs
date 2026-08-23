//! Writing exported documents to a location the user chose
//!
//! See PRODUCT_DESIGN.md > Document export.

use std::io::Write;
use std::path::Path;

/// Write exported bytes to `path`.
///
/// The path comes from the system save dialog, so the user has already chosen
/// it explicitly and it is deliberately not restricted to a workspace, unlike
/// the paths the application discovers for itself.
///
/// The file is written whole or not at all: a temporary neighbour is written
/// and renamed, so an interrupted export cannot leave a truncated document
/// where a reader would expect a complete one.
#[tauri::command]
pub async fn write_export_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let target = Path::new(&path);
    let parent = target
        .parent()
        .ok_or_else(|| "Export path has no parent directory".to_string())?;
    if !parent.is_dir() {
        return Err(format!("Folder does not exist: {}", parent.display()));
    }

    let temp = target.with_extension("nodus-export-part");
    {
        let mut file = std::fs::File::create(&temp)
            .map_err(|e| format!("Failed to create {}: {}", temp.display(), e))?;
        file.write_all(&data)
            .map_err(|e| format!("Failed to write export: {}", e))?;
        file.sync_all()
            .map_err(|e| format!("Failed to flush export: {}", e))?;
    }

    std::fs::rename(&temp, target).map_err(|e| {
        let _ = std::fs::remove_file(&temp);
        format!("Failed to save {}: {}", target.display(), e)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn writes_the_bytes_it_was_given() {
        let dir = std::env::temp_dir().join("nodus-export-test-write");
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("paper.pdf");

        write_export_file(target.to_string_lossy().into_owned(), b"%PDF-1.7".to_vec())
            .await
            .unwrap();

        assert_eq!(std::fs::read(&target).unwrap(), b"%PDF-1.7");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn leaves_no_partial_file_when_the_folder_is_missing() {
        let missing = std::env::temp_dir().join("nodus-export-test-absent/paper.pdf");

        let result =
            write_export_file(missing.to_string_lossy().into_owned(), b"data".to_vec()).await;

        assert!(result.is_err());
        assert!(!missing.exists());
    }
}
