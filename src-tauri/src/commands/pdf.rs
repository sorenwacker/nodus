//! PDF commands for extracting text and annotations

use super::validate_path_in_workspace;

// ============================================================================
// PDF Commands
// ============================================================================

/// Extract text from PDF file
/// Only allows reading PDFs within workspace vaults (security)
#[tauri::command]
pub async fn extract_pdf_text(path: String) -> Result<String, String> {
    let path_ref = std::path::Path::new(&path);
    validate_path_in_workspace(path_ref).await?;
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read PDF: {}", e))?;
    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("PDF extraction failed: {}", e))?;
    Ok(text)
}

/// Extract annotations from PDF file
/// Only allows reading PDFs within workspace vaults (security)
#[tauri::command]
pub async fn extract_pdf_annotations(
    path: String,
) -> Result<Vec<crate::pdf::PdfAnnotation>, String> {
    let path_ref = std::path::Path::new(&path);
    validate_path_in_workspace(path_ref).await?;
    crate::pdf::extract_annotations(path_ref)
}
