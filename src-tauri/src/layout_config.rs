//! Layout configuration constants for vault import
//!
//! Centralized layout parameters for positioning nodes and frames
//! during vault import operations.

/// Spacing between frames in the grid layout
pub const FRAME_SPACING: f64 = 800.0;

/// Default frame dimensions (minimum)
pub const FRAME_WIDTH: f64 = 600.0;
pub const FRAME_HEIGHT: f64 = 400.0;

/// Frame padding
pub const FRAME_PADDING_RIGHT: f64 = 30.0;
pub const FRAME_PADDING_BOTTOM: f64 = 30.0;

/// Calculate frame dimensions based on number of nodes
pub fn calculate_frame_size(node_count: usize) -> (f64, f64) {
    if node_count == 0 {
        return (FRAME_WIDTH, FRAME_HEIGHT);
    }

    let rows = (node_count + FRAME_NODE_COLS - 1) / FRAME_NODE_COLS; // ceil division
    let cols = node_count.min(FRAME_NODE_COLS);

    let width = FRAME_NODE_X_OFFSET + (cols as f64) * FRAME_NODE_SPACING + FRAME_PADDING_RIGHT;
    let height = FRAME_NODE_Y_OFFSET + (rows as f64) * FRAME_NODE_ROW_HEIGHT + FRAME_PADDING_BOTTOM;

    // Ensure minimum dimensions
    (width.max(FRAME_WIDTH), height.max(FRAME_HEIGHT))
}

/// Number of frames per row in grid layout
pub const FRAME_COLS: usize = 3;

/// Frame grid origin offset
pub const FRAME_ORIGIN: f64 = 50.0;

/// Node positioning within frames
pub const FRAME_NODE_COLS: usize = 3;
pub const FRAME_NODE_SPACING: f64 = 180.0;
pub const FRAME_NODE_X_OFFSET: f64 = 30.0;
pub const FRAME_NODE_Y_OFFSET: f64 = 60.0;
pub const FRAME_NODE_ROW_HEIGHT: f64 = 140.0;

/// Root-level node positioning (nodes not in frames)
pub const ROOT_NODE_COLS: usize = 5;
pub const ROOT_NODE_SPACING: f64 = 250.0;
pub const ROOT_NODE_ORIGIN: f64 = 100.0;

/// Default node dimensions
pub const NODE_WIDTH: f64 = 200.0;
pub const NODE_HEIGHT: f64 = 120.0;
