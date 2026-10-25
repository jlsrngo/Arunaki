//! Arunaki Project File System Module (Pure Rust)
//!
//! Provides isolated, safe filesystem access strictly bound to the active project folder.
//! Agent CANNOT read or write files outside the designated workspace directory.

use std::fs;
use std::path::{Path, PathBuf};

fn resolve_safe_path(base_dir: &str, relative_path: &str) -> Result<PathBuf, String> {
    let base = Path::new(base_dir).canonicalize().map_err(|e| format!("Invalid project directory: {}", e))?;
    let target = base.join(relative_path);
    
    // Normalize target path without symlink escapes
    let normalized = if target.exists() {
        target.canonicalize().map_err(|e| e.to_string())?
    } else {
        // If file doesn't exist yet, check its parent
        if let Some(parent) = target.parent() {
            if parent.exists() {
                parent.canonicalize().map_err(|e| e.to_string())?.join(target.file_name().unwrap_or_default())
            } else {
                target
            }
        } else {
            target
        }
    };

    if !normalized.starts_with(&base) {
        return Err("Path traversal violation: Access outside active project folder is strictly forbidden.".to_string());
    }

    Ok(normalized)
}

#[derive(serde::Serialize, Debug)]
pub struct ProjectFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: String,
}

#[tauri::command]
pub fn list_project_files(directory: String) -> Result<Vec<ProjectFileEntry>, String> {
    let base = Path::new(&directory);
    if !base.is_dir() {
        return Err("Project directory does not exist or is not a folder".to_string());
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(base).map_err(|e| e.to_string())?;

    for item in read_dir.flatten() {
        let path = item.path();
        let name = item.file_name().to_string_lossy().to_string();
        
        // Skip hidden dotfiles and node_modules / target directories for efficiency
        if name.starts_with('.') || name == "node_modules" || name == "target" {
            continue;
        }

        let is_dir = path.is_dir();
        let size = if is_dir { 0 } else { item.metadata().map(|m| m.len()).unwrap_or(0) };
        let extension = path.extension().unwrap_or_default().to_string_lossy().to_string();

        entries.push(ProjectFileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            size,
            extension,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_project_file(directory: String, relative_path: String) -> Result<String, String> {
    let safe_path = resolve_safe_path(&directory, &relative_path)?;
    fs::read_to_string(&safe_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_project_file(directory: String, relative_path: String, content: String) -> Result<usize, String> {
    let safe_path = resolve_safe_path(&directory, &relative_path)?;
    if let Some(parent) = safe_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }
    fs::write(&safe_path, &content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(content.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_and_safe_path() {
        let current_dir = std::env::current_dir().unwrap().to_string_lossy().to_string();
        let files = list_project_files(current_dir.clone()).unwrap();
        assert!(!files.is_empty());
        
        // Test traversal protection
        let err = read_project_file(current_dir, "../../escaped.txt".to_string());
        assert!(err.is_err());
    }
}
