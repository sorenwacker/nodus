//! Database models for workspaces, storylines, themes, and frames

use super::{DatabaseError, DbPool};

// Workspace CRUD operations
pub mod workspaces {
    use super::{DatabaseError, DbPool};
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Workspace {
        pub id: String,
        pub name: String,
        pub color: Option<String>,
        pub vault_path: Option<String>,
        pub sync_enabled: bool,
        pub created_at: i64,
        pub updated_at: i64,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Workspace>, DatabaseError> {
        let workspaces =
            sqlx::query_as::<_, Workspace>("SELECT * FROM workspaces ORDER BY created_at")
                .fetch_all(pool)
                .await?;
        Ok(workspaces)
    }

    pub async fn create(pool: &DbPool, workspace: &Workspace) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO workspaces (id, name, color, vault_path, sync_enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&workspace.id)
        .bind(&workspace.name)
        .bind(&workspace.color)
        .bind(&workspace.vault_path)
        .bind(workspace.sync_enabled)
        .bind(workspace.created_at)
        .bind(workspace.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_sync_enabled(
        pool: &DbPool,
        id: &str,
        sync_enabled: bool,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE workspaces SET sync_enabled = ?, updated_at = ? WHERE id = ?")
            .bind(sync_enabled)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_vault_path(
        pool: &DbPool,
        id: &str,
        vault_path: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE workspaces SET vault_path = ?, updated_at = ? WHERE id = ?")
            .bind(vault_path)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn rename(pool: &DbPool, id: &str, new_name: &str) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?")
            .bind(new_name)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Workspace>, DatabaseError> {
        let workspace = sqlx::query_as::<_, Workspace>("SELECT * FROM workspaces WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(workspace)
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        // Use transaction to ensure atomic deletion
        let mut tx = pool.begin().await?;

        // Delete edges connected to nodes in this workspace
        sqlx::query(
            "DELETE FROM edges WHERE source_node_id IN (SELECT id FROM nodes WHERE workspace_id = ?)
             OR target_node_id IN (SELECT id FROM nodes WHERE workspace_id = ?)",
        )
        .bind(id)
        .bind(id)
        .execute(&mut *tx)
        .await?;

        // Delete all nodes in this workspace (cuts link to Obsidian vault)
        sqlx::query("DELETE FROM nodes WHERE workspace_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // Delete storylines in this workspace
        sqlx::query("DELETE FROM storylines WHERE workspace_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // Delete frames in this workspace
        sqlx::query("DELETE FROM frames WHERE workspace_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // Finally delete the workspace
        sqlx::query("DELETE FROM workspaces WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(())
    }
}

// Storyline CRUD operations
pub mod storylines {
    use super::{DatabaseError, DbPool};
    use crate::database::nodes::Node;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Storyline {
        pub id: String,
        pub title: String,
        pub description: Option<String>,
        pub color: Option<String>,
        pub workspace_id: Option<String>,
        pub created_at: i64,
        pub updated_at: i64,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct StorylineNode {
        pub id: String,
        pub storyline_id: String,
        pub node_id: String,
        pub sequence_order: i32,
    }

    pub async fn get_by_workspace(
        pool: &DbPool,
        workspace_id: Option<&str>,
    ) -> Result<Vec<Storyline>, DatabaseError> {
        let storylines = match workspace_id {
            Some(id) => {
                sqlx::query_as::<_, Storyline>(
                    "SELECT * FROM storylines WHERE workspace_id = ? ORDER BY created_at",
                )
                .bind(id)
                .fetch_all(pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, Storyline>(
                    "SELECT * FROM storylines WHERE workspace_id IS NULL ORDER BY created_at",
                )
                .fetch_all(pool)
                .await?
            }
        };
        Ok(storylines)
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Storyline>, DatabaseError> {
        let storyline = sqlx::query_as::<_, Storyline>("SELECT * FROM storylines WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(storyline)
    }

    pub async fn create(pool: &DbPool, storyline: &Storyline) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO storylines (id, title, description, color, workspace_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&storyline.id)
        .bind(&storyline.title)
        .bind(&storyline.description)
        .bind(&storyline.color)
        .bind(&storyline.workspace_id)
        .bind(storyline.created_at)
        .bind(storyline.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update(
        pool: &DbPool,
        id: &str,
        title: &str,
        description: Option<&str>,
        color: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "UPDATE storylines SET title = ?, description = ?, color = ?, updated_at = ? WHERE id = ?",
        )
        .bind(title)
        .bind(description)
        .bind(color)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        sqlx::query("DELETE FROM storylines WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    // Storyline nodes management

    pub async fn add_node(
        pool: &DbPool,
        storyline_id: &str,
        node_id: &str,
        position: Option<i32>,
    ) -> Result<StorylineNode, DatabaseError> {
        let mut tx = pool.begin().await?;

        // If the node is already in the storyline, return the existing
        // membership before any reordering happens
        let existing = sqlx::query_as::<_, StorylineNode>(
            "SELECT * FROM storyline_nodes WHERE storyline_id = ? AND node_id = ?",
        )
        .bind(storyline_id)
        .bind(node_id)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(existing) = existing {
            return Ok(existing);
        }

        let max_order: Option<i32> = sqlx::query_scalar(
            "SELECT MAX(sequence_order) FROM storyline_nodes WHERE storyline_id = ?",
        )
        .bind(storyline_id)
        .fetch_one(&mut *tx)
        .await?;

        let next_order = max_order.unwrap_or(-1) + 1;
        let sequence_order = position.unwrap_or(next_order).clamp(0, next_order);

        // Shift trailing nodes up by one. A direct += 1 violates
        // UNIQUE(storyline_id, sequence_order) row-by-row, so go through
        // disjoint negative values first (same technique as reorder_nodes):
        // s -> -(s + 2) -> s + 1
        if sequence_order < next_order {
            sqlx::query(
                "UPDATE storyline_nodes SET sequence_order = -(sequence_order + 2) WHERE storyline_id = ? AND sequence_order >= ?",
            )
            .bind(storyline_id)
            .bind(sequence_order)
            .execute(&mut *tx)
            .await?;
            sqlx::query(
                "UPDATE storyline_nodes SET sequence_order = -sequence_order - 1 WHERE storyline_id = ? AND sequence_order < 0",
            )
            .bind(storyline_id)
            .execute(&mut *tx)
            .await?;
        }

        let storyline_node = StorylineNode {
            id: uuid::Uuid::new_v4().to_string(),
            storyline_id: storyline_id.to_string(),
            node_id: node_id.to_string(),
            sequence_order,
        };

        sqlx::query(
            r#"
            INSERT INTO storyline_nodes (id, storyline_id, node_id, sequence_order)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind(&storyline_node.id)
        .bind(&storyline_node.storyline_id)
        .bind(&storyline_node.node_id)
        .bind(storyline_node.sequence_order)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(storyline_node)
    }

    pub async fn remove_node(
        pool: &DbPool,
        storyline_id: &str,
        node_id: &str,
    ) -> Result<(), DatabaseError> {
        // Get the sequence_order of the node being removed
        let order: Option<i32> = sqlx::query_scalar(
            "SELECT sequence_order FROM storyline_nodes WHERE storyline_id = ? AND node_id = ?",
        )
        .bind(storyline_id)
        .bind(node_id)
        .fetch_optional(pool)
        .await?;

        // Delete the node
        sqlx::query("DELETE FROM storyline_nodes WHERE storyline_id = ? AND node_id = ?")
            .bind(storyline_id)
            .bind(node_id)
            .execute(pool)
            .await?;

        // Shift remaining nodes to fill the gap
        if let Some(removed_order) = order {
            sqlx::query(
                "UPDATE storyline_nodes SET sequence_order = sequence_order - 1 WHERE storyline_id = ? AND sequence_order > ?",
            )
            .bind(storyline_id)
            .bind(removed_order)
            .execute(pool)
            .await?;
        }

        Ok(())
    }

    pub async fn reorder_nodes(
        pool: &DbPool,
        storyline_id: &str,
        node_ids: &[String],
    ) -> Result<(), DatabaseError> {
        // Use transaction to ensure atomic reordering
        let mut tx = pool.begin().await?;

        // First, set all sequence_orders to negative values to avoid unique constraint conflicts
        // We use -(index + 1000) to ensure they're all unique and negative
        for (order, node_id) in node_ids.iter().enumerate() {
            sqlx::query(
                "UPDATE storyline_nodes SET sequence_order = ? WHERE storyline_id = ? AND node_id = ?",
            )
            .bind(-(order as i32 + 1000))
            .bind(storyline_id)
            .bind(node_id)
            .execute(&mut *tx)
            .await?;
        }

        // Then set the final positive values
        for (order, node_id) in node_ids.iter().enumerate() {
            sqlx::query(
                "UPDATE storyline_nodes SET sequence_order = ? WHERE storyline_id = ? AND node_id = ?",
            )
            .bind(order as i32)
            .bind(storyline_id)
            .bind(node_id)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// Get full node data for a storyline, ordered by sequence
    pub async fn get_nodes_with_data(
        pool: &DbPool,
        storyline_id: &str,
    ) -> Result<Vec<Node>, DatabaseError> {
        let nodes = sqlx::query_as::<_, Node>(
            r#"
            SELECT n.* FROM nodes n
            INNER JOIN storyline_nodes sn ON n.id = sn.node_id
            WHERE sn.storyline_id = ? AND n.deleted_at IS NULL
            ORDER BY sn.sequence_order
            "#,
        )
        .bind(storyline_id)
        .fetch_all(pool)
        .await?;
        Ok(nodes)
    }
}

// Theme CRUD operations
pub mod themes {
    use super::{DatabaseError, DbPool};
    use crate::themes as theme_module;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Theme {
        pub id: String,
        pub name: String,
        pub display_name: String,
        pub yaml_content: String,
        pub is_builtin: i32,
        pub workspace_id: Option<String>,
        pub created_at: i64,
        pub updated_at: i64,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Theme>, DatabaseError> {
        let themes =
            sqlx::query_as::<_, Theme>("SELECT * FROM themes ORDER BY is_builtin DESC, name")
                .fetch_all(pool)
                .await?;
        Ok(themes)
    }

    pub async fn get_by_name(pool: &DbPool, name: &str) -> Result<Option<Theme>, DatabaseError> {
        let theme = sqlx::query_as::<_, Theme>("SELECT * FROM themes WHERE name = ?")
            .bind(name)
            .fetch_optional(pool)
            .await?;
        Ok(theme)
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Theme>, DatabaseError> {
        let theme = sqlx::query_as::<_, Theme>("SELECT * FROM themes WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(theme)
    }

    pub async fn create(pool: &DbPool, theme: &Theme) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO themes (id, name, display_name, yaml_content, is_builtin, workspace_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&theme.id)
        .bind(&theme.name)
        .bind(&theme.display_name)
        .bind(&theme.yaml_content)
        .bind(theme.is_builtin)
        .bind(&theme.workspace_id)
        .bind(theme.created_at)
        .bind(theme.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update(
        pool: &DbPool,
        id: &str,
        yaml_content: &str,
        display_name: &str,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "UPDATE themes SET yaml_content = ?, display_name = ?, updated_at = ? WHERE id = ? AND is_builtin = 0",
        )
        .bind(yaml_content)
        .bind(display_name)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<bool, DatabaseError> {
        // Only allow deleting non-builtin themes
        let result = sqlx::query("DELETE FROM themes WHERE id = ? AND is_builtin = 0")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Seed built-in themes from YAML files
    pub async fn seed_builtin_themes(pool: &DbPool) -> Result<(), DatabaseError> {
        let builtin_themes = theme_module::load_builtin_themes();
        let now = chrono::Utc::now().timestamp();

        for (name, theme_yaml) in builtin_themes {
            // Serialize to YAML for storage
            let yaml_content = serde_yaml::to_string(&theme_yaml)
                .map_err(|e| DatabaseError::Migration(e.to_string()))?;

            // Check if theme already exists
            let existing = get_by_name(pool, &name).await?;
            if let Some(existing_theme) = existing {
                // Update existing builtin theme with latest YAML
                if existing_theme.is_builtin == 1 {
                    sqlx::query(
                        "UPDATE themes SET yaml_content = ?, display_name = ?, updated_at = ? WHERE id = ?",
                    )
                    .bind(&yaml_content)
                    .bind(&theme_yaml.display_name)
                    .bind(now)
                    .bind(&existing_theme.id)
                    .execute(pool)
                    .await?;
                }
                continue;
            }

            let theme = Theme {
                id: uuid::Uuid::new_v4().to_string(),
                name,
                display_name: theme_yaml.display_name,
                yaml_content,
                is_builtin: 1,
                workspace_id: None,
                created_at: now,
                updated_at: now,
            };

            create(pool, &theme).await?;
        }

        Ok(())
    }
}

// Frame CRUD operations
pub mod frames {
    use super::{DatabaseError, DbPool};
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Frame {
        pub id: String,
        pub title: String,
        pub parent_frame_id: Option<String>,
        pub canvas_x: f64,
        pub canvas_y: f64,
        pub width: f64,
        pub height: f64,
        pub color: Option<String>,
        pub workspace_id: Option<String>,
        pub folder_path: Option<String>,
        pub created_at: i64,
        pub updated_at: i64,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Frame>, DatabaseError> {
        let frames = sqlx::query_as::<_, Frame>("SELECT * FROM frames ORDER BY created_at")
            .fetch_all(pool)
            .await?;
        Ok(frames)
    }

    pub async fn create(pool: &DbPool, frame: &Frame) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO frames (id, title, parent_frame_id, canvas_x, canvas_y, width, height, color, workspace_id, folder_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&frame.id)
        .bind(&frame.title)
        .bind(&frame.parent_frame_id)
        .bind(frame.canvas_x)
        .bind(frame.canvas_y)
        .bind(frame.width)
        .bind(frame.height)
        .bind(&frame.color)
        .bind(&frame.workspace_id)
        .bind(&frame.folder_path)
        .bind(frame.created_at)
        .bind(frame.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_position(
        pool: &DbPool,
        id: &str,
        x: f64,
        y: f64,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET canvas_x = ?, canvas_y = ?, updated_at = ? WHERE id = ?")
            .bind(x)
            .bind(y)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_size(
        pool: &DbPool,
        id: &str,
        width: f64,
        height: f64,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET width = ?, height = ?, updated_at = ? WHERE id = ?")
            .bind(width)
            .bind(height)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_title(pool: &DbPool, id: &str, title: &str) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET title = ?, updated_at = ? WHERE id = ?")
            .bind(title)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_color(
        pool: &DbPool,
        id: &str,
        color: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET color = ?, updated_at = ? WHERE id = ?")
            .bind(color)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_parent(
        pool: &DbPool,
        id: &str,
        parent_frame_id: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET parent_frame_id = ?, updated_at = ? WHERE id = ?")
            .bind(parent_frame_id)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        sqlx::query("DELETE FROM frames WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get_by_title_and_workspace(
        pool: &DbPool,
        title: &str,
        workspace_id: Option<&str>,
    ) -> Result<Option<Frame>, DatabaseError> {
        let frame = match workspace_id {
            Some(ws_id) => {
                sqlx::query_as::<_, Frame>(
                    "SELECT * FROM frames WHERE title = ? AND workspace_id = ?",
                )
                .bind(title)
                .bind(ws_id)
                .fetch_optional(pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, Frame>(
                    "SELECT * FROM frames WHERE title = ? AND workspace_id IS NULL",
                )
                .bind(title)
                .fetch_optional(pool)
                .await?
            }
        };
        Ok(frame)
    }

    #[allow(dead_code)]
    pub async fn update_folder_path(
        pool: &DbPool,
        id: &str,
        folder_path: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET folder_path = ?, updated_at = ? WHERE id = ?")
            .bind(folder_path)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn get_by_folder_path_and_workspace(
        pool: &DbPool,
        folder_path: &str,
        workspace_id: Option<&str>,
    ) -> Result<Option<Frame>, DatabaseError> {
        let frame = match workspace_id {
            Some(ws_id) => {
                sqlx::query_as::<_, Frame>(
                    "SELECT * FROM frames WHERE folder_path = ? AND workspace_id = ?",
                )
                .bind(folder_path)
                .bind(ws_id)
                .fetch_optional(pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, Frame>(
                    "SELECT * FROM frames WHERE folder_path = ? AND workspace_id IS NULL",
                )
                .bind(folder_path)
                .fetch_optional(pool)
                .await?
            }
        };
        Ok(frame)
    }
}
