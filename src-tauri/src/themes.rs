//! Theme module for YAML-based theme management
//!
//! Provides structs and functions for parsing, validating, and managing themes.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Theme variables that map to CSS custom properties
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeVariables {
    pub bg_canvas: String,
    pub bg_surface: String,
    pub bg_surface_alt: String,
    pub bg_elevated: String,
    pub text_main: String,
    pub text_secondary: String,
    pub text_muted: String,
    pub border_default: String,
    pub border_subtle: String,
    pub primary_color: String,
    #[serde(default)]
    pub danger_color: Option<String>,
    #[serde(default)]
    pub danger_bg: Option<String>,
    #[serde(default)]
    pub danger_border: Option<String>,
    pub dot_color: String,
    pub shadow_sm: String,
    pub shadow_md: String,
}

/// Effect definition for specific UI elements
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeEffect {
    #[serde(default)]
    pub box_shadow: Option<String>,
    #[serde(default)]
    pub border_color: Option<String>,
    #[serde(default)]
    pub filter: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
}

/// Theme effects for various UI states
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ThemeEffects {
    #[serde(default)]
    pub node_card: Option<ThemeEffect>,
    #[serde(default)]
    pub node_card_hover: Option<ThemeEffect>,
    #[serde(default)]
    pub node_card_selected: Option<ThemeEffect>,
    #[serde(default)]
    pub edge_glow: Option<ThemeEffect>,
    #[serde(default)]
    pub edge_highlighted: Option<ThemeEffect>,
    #[serde(default)]
    pub edge_selected: Option<ThemeEffect>,
}

/// YAML theme structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeYaml {
    pub name: String,
    pub display_name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub is_dark: bool,
    pub variables: ThemeVariables,
    #[serde(default)]
    pub extras: Option<HashMap<String, String>>,
    #[serde(default)]
    pub effects: Option<ThemeEffects>,
}

/// Validation error types
#[derive(Debug, thiserror::Error)]
pub enum ThemeError {
    #[error("YAML parse error: {0}")]
    YamlParse(#[from] serde_yaml::Error),
    #[error("Invalid theme: {0}")]
    Validation(String),
}

/// Parse YAML string into ThemeYaml struct
pub fn parse_yaml(yaml_content: &str) -> Result<ThemeYaml, ThemeError> {
    let theme: ThemeYaml = serde_yaml::from_str(yaml_content)?;
    validate_theme(&theme)?;
    Ok(theme)
}

/// Validate theme structure and values
pub fn validate_theme(theme: &ThemeYaml) -> Result<(), ThemeError> {
    // Validate name (must be kebab-case, no spaces)
    if theme.name.is_empty() {
        return Err(ThemeError::Validation("Theme name cannot be empty".into()));
    }
    if theme.name.contains(' ') {
        return Err(ThemeError::Validation(
            "Theme name cannot contain spaces (use kebab-case)".into(),
        ));
    }
    if !theme
        .name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(ThemeError::Validation(
            "Theme name must be lowercase alphanumeric with hyphens only".into(),
        ));
    }

    // Validate display_name
    if theme.display_name.is_empty() {
        return Err(ThemeError::Validation(
            "Theme display_name cannot be empty".into(),
        ));
    }

    // Validate required color values exist
    let vars = &theme.variables;
    validate_color(&vars.bg_canvas, "bg_canvas")?;
    validate_color(&vars.bg_surface, "bg_surface")?;
    validate_color(&vars.text_main, "text_main")?;
    validate_color(&vars.primary_color, "primary_color")?;

    Ok(())
}

/// Basic color validation (hex, rgb, rgba, or CSS keywords)
fn validate_color(color: &str, field_name: &str) -> Result<(), ThemeError> {
    if color.is_empty() {
        return Err(ThemeError::Validation(format!(
            "{} cannot be empty",
            field_name
        )));
    }

    // Accept common formats
    let valid = color.starts_with('#')
        || color.starts_with("rgb")
        || color.starts_with("rgba")
        || color.starts_with("hsl")
        || color.starts_with("var(")
        || color == "transparent"
        || color == "inherit"
        || color == "currentColor";

    if !valid {
        // Could be a named color, be lenient
        if !color.chars().all(|c| c.is_alphabetic()) {
            return Err(ThemeError::Validation(format!(
                "{} has invalid color format: {}",
                field_name, color
            )));
        }
    }

    Ok(())
}

/// Load built-in themes from embedded YAML files
pub fn load_builtin_themes() -> Vec<(String, ThemeYaml)> {
    let themes = vec![
        ("light", include_str!("../themes/light.yaml")),
        ("dark", include_str!("../themes/dark.yaml")),
        ("pitch-black", include_str!("../themes/pitch-black.yaml")),
        ("cyber", include_str!("../themes/cyber.yaml")),
    ];

    themes
        .into_iter()
        .filter_map(|(name, content)| {
            parse_yaml(content)
                .ok()
                .map(|theme| (name.to_string(), theme))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_light_theme() {
        let yaml = include_str!("../themes/light.yaml");
        let theme = parse_yaml(yaml).expect("Should parse light theme");
        assert_eq!(theme.name, "light");
        assert_eq!(theme.display_name, "Light");
        assert!(!theme.is_dark);
    }

    #[test]
    fn test_parse_dark_theme() {
        let yaml = include_str!("../themes/dark.yaml");
        let theme = parse_yaml(yaml).expect("Should parse dark theme");
        assert_eq!(theme.name, "dark");
        assert!(theme.is_dark);
    }

    #[test]
    fn test_parse_cyber_theme() {
        let yaml = include_str!("../themes/cyber.yaml");
        let theme = parse_yaml(yaml).expect("Should parse cyber theme");
        assert_eq!(theme.name, "cyber");
        assert!(theme.is_dark);
        assert!(theme.extras.is_some());
        assert!(theme.effects.is_some());
    }

    #[test]
    fn test_load_builtin_themes() {
        let themes = load_builtin_themes();
        assert_eq!(themes.len(), 4);

        let names: Vec<_> = themes.iter().map(|(n, _)| n.as_str()).collect();
        assert!(names.contains(&"light"));
        assert!(names.contains(&"dark"));
        assert!(names.contains(&"pitch-black"));
        assert!(names.contains(&"cyber"));
    }

    #[test]
    fn test_invalid_theme_name() {
        let yaml = r##"
name: "Invalid Name"
display_name: "Test"
is_dark: false
variables:
  bg_canvas: "#ffffff"
  bg_surface: "#ffffff"
  bg_surface_alt: "#ffffff"
  bg_elevated: "#ffffff"
  text_main: "#000000"
  text_secondary: "#333333"
  text_muted: "#666666"
  border_default: "#cccccc"
  border_subtle: "#eeeeee"
  primary_color: "#0000ff"
  dot_color: "#dddddd"
  shadow_sm: "rgba(0,0,0,0.1)"
  shadow_md: "rgba(0,0,0,0.2)"
"##;
        let result = parse_yaml(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_color_validation() {
        let yaml = r##"
name: "test"
display_name: "Test"
is_dark: false
variables:
  bg_canvas: ""
  bg_surface: "#ffffff"
  bg_surface_alt: "#ffffff"
  bg_elevated: "#ffffff"
  text_main: "#000000"
  text_secondary: "#333333"
  text_muted: "#666666"
  border_default: "#cccccc"
  border_subtle: "#eeeeee"
  primary_color: "#0000ff"
  dot_color: "#dddddd"
  shadow_sm: "rgba(0,0,0,0.1)"
  shadow_md: "rgba(0,0,0,0.2)"
"##;
        let result = parse_yaml(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn test_custom_theme_with_extras() {
        let yaml = r##"
name: "crazy-bananas"
display_name: "Crazy Bananas"
description: "Vibrant tropical theme"
is_dark: false
variables:
  bg_canvas: "#fff8e1"
  bg_surface: "#ffeb3b"
  bg_surface_alt: "#ffe082"
  bg_elevated: "#fff9c4"
  text_main: "#4a2c2a"
  text_secondary: "#6d4c41"
  text_muted: "#8d6e63"
  border_default: "#ffc107"
  border_subtle: "#ffecb3"
  primary_color: "#ff9800"
  dot_color: "#ffe0b2"
  shadow_sm: "rgba(255, 152, 0, 0.1)"
  shadow_md: "rgba(255, 152, 0, 0.2)"
extras:
  banana_glow: "#ffeb3b"
effects:
  node_card:
    box_shadow: "0 0 15px rgba(255, 193, 7, 0.4)"
"##;
        let theme = parse_yaml(yaml).expect("Should parse custom theme");
        assert_eq!(theme.name, "crazy-bananas");
        assert_eq!(theme.display_name, "Crazy Bananas");
        assert!(!theme.is_dark);
        assert!(theme.extras.is_some());
        assert!(theme.effects.is_some());
    }
}
