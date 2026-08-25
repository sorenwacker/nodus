//! Files the user dropped on the window, and may therefore be read.
//!
//! Commands that read files refuse paths outside a workspace vault so that a
//! path invented by an agent cannot reach arbitrary disk. A dropped file is the
//! opposite case: the user chose it, and the papers worth dropping rarely live
//! in a vault. The grant is recorded here from the operating system's own drop
//! event, never from a path the interface hands over - a caller able to name a
//! path could otherwise grant itself access to it
//! (PRODUCT_DESIGN.md > Reading files the user dropped).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

fn granted() -> &'static Mutex<HashSet<PathBuf>> {
    static GRANTED: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
    GRANTED.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Record paths the user dropped. Paths are canonicalised so that the same file
/// reached by a different route still matches.
pub fn grant(paths: &[PathBuf]) {
    let mut set = match granted().lock() {
        Ok(set) => set,
        Err(poisoned) => poisoned.into_inner(),
    };
    for path in paths {
        if let Ok(canonical) = path.canonicalize() {
            set.insert(canonical);
        }
    }
}

/// Whether the user dropped this file during this session.
pub fn is_granted(path: &Path) -> bool {
    let canonical = match path.canonicalize() {
        Ok(canonical) => canonical,
        Err(_) => return false,
    };
    let set = match granted().lock() {
        Ok(set) => set,
        Err(poisoned) => poisoned.into_inner(),
    };
    set.contains(&canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_dropped_file_is_readable_afterwards() {
        let dir = tempfile::tempdir().unwrap();
        let paper = dir.path().join("paper.pdf");
        std::fs::write(&paper, b"%PDF").unwrap();

        assert!(!is_granted(&paper));
        grant(std::slice::from_ref(&paper));
        assert!(is_granted(&paper));
    }

    #[test]
    fn a_file_that_was_never_dropped_is_not() {
        let dir = tempfile::tempdir().unwrap();
        let dropped = dir.path().join("dropped.pdf");
        let other = dir.path().join("other.pdf");
        std::fs::write(&dropped, b"%PDF").unwrap();
        std::fs::write(&other, b"%PDF").unwrap();

        grant(&[dropped]);

        assert!(!is_granted(&other));
    }
}
