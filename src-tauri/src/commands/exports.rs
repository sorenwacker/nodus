//! Writing exported documents to a location the user chose
//!
//! See PRODUCT_DESIGN.md > Document export.

use std::io::Write;
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;

/// Ask the user where to save, then write the bytes there.
///
/// The dialog is owned by the backend, so the chosen path never round-trips
/// through the interface: a path the interface names is not a path the user
/// chose, and only the second may be written to. This mirrors how
/// `dropped_paths` grants reads - from the operating system's own event, never
/// from a caller-supplied string (PRODUCT_DESIGN.md > Document export).
///
/// Returns the path written, or `None` when the user cancelled.
#[tauri::command]
pub async fn save_export_file(
    app: tauri::AppHandle,
    data: Vec<u8>,
    suggested_name: String,
    extension: String,
) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();

    app.dialog()
        .file()
        .set_file_name(&suggested_name)
        .add_filter(&extension, &[extension.as_str()])
        .save_file(move |chosen| {
            let _ = tx.send(chosen);
        });

    let chosen = rx
        .await
        .map_err(|_| "The save dialog closed unexpectedly".to_string())?;

    let Some(file_path) = chosen else {
        return Ok(None);
    };
    let target = file_path
        .into_path()
        .map_err(|e| format!("Unusable save location: {}", e))?;

    write_atomically(&target, &data)?;
    Ok(Some(target.to_string_lossy().into_owned()))
}

/// Write whole or not at all: a temporary neighbour is written and renamed, so
/// an interrupted export cannot leave a truncated document where a reader
/// expects a complete one.
fn write_atomically(target: &Path, data: &[u8]) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "Export path has no parent directory".to_string())?;
    if !parent.is_dir() {
        return Err(format!("Folder does not exist: {}", parent.display()));
    }

    // Append rather than replace the extension: with_extension turns
    // "report.pdf" into "report.nodus-export-part" and would clobber an
    // unrelated file of that name
    let mut temp_name = target
        .file_name()
        .ok_or_else(|| "Export path has no file name".to_string())?
        .to_os_string();
    temp_name.push(".nodus-export-part");
    let temp: PathBuf = parent.join(temp_name);

    {
        let mut file = std::fs::File::create(&temp)
            .map_err(|e| format!("Failed to create {}: {}", temp.display(), e))?;
        file.write_all(data)
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

    #[test]
    fn writes_the_bytes_it_was_given() {
        let dir = std::env::temp_dir().join("nodus-export-test-write");
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("paper.pdf");

        write_atomically(&target, b"%PDF-1.7").unwrap();

        assert_eq!(std::fs::read(&target).unwrap(), b"%PDF-1.7");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn leaves_no_partial_file_when_the_folder_is_missing() {
        let missing = std::env::temp_dir().join("nodus-export-test-absent/paper.pdf");

        let result = write_atomically(&missing, b"data");

        assert!(result.is_err());
        assert!(!missing.exists());
    }

    #[test]
    fn never_clobbers_a_neighbour_by_replacing_the_extension() {
        // with_extension("nodus-export-part") would target report.nodus-export-part
        let dir = std::env::temp_dir().join("nodus-export-test-neighbour");
        std::fs::create_dir_all(&dir).unwrap();
        let bystander = dir.join("report.nodus-export-part");
        std::fs::write(&bystander, b"do not touch").unwrap();

        write_atomically(&dir.join("report.pdf"), b"%PDF").unwrap();

        assert_eq!(std::fs::read(&bystander).unwrap(), b"do not touch");
        std::fs::remove_dir_all(&dir).ok();
    }
}
