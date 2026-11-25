//! Menyematkan seluruh isi folder `web/` ke dalam binary.
//! File dengan isi identik (mis. gambar kembar) hanya disimpan satu kali.
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

fn walk(dir: &Path, root: &Path, out: &mut Vec<(String, PathBuf)>) {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("tidak bisa membaca {}: {e}", dir.display()))
        .filter_map(|e| e.ok())
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, root, out);
        } else {
            let rel = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            out.push((rel, path));
        }
    }
}

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let root = manifest.join("web");
    println!("cargo:rerun-if-changed=web");
    println!("cargo:rerun-if-changed=build.rs");

    let mut files = Vec::new();
    walk(&root, &root, &mut files);

    let mut blob_of: HashMap<Vec<u8>, usize> = HashMap::new();
    let mut blob_paths: Vec<PathBuf> = Vec::new();
    let mut table: Vec<(String, usize)> = Vec::new();

    for (rel, path) in &files {
        let bytes = fs::read(path).unwrap();
        let idx = match blob_of.get(&bytes) {
            Some(&i) => i,
            None => {
                let i = blob_paths.len();
                blob_paths.push(path.clone());
                blob_of.insert(bytes, i);
                i
            }
        };
        table.push((rel.clone(), idx));
    }

    let mut code = String::new();
    for (i, p) in blob_paths.iter().enumerate() {
        code.push_str(&format!(
            "static B{i}: &[u8] = include_bytes!({:?});\n",
            p.to_string_lossy().replace('\\', "/")
        ));
    }
    code.push_str("pub static FILES: &[(&str, &[u8])] = &[\n");
    for (rel, idx) in &table {
        code.push_str(&format!("    ({rel:?}, B{idx}),\n"));
    }
    code.push_str("];\n");

    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("embedded.rs");
    fs::File::create(out).unwrap().write_all(code.as_bytes()).unwrap();
}
