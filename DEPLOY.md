# Panduan Deploy ke Render

Aplikasi ini murni statis dan progres tiap pengguna disimpan di browser masing-masing, jadi satu instance cukup untuk banyak orang.

## 0. Uji lokal dulu (disarankan)
Di PowerShell, dari folder proyek:

    cargo test
    $env:PORT = 8080
    cargo run --release

Program masuk mode server (0.0.0.0:8080, tanpa membuka browser). Buka http://localhost:8080/ dan http://localhost:8080/healthz (harus menampilkan `ok`). Windows Firewall mungkin meminta izin; boleh pilih jaringan privat. Hentikan dengan Ctrl+C.

Bila Docker Desktop terpasang, uji juga image-nya:

    docker build -t giganta-exam .
    docker run --rm -p 8080:10000 giganta-exam

## 1. Unggah ke GitHub
1. Buat akun di github.com, lalu buat repository baru (boleh private).
2. Dari folder proyek:

       git init
       git add .
       git commit -m "Giganta Exam Simulator v4.5.0"
       git branch -M main
       git remote add origin https://github.com/USERNAME/NAMA-REPO.git
       git push -u origin main

   Pastikan `Cargo.lock` ikut ter-commit (jangan dimasukkan ke .gitignore). Folder `target/` tidak ikut karena sudah diabaikan.

## 2. Buat layanan di Render
1. Daftar di render.com, lalu hubungkan akun GitHub Anda.
2. Klik **New +** lalu **Web Service**, pilih repository tadi.
3. Isi: **Language/Runtime: Docker**, **Branch: main**, dan pilih **Instance Type** (cek halaman harga Render untuk paket terbaru).
4. Buka **Advanced**, atur **Health Check Path** ke `/healthz`.
5. Klik **Create Web Service** dan tunggu build selesai (beberapa menit untuk build pertama).
6. Render memberi alamat HTTPS seperti `https://giganta-exam-xxxx.onrender.com`. Bagikan alamat itu.

Alternatif: gunakan **New +** lalu **Blueprint** untuk memakai `render.yaml` di repository. Bila paket `free` ditolak, ubah baris `plan:` sesuai paket yang tersedia.

## 3. Memperbarui
Setiap `git push` ke branch `main` memicu build dan deploy ulang otomatis. Untuk mengubah soal, ganti `web/questions.json` (dan gambar di `web/assets/`), lalu commit dan push.

## Catatan
- Paket gratis umumnya menidurkan layanan saat sepi, sehingga akses pertama setelah lama bisa lambat. Syarat paket sering berubah, jadi periksa dokumentasi Render.
- Server membatasi 256 koneksi bersamaan dan menjawab 503 bila penuh. Platform menyediakan HTTPS dan perlindungan dasar di depannya.
- Pastikan Anda berhak menyebarkan materi soal (bersumber dari modul kuliah) sebelum dipublikasikan.
