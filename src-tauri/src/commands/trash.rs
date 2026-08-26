//! Moving a node's file to and from the vault's trash folder
//!
//! Deleting a node moves its file to a `.nodus-trash` folder beside it rather
//! than removing it, so a delete can be undone and so an accidental delete
//! never destroys the user's text. This logic was written out three times, with
//! the copies disagreeing on whether a failed move aborts the delete.

use crate::database::nodes::Node;
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

/// Split nodes into those whose file reached the trash and a description of
/// each failure.
///
/// A node with no file has nothing to move and is deletable. Deleting a node
/// whose file is still in the vault leaves the watcher to read the file back,
/// so the node returns.
pub(crate) fn partition_by_trash_move(nodes: &[Node]) -> (Vec<String>, Vec<String>) {
    let mut deletable = Vec::new();
    let mut failures = Vec::new();

    for node in nodes {
        match &node.file_path {
            None => deletable.push(node.id.clone()),
            Some(path) => match move_to_trash(std::path::Path::new(path)) {
                Ok(()) => deletable.push(node.id.clone()),
                Err(e) => failures.push(format!("{}: {}", node.title, e)),
            },
        }
    }

    (deletable, failures)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node_with_file(id: &str, title: &str, file_path: Option<&str>) -> Node {
        Node {
            id: id.to_string(),
            title: title.to_string(),
            file_path: file_path.map(|p| p.to_string()),
            markdown_content: None,
            node_type: "note".to_string(),
            canvas_x: 0.0,
            canvas_y: 0.0,
            width: 200.0,
            height: 120.0,
            z_index: 0,
            frame_id: None,
            color_theme: None,
            is_collapsed: false,
            tags: None,
            workspace_id: None,
            checksum: None,
            created_at: 0,
            updated_at: 0,
            deleted_at: None,
        }
    }

    /// A node is deletable once its file is in the trash. Deleting the row while
    /// the file stays in the vault leaves the watcher to read it back, and the
    /// node returns (PRODUCT_DESIGN.md > Deleting nodes with files).
    #[test]
    fn a_node_whose_file_moved_is_deletable() {
        let dir = std::env::temp_dir().join("nodus-delete-partition-ok");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("alpha.md");
        std::fs::write(&file, "content").unwrap();

        let (deletable, failures) =
            partition_by_trash_move(&[node_with_file("n1", "Alpha", Some(file.to_str().unwrap()))]);

        assert_eq!(deletable, vec!["n1".to_string()]);
        assert!(failures.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_node_with_no_file_is_deletable() {
        let (deletable, failures) = partition_by_trash_move(&[node_with_file("n1", "Alpha", None)]);

        assert_eq!(deletable, vec!["n1".to_string()]);
        assert!(failures.is_empty());
    }

    #[test]
    fn a_node_whose_file_could_not_move_is_reported_by_title() {
        // A regular file named .nodus-trash means the trash folder cannot be
        // created, so the move fails while the file itself is real
        let dir = std::env::temp_dir().join("nodus-delete-partition-blocked");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("alpha.md");
        std::fs::write(&file, "content").unwrap();
        std::fs::write(dir.join(".nodus-trash"), "not a directory").unwrap();

        let (deletable, failures) = partition_by_trash_move(&[
            node_with_file("n1", "Alpha", Some(file.to_str().unwrap())),
            node_with_file("n2", "Beta", None),
        ]);

        // Only the node with nothing to move is deletable
        assert_eq!(deletable, vec!["n2".to_string()]);
        assert_eq!(failures.len(), 1);
        assert!(
            failures[0].contains("Alpha"),
            "the failure must name the node: {:?}",
            failures
        );
        // The file that could not be moved is still in the vault
        assert!(file.exists());
        std::fs::remove_dir_all(&dir).ok();
    }

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
