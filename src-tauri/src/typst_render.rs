//! Typst math rendering using native Rust
//!
//! Renders Typst math expressions to SVG strings

use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use typst::foundations::{Bytes, Datetime};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::Library;
use typst::World;
use typst::syntax::{FileId, Source};
use typst::diag::FileResult;

/// Cache for rendered SVGs
static SVG_CACHE: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// Lazily loaded fonts and library
static FONTS: Lazy<(LazyHash<FontBook>, Vec<Font>)> = Lazy::new(|| {
    let font_data = typst_assets::fonts();
    let mut fonts = Vec::new();

    for data in font_data {
        let buffer = Bytes::from_static(data);
        for font in Font::iter(buffer) {
            fonts.push(font);
        }
    }

    let book = FontBook::from_fonts(fonts.iter());
    (LazyHash::new(book), fonts)
});

static LIBRARY: Lazy<LazyHash<Library>> = Lazy::new(|| {
    LazyHash::new(Library::default())
});

/// Simple world implementation for Typst
struct MathWorld {
    source: Source,
}

impl MathWorld {
    fn new(content: &str) -> Self {
        Self {
            source: Source::detached(content),
        }
    }
}

impl World for MathWorld {
    fn library(&self) -> &LazyHash<Library> {
        &LIBRARY
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &FONTS.0
    }

    fn main(&self) -> FileId {
        self.source.id()
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.source.id() {
            Ok(self.source.clone())
        } else {
            Err(typst::diag::FileError::NotFound(id.vpath().as_rootless_path().into()))
        }
    }

    fn file(&self, _id: FileId) -> FileResult<Bytes> {
        Err(typst::diag::FileError::AccessDenied)
    }

    fn font(&self, index: usize) -> Option<Font> {
        FONTS.1.get(index).cloned()
    }

    fn today(&self, _offset: Option<i64>) -> Option<Datetime> {
        None
    }
}

/// Render a Typst math expression to SVG
pub fn render_math_to_svg(math: &str, display_mode: bool) -> Result<String, String> {
    // Check cache first
    let cache_key = format!("{}:{}", if display_mode { "d" } else { "i" }, math);
    {
        let cache = SVG_CACHE.lock().unwrap();
        if let Some(svg) = cache.get(&cache_key) {
            return Ok(svg.clone());
        }
    }

    // Build Typst document
    // Use generous margins to prevent clipping of tall elements (fractions, sums, etc.)
    // Use fill: none for transparent background
    let typst_code = if display_mode {
        format!(r#"#set page(width: auto, height: auto, margin: (x: 0.3em, y: 0.5em), fill: none)
#set text(size: 14pt)
$ {} $"#, math)
    } else {
        format!(r#"#set page(width: auto, height: auto, margin: (x: 0.2em, y: 0.3em), fill: none)
#set text(size: 14pt)
${}$"#, math)
    };

    let world = MathWorld::new(&typst_code);

    // Compile
    let document = typst::compile(&world)
        .output
        .map_err(|errors| {
            errors.iter()
                .map(|e| e.message.to_string())
                .collect::<Vec<_>>()
                .join("; ")
        })?;

    // Render first page to SVG
    let svg = if let Some(page) = document.pages.first() {
        typst_svg::svg(page)
    } else {
        return Err("No pages in document".to_string());
    };

    // Cache the result
    {
        let mut cache = SVG_CACHE.lock().unwrap();
        if cache.len() > 500 {
            cache.clear(); // Simple cache eviction
        }
        cache.insert(cache_key, svg.clone());
    }

    Ok(svg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_simple_math() {
        let result = render_math_to_svg("x^2", false);
        assert!(result.is_ok());
        assert!(result.unwrap().contains("<svg"));
    }

    #[test]
    fn test_render_vector() {
        // vec(x) creates a column vector
        let result = render_math_to_svg("vec(x)", false);
        assert!(result.is_ok());
    }

    #[test]
    fn test_render_arrow_over_letter() {
        // arrow(x) puts an arrow over x (like LaTeX \vec{x})
        let result = render_math_to_svg("arrow(x)", false);
        assert!(result.is_ok(), "arrow(x) failed: {:?}", result);
        assert!(result.unwrap().contains("<svg"));
    }

    #[test]
    fn test_render_accent_arrow() {
        // Alternative: accent(x, arrow)
        let result = render_math_to_svg("accent(x, arrow)", false);
        assert!(result.is_ok(), "accent failed: {:?}", result);
    }
}
