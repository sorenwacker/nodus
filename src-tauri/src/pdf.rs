//! PDF annotation extraction
//!
//! Extracts highlights, underlines, and annotations from PDF files.

use lopdf::{Document, Object, ObjectId};
use serde::Serialize;

/// A single PDF annotation (highlight, underline, etc.)
#[derive(Debug, Clone, Serialize)]
pub struct PdfAnnotation {
    /// Type of annotation (Highlight, Underline, StrikeOut, Squiggly)
    pub annotation_type: String,
    /// The highlighted/marked text content
    pub content: String,
    /// Optional comment/note attached to the annotation
    pub comment: Option<String>,
    /// Page number (1-indexed)
    pub page: u32,
    /// Color as hex string (if available)
    pub color: Option<String>,
    /// Creation date (if available)
    pub created_at: Option<String>,
}

/// Extract all text markup annotations from a PDF
pub fn extract_annotations(path: &std::path::Path) -> Result<Vec<PdfAnnotation>, String> {
    let doc = Document::load(path).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let mut annotations = Vec::new();

    // Iterate through pages
    for (page_num, page_id) in doc.get_pages() {
        if let Ok(page) = doc.get_object(page_id) {
            if let Object::Dictionary(page_dict) = page {
                // Get annotations array
                if let Ok(annots_obj) = page_dict.get(b"Annots") {
                    let annot_ids = resolve_array(&doc, annots_obj);

                    for annot_id in annot_ids {
                        if let Ok(annot) = doc.get_object(annot_id) {
                            if let Some(annotation) = parse_annotation(&doc, annot, page_num) {
                                annotations.push(annotation);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(annotations)
}

/// Resolve an object to an array of object IDs
fn resolve_array(doc: &Document, obj: &Object) -> Vec<ObjectId> {
    match obj {
        Object::Array(arr) => arr
            .iter()
            .filter_map(|item| match item {
                Object::Reference(id) => Some(*id),
                _ => None,
            })
            .collect(),
        Object::Reference(id) => {
            if let Ok(resolved) = doc.get_object(*id) {
                resolve_array(doc, resolved)
            } else {
                vec![]
            }
        }
        _ => vec![],
    }
}

/// Parse a single annotation object
fn parse_annotation(doc: &Document, obj: &Object, page_num: u32) -> Option<PdfAnnotation> {
    let dict = match obj {
        Object::Dictionary(d) => d,
        _ => return None,
    };

    // Get annotation subtype
    let subtype = dict.get(b"Subtype").ok().and_then(get_name)?;

    // Only process text markup annotations
    let annotation_type = match subtype.as_str() {
        "Highlight" => "highlight",
        "Underline" => "underline",
        "StrikeOut" => "strikeout",
        "Squiggly" => "squiggly",
        _ => return None, // Skip other annotation types
    };

    // Get the marked text content
    let content = extract_marked_content(doc, dict);

    // Get optional comment (Contents field)
    let comment = dict
        .get(b"Contents")
        .ok()
        .and_then(|obj| get_string(doc, obj));

    // Get color if available
    let color = dict.get(b"C").ok().and_then(|obj| {
        if let Object::Array(arr) = resolve_object(doc, obj) {
            if arr.len() >= 3 {
                let r = get_number(&arr[0]).unwrap_or(0.0);
                let g = get_number(&arr[1]).unwrap_or(0.0);
                let b = get_number(&arr[2]).unwrap_or(0.0);
                Some(format!(
                    "#{:02x}{:02x}{:02x}",
                    (r * 255.0) as u8,
                    (g * 255.0) as u8,
                    (b * 255.0) as u8
                ))
            } else {
                None
            }
        } else {
            None
        }
    });

    // Get creation date if available
    let created_at = dict
        .get(b"CreationDate")
        .ok()
        .and_then(|obj| get_string(doc, obj));

    // Only include annotations that have content or comments
    if content.is_empty() && comment.is_none() {
        return None;
    }

    Some(PdfAnnotation {
        annotation_type: annotation_type.to_string(),
        content,
        comment,
        page: page_num,
        color,
        created_at,
    })
}

/// Extract the text content that was marked by the annotation
fn extract_marked_content(doc: &Document, annot_dict: &lopdf::Dictionary) -> String {
    // Try to get QuadPoints which define the marked region
    // For now, we'll use the Contents or RC (Rich Content) fields
    // as extracting text from QuadPoints requires page content stream parsing

    // Try RC (Rich Content) first - this contains the actual selected text in some PDFs
    if let Ok(rc_obj) = annot_dict.get(b"RC") {
        if let Some(rc_text) = get_string(doc, rc_obj) {
            // RC is usually XML/HTML - extract plain text
            let plain = strip_xml_tags(&rc_text);
            if !plain.is_empty() {
                return plain;
            }
        }
    }

    // Try Contents field - some PDFs store the marked text here
    if let Ok(contents_obj) = annot_dict.get(b"Contents") {
        if let Some(text) = get_string(doc, contents_obj) {
            return text;
        }
    }

    // Try T field (title/subject)
    if let Ok(t_obj) = annot_dict.get(b"T") {
        if let Some(text) = get_string(doc, t_obj) {
            return text;
        }
    }

    String::new()
}

/// Strip XML/HTML tags from rich content
fn strip_xml_tags(s: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;

    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }

    result.trim().to_string()
}

/// Get a name value from an object
fn get_name(obj: &Object) -> Option<String> {
    match obj {
        Object::Name(name) => Some(String::from_utf8_lossy(name).to_string()),
        _ => None,
    }
}

/// Get a string value from an object
fn get_string(doc: &Document, obj: &Object) -> Option<String> {
    match resolve_object(doc, obj) {
        Object::String(bytes, _) => {
            // Try UTF-8 first
            if let Ok(s) = String::from_utf8(bytes.clone()) {
                return Some(s);
            }
            // Try UTF-16BE (PDF standard for Unicode)
            if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                let chars: Vec<u16> = bytes[2..]
                    .chunks(2)
                    .filter_map(|chunk| {
                        if chunk.len() == 2 {
                            Some(u16::from_be_bytes([chunk[0], chunk[1]]))
                        } else {
                            None
                        }
                    })
                    .collect();
                return String::from_utf16(&chars).ok();
            }
            // Fallback to lossy conversion
            Some(String::from_utf8_lossy(bytes).to_string())
        }
        _ => None,
    }
}

/// Get a number value from an object
fn get_number(obj: &Object) -> Option<f32> {
    match obj {
        Object::Integer(i) => Some(*i as f32),
        Object::Real(r) => Some(*r),
        _ => None,
    }
}

/// Resolve a reference to its actual object
fn resolve_object<'a>(doc: &'a Document, obj: &'a Object) -> &'a Object {
    match obj {
        Object::Reference(id) => doc.get_object(*id).unwrap_or(obj),
        _ => obj,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_xml_tags() {
        assert_eq!(strip_xml_tags("<p>Hello</p>"), "Hello");
        assert_eq!(strip_xml_tags("<span style=\"color:red\">Text</span>"), "Text");
        assert_eq!(strip_xml_tags("No tags here"), "No tags here");
        assert_eq!(strip_xml_tags("<p><b>Bold</b> and <i>italic</i></p>"), "Bold and italic");
    }
}
