//! Server HTTP statis super ringan (hanya `std::net`) untuk file yang tersemat.
use std::borrow::Cow;
use std::io::{self, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

mod embedded_files {
    include!(concat!(env!("OUT_DIR"), "/embedded.rs"));
}

/// Cari file di dalam binary.
pub fn embedded(path: &str) -> Option<&'static [u8]> {
    embedded_files::FILES.iter().find(|(p, _)| *p == path).map(|(_, b)| *b)
}

pub fn embedded_count() -> usize {
    embedded_files::FILES.len()
}

/// Folder yang diperiksa untuk menimpa `questions.json` dan `assets/*`
/// tanpa membangun ulang: folder kerja, lalu folder file .exe.
fn override_dirs() -> &'static Vec<PathBuf> {
    static DIRS: OnceLock<Vec<PathBuf>> = OnceLock::new();
    DIRS.get_or_init(|| {
        let mut v = Vec::new();
        if let Ok(cwd) = std::env::current_dir() {
            v.push(cwd);
        }
        if let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())) {
            if !v.contains(&dir) {
                v.push(dir);
            }
        }
        v
    })
}

fn read_override(rel: &str) -> Option<Vec<u8>> {
    if rel != "questions.json" && !rel.starts_with("assets/") {
        return None;
    }
    for base in override_dirs() {
        let p = base.join(rel);
        if p.is_file() {
            if let Ok(bytes) = std::fs::read(&p) {
                return Some(bytes);
            }
        }
    }
    None
}

/// Ambil file: versi eksternal (jika ada) diutamakan, lalu versi tersemat.
pub fn load(rel: &str) -> Option<Cow<'static, [u8]>> {
    if let Some(bytes) = read_override(rel) {
        return Some(Cow::Owned(bytes));
    }
    embedded(rel).map(Cow::Borrowed)
}

fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Ubah target URL menjadi path relatif yang aman, atau `None` bila ditolak.
pub fn resolve(target: &str) -> Option<String> {
    let path = target.split(|c: char| c == '?' || c == '#').next().unwrap_or("");
    if path == "/" || path.is_empty() {
        return Some("index.html".to_string());
    }
    let decoded = percent_decode(path.strip_prefix('/')?)?;
    if decoded.is_empty() || decoded.contains(|c: char| c == '\\' || c == ':' || c == '\0') {
        return None;
    }
    if decoded.split('/').any(|seg| seg.is_empty() || seg == "." || seg == "..") {
        return None;
    }
    Some(decoded)
}

pub fn mime(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn respond(
    s: &mut TcpStream,
    code: u16,
    reason: &str,
    ctype: &str,
    cache: &str,
    body: &[u8],
    head_only: bool,
) -> io::Result<()> {
    let head = format!(
        "HTTP/1.1 {code} {reason}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nCache-Control: {cache}\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
        body.len()
    );
    s.write_all(head.as_bytes())?;
    if !head_only {
        s.write_all(body)?;
    }
    s.flush()
}

fn plain(s: &mut TcpStream, code: u16, reason: &str) -> io::Result<()> {
    respond(s, code, reason, "text/plain; charset=utf-8", "no-store", reason.as_bytes(), false)
}

fn handle(mut s: TcpStream) -> io::Result<()> {
    s.set_read_timeout(Some(Duration::from_secs(5)))?;
    s.set_write_timeout(Some(Duration::from_secs(30)))?;

    let started = Instant::now();
    let mut buf = [0u8; 8192];
    let mut n = 0;
    loop {
        // Batas total membaca header, agar klien yang mengirim sangat lambat tidak menahan thread.
        if started.elapsed() > Duration::from_secs(10) {
            return plain(&mut s, 408, "Request Timeout");
        }
        let r = s.read(&mut buf[n..])?;
        if r == 0 {
            break;
        }
        n += r;
        if buf[..n].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
        if n == buf.len() {
            return plain(&mut s, 431, "Request Header Fields Too Large");
        }
    }

    let head = String::from_utf8_lossy(&buf[..n]);
    let mut parts = head.lines().next().unwrap_or("").split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");

    let head_only = match method {
        "GET" => false,
        "HEAD" => true,
        _ => return plain(&mut s, 405, "Method Not Allowed"),
    };

    // Pengecekan kesehatan untuk platform hosting.
    if target.split(|c: char| c == '?' || c == '#').next() == Some("/healthz") {
        return respond(&mut s, 200, "OK", "text/plain; charset=utf-8", "no-store", b"ok", head_only);
    }

    let rel = match resolve(target) {
        Some(r) => r,
        None => return plain(&mut s, 400, "Bad Request"),
    };

    match load(&rel) {
        Some(body) => {
            let cache = if rel.starts_with("assets/") { "public, max-age=86400" } else { "no-cache" };
            respond(&mut s, 200, "OK", mime(&rel), cache, &body, head_only)?;
        }
        None => plain(&mut s, 404, "Not Found")?,
    }
    let _ = s.shutdown(Shutdown::Write);
    Ok(())
}

/// Jumlah koneksi yang sedang diproses.
static ACTIVE: AtomicUsize = AtomicUsize::new(0);

struct Guard;
impl Drop for Guard {
    fn drop(&mut self) {
        ACTIVE.fetch_sub(1, Ordering::SeqCst);
    }
}

pub const DEFAULT_MAX_CONNECTIONS: usize = 256;

/// Jalankan server tanpa henti dengan batas koneksi bawaan.
pub fn serve(listener: TcpListener) {
    serve_with_limit(listener, DEFAULT_MAX_CONNECTIONS)
}

/// Satu thread per koneksi; bila batas tercapai, koneksi baru dijawab 503.
pub fn serve_with_limit(listener: TcpListener, max: usize) {
    for stream in listener.incoming() {
        let mut stream = match stream {
            Ok(s) => s,
            Err(_) => continue,
        };
        if ACTIVE.load(Ordering::SeqCst) >= max {
            // Baca sedikit permintaan agar penutupan koneksi tidak memicu reset di sisi klien.
            let _ = stream.set_read_timeout(Some(Duration::from_millis(100)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
            let mut tmp = [0u8; 1024];
            let _ = stream.read(&mut tmp);
            let _ = plain(&mut stream, 503, "Service Unavailable");
            continue;
        }
        ACTIVE.fetch_add(1, Ordering::SeqCst);
        thread::spawn(move || {
            let _guard = Guard;
            let _ = handle(stream);
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;

    #[test]
    fn root_maps_to_index() {
        assert_eq!(resolve("/").as_deref(), Some("index.html"));
        assert_eq!(resolve("/?x=1").as_deref(), Some("index.html"));
    }

    #[test]
    fn decodes_and_normalizes() {
        assert_eq!(resolve("/assets/a%20b.png?v=2").as_deref(), Some("assets/a b.png"));
        assert_eq!(resolve("/questions.json").as_deref(), Some("questions.json"));
    }

    #[test]
    fn rejects_traversal_and_oddities() {
        for bad in ["/../x", "/%2e%2e/x", "/a/../b", "/a//b", "/a\\b", "/C:/x", "/%zz", "/assets/", "/%00"] {
            assert_eq!(resolve(bad), None, "{bad}");
        }
    }

    #[test]
    fn mime_types() {
        assert_eq!(mime("a.PNG"), "image/png");
        assert_eq!(mime("app.js"), "text/javascript; charset=utf-8");
        assert_eq!(mime("noext"), "application/octet-stream");
    }

    #[test]
    fn core_files_are_embedded() {
        for f in ["index.html", "app.js", "data.js", "helpers.js", "scoring.js", "state.js", "theme.js", "style.css", "questions.json"] {
            assert!(embedded(f).is_some(), "{f} tidak tersemat");
        }
    }

    fn spawn_server(max: usize) -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || serve_with_limit(listener, max));
        addr
    }

    fn http(addr: SocketAddr, raw: &str) -> String {
        let mut s = TcpStream::connect(addr).unwrap();
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut out = Vec::new();
        let _ = s.read_to_end(&mut out);
        String::from_utf8_lossy(&out).into_owned()
    }

    #[test]
    fn healthz_responds_ok() {
        let addr = spawn_server(64);
        let r = http(addr, "GET /healthz HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(r.starts_with("HTTP/1.1 200 OK"), "{r}");
        assert!(r.ends_with("ok"), "{r}");
    }

    #[test]
    fn head_has_no_body() {
        let addr = spawn_server(64);
        let r = http(addr, "HEAD /healthz HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(r.starts_with("HTTP/1.1 200 OK"), "{r}");
        assert!(r.ends_with("\r\n\r\n"), "{r}");
    }

    #[test]
    fn serves_index_and_error_codes() {
        let addr = spawn_server(64);
        let index = http(addr, "GET / HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(index.starts_with("HTTP/1.1 200 OK") && index.contains("Giganta Exam Simulator"));
        assert!(http(addr, "GET /tidak-ada.js HTTP/1.1\r\n\r\n").starts_with("HTTP/1.1 404"));
        assert!(http(addr, "POST / HTTP/1.1\r\n\r\n").starts_with("HTTP/1.1 405"));
        assert!(http(addr, "GET /../x HTTP/1.1\r\n\r\n").starts_with("HTTP/1.1 400"));
    }

    #[test]
    fn rejects_when_connection_limit_reached() {
        let addr = spawn_server(0);
        let r = http(addr, "GET /healthz HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(r.starts_with("HTTP/1.1 503"), "{r}");
    }
}
