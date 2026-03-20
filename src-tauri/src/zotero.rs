//! Zotero library reader
//!
//! Provides read-only access to Zotero's SQLite database for importing
//! citations and collections into Nodus.

use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use std::path::PathBuf;

/// A Zotero collection (folder)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoteroCollection {
    pub key: String,
    pub name: String,
    pub parent_key: Option<String>,
    pub item_count: i32,
}

/// A Zotero item creator (author, editor, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoteroCreator {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub creator_type: String,
}

/// A Zotero item attachment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoteroAttachment {
    pub key: String,
    pub title: Option<String>,
    pub path: Option<String>,
    pub content_type: Option<String>,
}

/// A Zotero library item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoteroItem {
    pub key: String,
    pub item_type: String,
    pub title: Option<String>,
    pub creators: Vec<ZoteroCreator>,
    pub date: Option<String>,
    pub publication_title: Option<String>,
    pub publisher: Option<String>,
    pub volume: Option<String>,
    pub issue: Option<String>,
    pub pages: Option<String>,
    pub doi: Option<String>,
    pub url: Option<String>,
    pub abstract_note: Option<String>,
    pub attachments: Vec<ZoteroAttachment>,
    pub collections: Vec<String>,
}

/// Detect the Zotero data directory path
///
/// Checks common locations based on the operating system.
pub fn detect_zotero_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;

    // Platform-specific default locations
    #[cfg(target_os = "macos")]
    let candidates = vec![
        home.join("Zotero"),
        home.join("Library/Application Support/Zotero/Profiles"),
    ];

    #[cfg(target_os = "windows")]
    let candidates = vec![
        home.join("Zotero"),
        home.join("AppData/Roaming/Zotero/Zotero/Profiles"),
    ];

    #[cfg(target_os = "linux")]
    let candidates = vec![
        home.join("Zotero"),
        home.join(".zotero/zotero"),
    ];

    // Check for zotero.sqlite in each candidate
    for candidate in candidates {
        let db_path = candidate.join("zotero.sqlite");
        if db_path.exists() {
            return Some(candidate);
        }

        // Check profile directories
        if candidate.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&candidate) {
                for entry in entries.flatten() {
                    let profile_db = entry.path().join("zotero.sqlite");
                    if profile_db.exists() {
                        return Some(entry.path());
                    }
                }
            }
        }
    }

    None
}

/// Open a read-only connection to the Zotero database
async fn open_zotero_db(zotero_path: &PathBuf) -> Result<SqlitePool, String> {
    let db_path = zotero_path.join("zotero.sqlite");

    if !db_path.exists() {
        return Err(format!("Zotero database not found at {:?}", db_path));
    }

    // Open in read-only mode to avoid conflicts with Zotero
    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .read_only(true)
        .create_if_missing(false);

    SqlitePool::connect_with(options)
        .await
        .map_err(|e| format!("Failed to open Zotero database: {}", e))
}

/// Get all collections from the Zotero library
pub async fn get_collections(zotero_path: &PathBuf) -> Result<Vec<ZoteroCollection>, String> {
    let pool = open_zotero_db(zotero_path).await?;

    let rows = sqlx::query(
        r#"
        SELECT
            c.key,
            c.collectionName,
            pc.key as parentKey,
            (SELECT COUNT(*) FROM collectionItems ci WHERE ci.collectionID = c.collectionID) as itemCount
        FROM collections c
        LEFT JOIN collections pc ON c.parentCollectionID = pc.collectionID
        WHERE c.libraryID = 1
        ORDER BY c.collectionName
        "#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to query collections: {}", e))?;

    let collections = rows
        .iter()
        .map(|row| ZoteroCollection {
            key: row.get("key"),
            name: row.get("collectionName"),
            parent_key: row.get("parentKey"),
            item_count: row.get("itemCount"),
        })
        .collect();

    pool.close().await;
    Ok(collections)
}

/// Get items in a specific collection
pub async fn get_collection_items(
    zotero_path: &PathBuf,
    collection_key: &str,
) -> Result<Vec<ZoteroItem>, String> {
    let pool = open_zotero_db(zotero_path).await?;

    // Get items in the collection
    let item_rows = sqlx::query(
        r#"
        SELECT DISTINCT
            i.key,
            it.typeName as itemType
        FROM items i
        JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
        JOIN collectionItems ci ON i.itemID = ci.itemID
        JOIN collections c ON ci.collectionID = c.collectionID
        WHERE c.key = ?
          AND it.typeName NOT IN ('attachment', 'note')
          AND i.libraryID = 1
        "#,
    )
    .bind(collection_key)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to query items: {}", e))?;

    let mut items = Vec::new();

    for row in item_rows {
        let item_key: String = row.get("key");
        let item_type: String = row.get("itemType");

        // Get item fields
        let fields = get_item_fields(&pool, &item_key).await?;

        // Get creators
        let creators = get_item_creators(&pool, &item_key).await?;

        // Get attachments
        let attachments = get_item_attachments(&pool, &item_key).await?;

        // Get collections this item belongs to
        let collections = get_item_collections(&pool, &item_key).await?;

        items.push(ZoteroItem {
            key: item_key,
            item_type,
            title: fields.get("title").cloned(),
            creators,
            date: fields.get("date").cloned(),
            publication_title: fields
                .get("publicationTitle")
                .or(fields.get("bookTitle"))
                .cloned(),
            publisher: fields.get("publisher").cloned(),
            volume: fields.get("volume").cloned(),
            issue: fields.get("issue").cloned(),
            pages: fields.get("pages").cloned(),
            doi: fields.get("DOI").cloned(),
            url: fields.get("url").cloned(),
            abstract_note: fields.get("abstractNote").cloned(),
            attachments,
            collections,
        });
    }

    pool.close().await;
    Ok(items)
}

/// Get field values for an item
async fn get_item_fields(
    pool: &SqlitePool,
    item_key: &str,
) -> Result<std::collections::HashMap<String, String>, String> {
    let rows = sqlx::query(
        r#"
        SELECT f.fieldName, iv.value
        FROM itemDataValues iv
        JOIN itemData id ON iv.valueID = id.valueID
        JOIN fields f ON id.fieldID = f.fieldID
        JOIN items i ON id.itemID = i.itemID
        WHERE i.key = ?
        "#,
    )
    .bind(item_key)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to query item fields: {}", e))?;

    let mut fields = std::collections::HashMap::new();
    for row in rows {
        let field_name: String = row.get("fieldName");
        let value: String = row.get("value");
        fields.insert(field_name, value);
    }

    Ok(fields)
}

/// Get creators for an item
async fn get_item_creators(
    pool: &SqlitePool,
    item_key: &str,
) -> Result<Vec<ZoteroCreator>, String> {
    let rows = sqlx::query(
        r#"
        SELECT c.firstName, c.lastName, ct.creatorType
        FROM creators c
        JOIN itemCreators ic ON c.creatorID = ic.creatorID
        JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
        JOIN items i ON ic.itemID = i.itemID
        WHERE i.key = ?
        ORDER BY ic.orderIndex
        "#,
    )
    .bind(item_key)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to query creators: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| ZoteroCreator {
            first_name: row.get("firstName"),
            last_name: row.get("lastName"),
            creator_type: row.get("creatorType"),
        })
        .collect())
}

/// Get attachments for an item
async fn get_item_attachments(
    pool: &SqlitePool,
    item_key: &str,
) -> Result<Vec<ZoteroAttachment>, String> {
    let rows = sqlx::query(
        r#"
        SELECT
            att.key,
            (SELECT value FROM itemDataValues idv
             JOIN itemData id ON idv.valueID = id.valueID
             JOIN fields f ON id.fieldID = f.fieldID
             WHERE id.itemID = att.itemID AND f.fieldName = 'title') as title,
            ia.path,
            ia.contentType
        FROM items att
        JOIN itemAttachments ia ON att.itemID = ia.itemID
        JOIN items parent ON ia.parentItemID = parent.itemID
        WHERE parent.key = ?
        "#,
    )
    .bind(item_key)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to query attachments: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| ZoteroAttachment {
            key: row.get("key"),
            title: row.get("title"),
            path: row.get("path"),
            content_type: row.get("contentType"),
        })
        .collect())
}

/// Get collection keys for an item
async fn get_item_collections(pool: &SqlitePool, item_key: &str) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        r#"
        SELECT c.collectionName
        FROM collections c
        JOIN collectionItems ci ON c.collectionID = ci.collectionID
        JOIN items i ON ci.itemID = i.itemID
        WHERE i.key = ?
        "#,
    )
    .bind(item_key)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to query item collections: {}", e))?;

    Ok(rows.iter().map(|row| row.get("collectionName")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_zotero_path_returns_none_when_not_installed() {
        // This test just verifies the function doesn't panic
        let _path = detect_zotero_path();
    }
}
