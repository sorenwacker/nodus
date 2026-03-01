//! Checksum module for file integrity verification
//!
//! Uses SHA-256 to compute file hashes for detecting external changes.

use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ChecksumError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Compute SHA-256 checksum of a file
pub fn compute_file(path: &Path) -> Result<String, ChecksumError> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    let hash = hasher.finalize();
    Ok(hex::encode(hash))
}

/// Compute SHA-256 checksum of a string
pub fn compute_string(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_compute_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        fs::write(&file_path, "Hello, World!").unwrap();

        let hash = compute_file(&file_path).unwrap();
        assert_eq!(hash.len(), 64); // SHA-256 = 64 hex chars
    }

    #[test]
    fn test_compute_string() {
        let hash = compute_string("Hello, World!");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn test_same_content_same_hash() {
        let dir = tempdir().unwrap();
        let file1 = dir.path().join("test1.md");
        let file2 = dir.path().join("test2.md");

        fs::write(&file1, "Same content").unwrap();
        fs::write(&file2, "Same content").unwrap();

        let hash1 = compute_file(&file1).unwrap();
        let hash2 = compute_file(&file2).unwrap();

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_different_content_different_hash() {
        let dir = tempdir().unwrap();
        let file1 = dir.path().join("test1.md");
        let file2 = dir.path().join("test2.md");

        fs::write(&file1, "Content A").unwrap();
        fs::write(&file2, "Content B").unwrap();

        let hash1 = compute_file(&file1).unwrap();
        let hash2 = compute_file(&file2).unwrap();

        assert_ne!(hash1, hash2);
    }
}
