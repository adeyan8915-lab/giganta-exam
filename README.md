# Giganta Exam Simulator: Rust Edition (v4.5.0)

Satu program Rust tanpa dependensi eksternal. Seluruh aplikasi web (HTML, JS, CSS, `questions.json`, dan 75 gambar soal) tersemat di dalam satu binary, jadi tidak perlu Live Server atau Node.

## Build dan jalankan
Butuh Rust (https://rustup.rs). Tidak ada crate yang diunduh.

    cargo test                 # jalankan semua tes
    cargo build --release      # hasil: target/release/giganta-exam(.exe)
    ./target/release/giganta-exam

Program membuka browser ke http://127.0.0.1:5501/ (pindah port otomatis bila terpakai).

## Opsi
    --port N     port tertentu
    --no-open    jangan buka browser
    --host ADDR  alamat yang didengarkan (bawaan 127.0.0.1)
    --check      validasi bank soal lalu keluar

## Deploy
Bila variabel `PORT` diisi (seperti di Render), program berjalan dalam mode server: 0.0.0.0:PORT, tanpa membuka browser, dengan endpoint `/healthz`. Lihat `DEPLOY.md`.

## Mengubah soal tanpa build ulang
Letakkan `questions.json` dan/atau folder `assets/` di folder kerja atau di sebelah program. Isi eksternal diutamakan dan divalidasi saat program mulai.
Untuk mengubah isi permanen, edit folder `web/` lalu `cargo build --release`.

## Struktur
    build.rs         menyematkan web/ ke binary (file identik disimpan sekali)
    src/main.rs      CLI, validasi awal, peluncur browser
    src/server.rs    server HTTP statis (std::net), pemetaan path aman
    src/bank.rs      validasi bank soal (padanan data.js)
    src/scoring.rs   skor (padanan scoring.js, referensi teruji)
    src/json.rs      parser JSON minimal
    web/             aplikasi web asli, tidak diubah
    Dockerfile, render.yaml, .dockerignore   untuk deploy container

## Catatan
- Server hanya mendengarkan 127.0.0.1 (tidak terbuka ke jaringan), metode GET/HEAD saja.
- Font Google di `index.html` butuh internet; offline otomatis memakai font sistem.
- Cetak/PDF pembahasan tetap memakai fungsi cetak browser.
- `tests/app.test.js` versi lama menyebut 10 mata kuliah dan 1.155 soal, padahal `questions.json` berisi 12 mata kuliah dan 1.380 soal. Tes Rust memakai angka yang benar.
