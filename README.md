# HYFE eSIM Trial Web

Aplikasi Next.js/TypeScript untuk menjalankan flow pendaftaran HYFE eSIM Trial melalui UI web yang terpandu. Implementasi ini mem-port urutan request dari `hyfe_esim_flow_v4_browser.py` ke Route Handler server-side yang kompatibel dengan Vercel.

> Gunakan hanya untuk data Anda sendiri dan proses yang Anda berwenang lakukan. Layanan upstream dapat mengubah endpoint atau skemanya tanpa pemberitahuan.

## Fitur

- Wizard responsif untuk membuat sesi, mencari dan memilih nomor, memasukkan identitas, consent, OTP, dan konfirmasi submit.
- State upstream berumur pendek disegel dengan AES-256-GCM dalam cookie HTTP-only; data identitas, OTP, dan CAPTCHA tidak disimpan di database atau browser storage.
- Kontrol eksplisit sebelum mencatat consent, meminta OTP, dan melakukan submit akhir satu kali.
- CAPTCHA manual: aplikasi tidak membuat, memecahkan, mengambil, atau melewati CAPTCHA. Anda sendiri yang menyelesaikan CAPTCHA dari layanan resmi dan memasukkan respons yang sah.
- Submit akhir tidak memiliki retry otomatis. Bila time out, periksa status melalui layanan resmi sebelum memulai sesi baru.
- Skrip referensi Python `hyfe_esim_flow.py` dan `hyfe_esim_flow_v4_browser.py` tetap dipertahankan tanpa perubahan.

## Menjalankan secara lokal

Prasyarat: Node.js 20.9 atau yang lebih baru.

```bash
npm install
cp .env.example .env.local
openssl rand -base64 32
```

Salin hasil perintah terakhir ke `FLOW_STATE_ENCRYPTION_KEY` di `.env.local`.

```dotenv
FLOW_STATE_ENCRYPTION_KEY=hasil-base64-32-byte-anda
```

Jalankan aplikasi:

```bash
npm run dev
```

Buka `http://localhost:3000`.

## Validasi

```bash
npm run lint
npm test
npm run build
```

## Deploy ke Vercel

1. Push kode ini ke GitHub lalu impor repositori `rezkym/hyfexl` di dashboard Vercel.
2. Pilih framework **Next.js**; tidak perlu mengubah build command atau output directory.
3. Tambahkan Environment Variable Production bernama `FLOW_STATE_ENCRYPTION_KEY`. Nilainya wajib base64 dari tepat 32 random bytes, misalnya hasil `openssl rand -base64 32`.
4. Deploy. Vercel akan menjalankan `npm run build` dan menyediakan Route Handler di `/api/flow/*`.

Secara opsional, gunakan variabel berikut hanya bila endpoint upstream resmi berpindah:

```dotenv
HYFE_BASE_URL=https://prioritas.xl.co.id
HYFE_API_URL=https://jupiter-ms-webprio-v2.ext.dp.xl.co.id
```

Jangan memasukkan cookie, bearer token, OTP, token CAPTCHA, atau data pelanggan ke Environment Variable Vercel.

## Arsitektur dan privasi

Browser hanya berbicara ke API yang sama-origin. Route Handler Node.js melakukan request ke layanan upstream untuk menghindari masalah CORS, sementara nilai sesi (cookie upstream, bearer token, CSRF token, TNC token, consent ID, dan pilihan nomor terenkripsi) tetap berada di cookie terenkripsi yang tidak dapat dibaca JavaScript browser.

Informasi nama, WhatsApp, email, EID, OTP, dan respons CAPTCHA berada hanya di memori halaman sampai diperlukan oleh request terkait. Respons upstream mentah tidak dicatat atau dikirim kembali ke browser; UI hanya menampilkan ringkasan hasil yang aman.

## Catatan operasional

- Token CAPTCHA dari browser resmi dapat ditolak oleh layanan bila tidak cocok dengan sesi upstream. Aplikasi tidak mencoba mengakali kondisi ini.
- Pencarian tanpa pola menggunakan kelompok inventori acak, sama seperti skrip Python. Coba lagi atau masukkan pola lain jika tidak ada hasil.
- Error atau timeout submit final bersifat ambigu. Jangan klik ulang atau otomatis mengulang request; cek dulu status pada layanan resmi.
