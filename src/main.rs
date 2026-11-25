//! Giganta Exam Simulator: satu binary ringan, tanpa dependensi eksternal.
mod bank;
mod json;
mod scoring;
mod server;

use std::net::TcpListener;
use std::process::{exit, Command};

const DEFAULT_PORT: u16 = 5501;

const HELP: &str = "\
Giganta Exam Simulator

Pemakaian: giganta-exam [opsi]

  --port N     gunakan port N (bawaan 5501, otomatis pindah bila terpakai)
  --host ALAMAT  alamat yang didengarkan (bawaan 127.0.0.1)
  --no-open    jangan buka browser otomatis
  --check      validasi bank soal lalu keluar
  -h, --help   tampilkan bantuan

Mode server: bila variabel lingkungan PORT diisi (seperti di Render), program
mendengarkan 0.0.0.0:PORT dan tidak membuka browser.

Letakkan questions.json atau folder assets/ di folder kerja / sebelah program
untuk menimpa isi yang tersemat tanpa membangun ulang.
";

fn open_browser(url: &str) {
    #[cfg(target_os = "windows")]
    let result = Command::new("cmd").args(["/C", "start", "", url]).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(url).spawn();
    if result.is_err() {
        eprintln!("Tidak bisa membuka browser otomatis. Buka alamat ini secara manual: {url}");
    }
}

/// Validasi bank soal yang akan benar-benar disajikan dan periksa gambarnya.
fn check_bank() -> Result<bank::Bank, String> {
    let raw = server::load("questions.json").ok_or("questions.json tidak ditemukan")?;
    let text = std::str::from_utf8(&raw).map_err(|_| "questions.json bukan UTF-8 yang valid".to_string())?;
    let bank = bank::validate(text)?;
    let mut missing = 0;
    for s in &bank.subjects {
        for q in &s.soal {
            if let Some(g) = &q.gambar {
                if server::load(g).is_none() {
                    missing += 1;
                    eprintln!("Peringatan: gambar tidak ditemukan: {g}");
                }
            }
        }
    }
    if missing > 0 {
        eprintln!("Peringatan: {missing} gambar hilang.");
    }
    Ok(bank)
}

fn main() {
    let mut port: Option<u16> = None;
    let mut host: Option<String> = None;
    let mut open = true;
    let mut check_only = false;

    // Platform hosting (Render, dll.) memberi tahu port lewat variabel PORT.
    let env_port: Option<u16> = std::env::var("PORT").ok().and_then(|v| v.trim().parse().ok());

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => match args.next().and_then(|v| v.parse::<u16>().ok()) {
                Some(p) => port = Some(p),
                None => {
                    eprintln!("--port membutuhkan angka 0-65535");
                    exit(2);
                }
            },
            "--host" => match args.next() {
                Some(h) => host = Some(h),
                None => {
                    eprintln!("--host membutuhkan alamat, misalnya 0.0.0.0");
                    exit(2);
                }
            },
            "--no-open" => open = false,
            "--check" => check_only = true,
            "-h" | "--help" => {
                print!("{HELP}");
                return;
            }
            other => {
                eprintln!("Opsi tidak dikenal: {other}\n\n{HELP}");
                exit(2);
            }
        }
    }

    let loaded = match check_bank() {
        Ok(b) => b,
        Err(e) => {
            eprintln!("{e}");
            exit(1);
        }
    };
    println!(
        "Giganta Exam Simulator v{} | {} mata kuliah, {} soal, {} file tersemat",
        env!("CARGO_PKG_VERSION"),
        loaded.subjects.len(),
        loaded.total_questions(),
        server::embedded_count()
    );
    if check_only {
        println!("Validasi bank soal: OK");
        return;
    }

    let host = host.unwrap_or_else(|| {
        if env_port.is_some() { "0.0.0.0".to_string() } else { "127.0.0.1".to_string() }
    });
    let explicit_port = port.or(env_port);

    let listener = match explicit_port {
        Some(p) => TcpListener::bind((host.as_str(), p)).unwrap_or_else(|e| {
            eprintln!("Port {p} pada {host} tidak bisa dipakai: {e}");
            exit(1);
        }),
        None => TcpListener::bind((host.as_str(), DEFAULT_PORT))
            .or_else(|_| TcpListener::bind((host.as_str(), 0)))
            .unwrap_or_else(|e| {
                eprintln!("Tidak bisa membuka port: {e}");
                exit(1);
            }),
    };
    let addr = listener.local_addr().expect("alamat server");

    let loopback = host == "127.0.0.1" || host == "localhost";
    if loopback {
        let url = format!("http://127.0.0.1:{}/", addr.port());
        println!("Berjalan di {url}  (tutup jendela ini atau tekan Ctrl+C untuk berhenti)");
        if open && env_port.is_none() {
            open_browser(&url);
        }
    } else {
        println!("Mode server: mendengarkan di {addr}  (Ctrl+C untuk berhenti)");
    }
    server::serve(listener);
}
