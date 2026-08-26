//! Moving a node's file to and from the vault's trash folder
//!
//! Deleting a node moves its file to a `.nodus-trash` folder beside it rather
//! than removing it, so a delete can be undone and so an accidental delete
//! never destroys the user's text. This logic was written out three times, with
//! the copies disagreeing on whether a failed move aborts the delete.

use std::path::Path;

const TRASH_DIR: &str = ".nodus-trash";

/// Move a file into the trash folder beside it.
///
/// A file that does not exist is not an error: the node may never have had one.
pub(crate) fn move_to_trash(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    let Some(filename) = path.file_name() else {
        return Ok(());
    };

    let trash_dir = parent.join(TRASH_DIR);
    if !trash_dir.exists() {
        std::fs::create_dir_all(&trash_dir)
            .map_err(|e| format!("Failed to create trash dir: {}", e))?;
    }

    std::fs::rename(path, trash_dir.join(filename))
        .map_err(|e| format!("Failed to move file to trash: {}", e))
}

/// Move a file back out of the trash folder to where it came from.
///
/// Does nothing when there is nothing in the trash, or when a file is already
/// at the destination: overwriting it would discard the newer content.
pub(crate) fn restore_from_trash(path: &Path) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    let Some(filename) = path.file_name() else {
        return Ok(());
    };

    let trash_path = parent.join(TRASH_DIR).join(filename);
    if !trash_path.exists() || path.exists() {
        return Ok(());
    }

    std::fs::rename(&trash_path, path)
        .map_err(|e| format!("Failed to restore file from trash: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("nodus-trash-test-{}", name));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_deleted_file_lands_in_the_trash_folder() {
        let dir = temp_dir("move");
        let file = dir.join("note.md");
        std::fs::write(&file, "content").unwrap();

        move_to_trash(&file).unwrap();

        assert!(!file.exists());
        assert_eq!(
            std::fs::read_to_string(dir.join(".nodus-trash/note.md")).unwrap(),
            "content"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_node_without_a_file_is_not_an_error() {
        let dir = temp_dir("absent");

        assert!(move_to_trash(&dir.join("never-existed.md")).is_ok());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_restore_returns_the_file_with_its_content() {
        let dir = temp_dir("restore");
        let file = dir.join("note.md");
        std::fs::write(&file, "content").unwrap();
        move_to_trash(&file).unwrap();

        restore_from_trash(&file).unwrap();

        assert_eq!(std::fs::read_to_string(&file).unwrap(), "content");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_restore_never_overwrites_a_file_already_there() {
        // Whatever is at the destination is newer than what was trashed
        let dir = temp_dir("keep");
        let file = dir.join("note.md");
        std::fs::write(&file, "trashed").unwrap();
        move_to_trash(&file).unwrap();
        std::fs::write(&file, "newer").unwrap();

        restore_from_trash(&file).unwrap();

        assert_eq!(std::fs::read_to_string(&file).unwrap(), "newer");
        std::fs::remove_dir_all(&dir).ok();
    }
}
