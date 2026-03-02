//! File watcher module for Obsidian vault synchronization
//!
//! Uses the `notify` crate to watch for file changes and `fs2` for file locking.

use fs2::FileExt;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use thiserror::Error;

use crate::checksum;

#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum WatcherError {
    #[error("Notify error: {0}")]
    Notify(#[from] notify::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("File is locked by another application")]
    FileLocked,
    #[error("Watcher not initialized")]
    NotInitialized,
}

/// File lock handle (reserved for future use)
#[allow(dead_code)]
pub struct FileLock {
    file: File,
    path: PathBuf,
}

#[allow(dead_code)]
impl FileLock {
    /// Acquire a shared (read) lock on a file
    pub fn shared(path: &Path) -> Result<Self, WatcherError> {
        let file = File::open(path)?;
        file.try_lock_shared().map_err(|_| WatcherError::FileLocked)?;
        Ok(Self {
            file,
            path: path.to_path_buf(),
        })
    }

    /// Acquire an exclusive (write) lock on a file
    pub fn exclusive(path: &Path) -> Result<Self, WatcherError> {
        let file = File::options().read(true).write(true).open(path)?;
        file.try_lock_exclusive().map_err(|_| WatcherError::FileLocked)?;
        Ok(Self {
            file,
            path: path.to_path_buf(),
        })
    }

    /// Upgrade from shared to exclusive lock
    pub fn upgrade(&self) -> Result<(), WatcherError> {
        self.file.unlock()?;
        self.file.try_lock_exclusive().map_err(|_| WatcherError::FileLocked)?;
        Ok(())
    }

    /// Get the file path
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for FileLock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
    }
}

/// Vault watcher state
pub struct VaultWatcher {
    watcher: RecommendedWatcher,
    watched_path: PathBuf,
    checksums: Arc<Mutex<HashMap<PathBuf, String>>>,
}

impl VaultWatcher {
    /// Create a new vault watcher
    pub fn new<F>(path: PathBuf, on_change: F) -> Result<Self, WatcherError>
    where
        F: Fn(FileChangeEvent) + Send + 'static,
    {
        let checksums: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let checksums_clone = checksums.clone();

        let watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    for path in event.paths {
                        // Only process .md files
                        if path.extension().map_or(false, |ext| ext == "md") {
                            let change = detect_change(&path, &checksums_clone);
                            if let Some(change) = change {
                                on_change(change);
                            }
                        }
                    }
                }
            },
            Config::default(),
        )?;

        Ok(Self {
            watcher,
            watched_path: path,
            checksums,
        })
    }

    /// Start watching the vault
    pub fn start(&mut self) -> Result<(), WatcherError> {
        self.watcher
            .watch(&self.watched_path, RecursiveMode::Recursive)?;

        // Initial scan
        self.scan_existing_files()?;

        Ok(())
    }

    /// Stop watching
    pub fn stop(&mut self) -> Result<(), WatcherError> {
        self.watcher.unwatch(&self.watched_path)?;
        Ok(())
    }

    /// Scan existing files and compute checksums
    fn scan_existing_files(&self) -> Result<(), WatcherError> {
        let mut checksums = self.checksums.lock().unwrap();

        for entry in walkdir::WalkDir::new(&self.watched_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                if let Ok(hash) = checksum::compute_file(path) {
                    checksums.insert(path.to_path_buf(), hash);
                }
            }
        }

        Ok(())
    }
}

/// File change event
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct FileChangeEvent {
    pub path: PathBuf,
    pub change_type: ChangeType,
    pub new_checksum: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ChangeType {
    Created,
    Modified,
    Deleted,
}

/// Detect type of change by comparing checksums
fn detect_change(
    path: &Path,
    checksums: &Arc<Mutex<HashMap<PathBuf, String>>>,
) -> Option<FileChangeEvent> {
    let mut checksums = checksums.lock().unwrap();

    if !path.exists() {
        // File was deleted
        if checksums.remove(path).is_some() {
            return Some(FileChangeEvent {
                path: path.to_path_buf(),
                change_type: ChangeType::Deleted,
                new_checksum: None,
            });
        }
        return None;
    }

    let new_hash = checksum::compute_file(path).ok()?;

    if let Some(old_hash) = checksums.get(path) {
        if old_hash == &new_hash {
            // No actual change
            return None;
        }
        // File was modified
        checksums.insert(path.to_path_buf(), new_hash.clone());
        Some(FileChangeEvent {
            path: path.to_path_buf(),
            change_type: ChangeType::Modified,
            new_checksum: Some(new_hash),
        })
    } else {
        // New file
        checksums.insert(path.to_path_buf(), new_hash.clone());
        Some(FileChangeEvent {
            path: path.to_path_buf(),
            change_type: ChangeType::Created,
            new_checksum: Some(new_hash),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_file_lock_shared() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "test content").unwrap();

        let lock = FileLock::shared(&file_path);
        assert!(lock.is_ok());
    }

    #[test]
    fn test_file_lock_exclusive() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "test content").unwrap();

        let lock = FileLock::exclusive(&file_path);
        assert!(lock.is_ok());
    }

    #[test]
    fn test_file_lock_conflict() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "test content").unwrap();

        let _lock1 = FileLock::exclusive(&file_path).unwrap();
        let lock2 = FileLock::exclusive(&file_path);

        assert!(matches!(lock2, Err(WatcherError::FileLocked)));
    }
}
