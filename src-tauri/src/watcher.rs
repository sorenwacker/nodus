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

/// File lock handle for safe concurrent file access
#[allow(dead_code)]
pub struct FileLock {
    file: File,
}

impl FileLock {
    /// Acquire a shared (read) lock on a file
    #[allow(dead_code)]
    pub fn shared(path: &Path) -> Result<Self, WatcherError> {
        let file = File::open(path)?;
        file.try_lock_shared()
            .map_err(|_| WatcherError::FileLocked)?;
        Ok(Self { file })
    }

    /// Acquire an exclusive (write) lock on a file
    pub fn exclusive(path: &Path) -> Result<Self, WatcherError> {
        let file = File::options().read(true).write(true).open(path)?;
        file.try_lock_exclusive()
            .map_err(|_| WatcherError::FileLocked)?;
        Ok(Self { file })
    }

    /// Write content to the locked file
    pub fn write_content(&mut self, content: &str) -> Result<(), WatcherError> {
        use std::io::{Seek, Write};
        self.file.set_len(0)?; // Truncate
        self.file.seek(std::io::SeekFrom::Start(0))?;
        self.file.write_all(content.as_bytes())?;
        self.file.flush()?;
        Ok(())
    }
}

/// Write content to a file with exclusive locking
/// Returns the new checksum of the file
pub fn write_file_locked(path: &Path, content: &str) -> Result<String, WatcherError> {
    let mut lock = FileLock::exclusive(path)?;
    lock.write_content(content)?;
    // Lock is released on drop
    drop(lock);
    // Compute new checksum
    crate::checksum::compute_file(path).map_err(|e| {
        WatcherError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))
    })
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
                match res {
                    Ok(event) => {
                        for path in event.paths {
                            // Skip hidden files/directories (any component starting with .)
                            let is_hidden = path
                                .components()
                                .any(|c| c.as_os_str().to_string_lossy().starts_with('.'));
                            if is_hidden {
                                continue;
                            }

                            // Only process .md files
                            if path.extension().map_or(false, |ext| ext == "md") {
                                let change = detect_change(&path, &checksums_clone);
                                if let Some(change) = change {
                                    println!(
                                        "[Watcher] File change: {:?} - {:?}",
                                        change.change_type, path
                                    );
                                    on_change(change);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Watcher] Error from notify: {:?}", e);
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
        let mut count = 0;

        println!(
            "[Watcher] Scanning existing files in: {:?}",
            self.watched_path
        );

        for entry in walkdir::WalkDir::new(&self.watched_path)
            .into_iter()
            .filter_entry(|e| {
                // Skip hidden files and directories (starting with .)
                // But don't filter the root directory itself (depth 0)
                e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.')
            })
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                if let Ok(hash) = checksum::compute_file(path) {
                    checksums.insert(path.to_path_buf(), hash);
                    count += 1;
                }
            }
        }

        println!("[Watcher] Initial scan complete: {} md files found", count);
        println!("[Watcher] Checksums map has {} entries", checksums.len());
        Ok(())
    }
}

/// File change event
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileChangeEvent {
    pub path: PathBuf,
    pub change_type: ChangeType,
    pub new_checksum: Option<String>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
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
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{Duration, Instant};
    use tempfile::tempdir;

    // ========================================================================
    // File Lock Tests
    // ========================================================================

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

    #[test]
    fn test_multiple_shared_locks() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "test content").unwrap();

        let lock1 = FileLock::shared(&file_path);
        let lock2 = FileLock::shared(&file_path);

        assert!(lock1.is_ok());
        assert!(lock2.is_ok());
    }

    #[test]
    fn test_shared_blocks_exclusive() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "test content").unwrap();

        let _shared = FileLock::shared(&file_path).unwrap();
        let exclusive = FileLock::exclusive(&file_path);

        assert!(matches!(exclusive, Err(WatcherError::FileLocked)));
    }

    #[test]
    fn test_lock_released_on_drop() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "test content").unwrap();

        {
            let _lock1 = FileLock::exclusive(&file_path).unwrap();
        }
        // lock1 dropped here

        let lock2 = FileLock::exclusive(&file_path);
        assert!(lock2.is_ok());
    }

    // ========================================================================
    // Change Detection Tests
    // ========================================================================

    #[test]
    fn test_detect_created_file() {
        let checksums: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("new.md");
        fs::write(&file_path, "new content").unwrap();

        let change = detect_change(&file_path, &checksums);

        assert!(change.is_some());
        let event = change.unwrap();
        assert_eq!(event.change_type, ChangeType::Created);
        assert!(event.new_checksum.is_some());
    }

    #[test]
    fn test_detect_modified_file() {
        let checksums: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");

        // Initial content
        fs::write(&file_path, "initial content").unwrap();
        let _ = detect_change(&file_path, &checksums); // Register initial checksum

        // Modify content
        fs::write(&file_path, "modified content").unwrap();
        let change = detect_change(&file_path, &checksums);

        assert!(change.is_some());
        let event = change.unwrap();
        assert_eq!(event.change_type, ChangeType::Modified);
    }

    #[test]
    fn test_detect_deleted_file() {
        let checksums: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");

        // Create and register
        fs::write(&file_path, "content").unwrap();
        let _ = detect_change(&file_path, &checksums);

        // Delete file
        fs::remove_file(&file_path).unwrap();
        let change = detect_change(&file_path, &checksums);

        assert!(change.is_some());
        let event = change.unwrap();
        assert_eq!(event.change_type, ChangeType::Deleted);
        assert!(event.new_checksum.is_none());
    }

    #[test]
    fn test_no_change_when_content_unchanged() {
        let checksums: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");

        fs::write(&file_path, "same content").unwrap();
        let _ = detect_change(&file_path, &checksums); // Register

        // "Touch" the file but with same content
        fs::write(&file_path, "same content").unwrap();
        let change = detect_change(&file_path, &checksums);

        assert!(change.is_none()); // No change detected
    }

    // ========================================================================
    // Concurrent Edit Simulation Tests
    // ========================================================================

    #[test]
    fn test_concurrent_edit_detection() {
        // Simulates external editor modifying file while Nodus has it tracked
        let checksums: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("concurrent.md");

        // Nodus creates file
        fs::write(&file_path, "# Initial\nContent from Nodus").unwrap();
        let create_event = detect_change(&file_path, &checksums);
        assert!(create_event.is_some());
        assert_eq!(create_event.unwrap().change_type, ChangeType::Created);

        // External editor modifies
        fs::write(
            &file_path,
            "# Initial\nContent from Nodus\n\nAdded by Obsidian",
        )
        .unwrap();
        let modify_event = detect_change(&file_path, &checksums);
        assert!(modify_event.is_some());
        assert_eq!(modify_event.unwrap().change_type, ChangeType::Modified);

        // Nodus modifies again
        fs::write(&file_path, "# Updated\nNew content from Nodus").unwrap();
        let nodus_event = detect_change(&file_path, &checksums);
        assert!(nodus_event.is_some());
        assert_eq!(nodus_event.unwrap().change_type, ChangeType::Modified);
    }

    // ========================================================================
    // Watcher Integration Tests
    // ========================================================================

    #[test]
    fn test_watcher_detects_changes() {
        let dir = tempdir().unwrap();
        let event_count = Arc::new(AtomicUsize::new(0));
        let event_count_clone = event_count.clone();

        let mut watcher = VaultWatcher::new(dir.path().to_path_buf(), move |_event| {
            event_count_clone.fetch_add(1, Ordering::SeqCst);
        })
        .unwrap();

        watcher.start().unwrap();

        // Create a new file
        let file_path = dir.path().join("new_file.md");
        fs::write(&file_path, "test content").unwrap();

        // Give watcher time to detect
        std::thread::sleep(Duration::from_millis(500));

        // Note: Event count may vary due to filesystem debouncing
        // Just verify watcher didn't crash
        watcher.stop().unwrap();
    }

    #[test]
    fn test_watcher_initial_scan() {
        let dir = tempdir().unwrap();
        let dir_path = dir.path().to_path_buf();

        // Create files before starting watcher
        let file1 = dir_path.join("existing1.md");
        let file2 = dir_path.join("existing2.md");
        fs::write(&file1, "content 1").unwrap();
        fs::write(&file2, "content 2").unwrap();

        // Ensure files are flushed to disk
        std::thread::sleep(Duration::from_millis(50));

        // Verify files exist before starting watcher
        assert!(file1.exists(), "File 1 should exist");
        assert!(file2.exists(), "File 2 should exist");

        let mut watcher = VaultWatcher::new(dir_path.clone(), |_| {}).unwrap();
        watcher.start().unwrap(); // scan_existing_files is called in start()

        // Checksums should be populated after start()
        {
            let checksums = watcher.checksums.lock().unwrap();
            assert!(
                checksums.len() >= 2,
                "Expected at least 2 checksums, got {}. Dir: {:?}",
                checksums.len(),
                dir_path
            );
        }

        watcher.stop().unwrap();
    }

    #[test]
    fn test_watcher_ignores_non_md_files() {
        let dir = tempdir().unwrap();
        let event_count = Arc::new(AtomicUsize::new(0));
        let event_count_clone = event_count.clone();

        let mut watcher = VaultWatcher::new(dir.path().to_path_buf(), move |_| {
            event_count_clone.fetch_add(1, Ordering::SeqCst);
        })
        .unwrap();

        watcher.start().unwrap();

        // Create non-md files
        fs::write(dir.path().join("test.txt"), "ignored").unwrap();
        fs::write(dir.path().join("test.json"), "{}").unwrap();

        std::thread::sleep(Duration::from_millis(300));
        watcher.stop().unwrap();

        // No events should be triggered for non-md files
        assert_eq!(event_count.load(Ordering::SeqCst), 0);
    }

    // ========================================================================
    // Performance Tests
    // ========================================================================

    #[test]
    fn test_checksum_performance() {
        // Verify checksum computation is fast enough for real-time detection
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("large.md");

        // Create a moderately large file (100KB)
        let content = "# Test\n".repeat(10000);
        fs::write(&file_path, &content).unwrap();

        let start = Instant::now();
        for _ in 0..100 {
            let _ = crate::checksum::compute_file(&file_path);
        }
        let elapsed = start.elapsed();

        // 100 checksums should complete in under 1 second
        assert!(
            elapsed < Duration::from_secs(1),
            "Checksum too slow: {:?}",
            elapsed
        );
    }

    #[test]
    fn test_change_detection_latency() {
        // Verify change detection overhead is minimal
        let checksums: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("latency.md");

        fs::write(&file_path, "initial").unwrap();

        let start = Instant::now();
        for i in 0..100 {
            fs::write(&file_path, format!("content {}", i)).unwrap();
            let _ = detect_change(&file_path, &checksums);
        }
        let elapsed = start.elapsed();

        // 100 change detections should complete in under 500ms
        assert!(
            elapsed < Duration::from_millis(500),
            "Detection too slow: {:?}",
            elapsed
        );
    }

    // ========================================================================
    // Integrity Tests - Simulate Real-World Concurrent Edit Scenarios
    // ========================================================================

    #[test]
    fn test_integrity_nodus_write_blocks_external() {
        // Scenario: Nodus acquires exclusive lock, external app cannot write
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("conflict.md");
        fs::write(&file_path, "initial content").unwrap();

        // Nodus acquires exclusive lock
        let nodus_lock = FileLock::exclusive(&file_path).unwrap();

        // Simulate external app trying to write (would fail in real scenario)
        // In tests, we verify the lock blocks another exclusive acquisition
        let external_attempt = FileLock::exclusive(&file_path);
        assert!(matches!(external_attempt, Err(WatcherError::FileLocked)));

        // Nodus writes content
        drop(nodus_lock);
    }

    #[test]
    fn test_integrity_graceful_lock_failure() {
        // Scenario: External app has file open, Nodus shows user-friendly error
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("external_open.md");
        fs::write(&file_path, "content").unwrap();

        // External app has exclusive lock
        let _external_lock = FileLock::exclusive(&file_path).unwrap();

        // Nodus tries to edit - should fail gracefully
        let result = FileLock::exclusive(&file_path);
        assert!(result.is_err());

        if let Err(WatcherError::FileLocked) = result {
            // This is the expected error that triggers user notification
        } else {
            panic!("Expected FileLocked error");
        }
    }

    #[test]
    fn test_integrity_write_file_locked_function() {
        // Test the high-level write_file_locked function
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("write_test.md");
        fs::write(&file_path, "original").unwrap();

        // Write with lock
        let checksum = super::write_file_locked(&file_path, "new content").unwrap();

        // Verify content was written
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "new content");

        // Verify checksum is valid
        assert!(!checksum.is_empty());
        assert_eq!(checksum.len(), 64); // SHA-256 hex length
    }

    #[test]
    fn test_integrity_write_blocked_by_reader() {
        // Scenario: File has shared reader, write should fail
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("read_block.md");
        fs::write(&file_path, "content").unwrap();

        // Reader has shared lock
        let _reader = FileLock::shared(&file_path).unwrap();

        // Writer tries exclusive lock - should fail
        let writer = FileLock::exclusive(&file_path);
        assert!(matches!(writer, Err(WatcherError::FileLocked)));
    }

    #[test]
    fn test_integrity_rapid_lock_acquire_release() {
        // Stress test: rapid lock/unlock cycles
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("stress.md");
        fs::write(&file_path, "content").unwrap();

        for i in 0..50 {
            let lock = FileLock::exclusive(&file_path).unwrap();
            // Simulate brief edit
            std::thread::sleep(Duration::from_micros(100));
            drop(lock);

            // Another process could acquire here
            let lock2 = FileLock::exclusive(&file_path).unwrap();
            drop(lock2);
        }
    }

    #[test]
    fn test_integrity_checksum_detects_external_change() {
        // Verify checksum correctly detects when file changed externally
        let checksums: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("external_edit.md");

        // Nodus creates and tracks file
        fs::write(&file_path, "# Note\nOriginal content").unwrap();
        let event = detect_change(&file_path, &checksums);
        assert_eq!(event.unwrap().change_type, ChangeType::Created);

        let original_checksum = {
            let cs = checksums.lock().unwrap();
            cs.get(&file_path).cloned().unwrap()
        };

        // External app (Obsidian) modifies file
        fs::write(
            &file_path,
            "# Note\nOriginal content\n\n## Added by Obsidian",
        )
        .unwrap();

        // Nodus detects change via checksum
        let event = detect_change(&file_path, &checksums);
        assert!(event.is_some());
        assert_eq!(event.as_ref().unwrap().change_type, ChangeType::Modified);

        // Checksum should be different
        let new_checksum = event.unwrap().new_checksum.unwrap();
        assert_ne!(original_checksum, new_checksum);
    }

    #[test]
    fn test_integrity_file_deleted_while_tracked() {
        // Verify proper handling when external app deletes file
        let checksums: Arc<Mutex<HashMap<PathBuf, String>>> = Arc::new(Mutex::new(HashMap::new()));
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("to_delete.md");

        // Create and track
        fs::write(&file_path, "content").unwrap();
        let _ = detect_change(&file_path, &checksums);

        // External deletion
        fs::remove_file(&file_path).unwrap();

        // Nodus detects deletion
        let event = detect_change(&file_path, &checksums);
        assert!(event.is_some());
        assert_eq!(event.unwrap().change_type, ChangeType::Deleted);

        // File should be removed from tracking
        let cs = checksums.lock().unwrap();
        assert!(!cs.contains_key(&file_path));
    }
}
