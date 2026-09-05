# Ai-Chan Development Plan

Dokumen perencanaan arsitektur, roadmap bertahap, dan checklist pengembangan proyek Ai-Chan berdasarkan struktur proyek yang sedang berjalan.

---

## 1. Project Overview
- **Nama Proyek**: Ai-Chan
- **Tujuan**: Membangun asisten AI modular berbasis Node.js yang dapat digunakan melalui admin web dan dikembangkan untuk platform lain seperti Telegram.
- **Prinsip Utama**:
  - Modular dan decoupled: setiap modul memiliki entry point, manifest, konfigurasi, dan lifecycle sendiri.
  - Satu proses Node.js yang ringan dengan komunikasi antarmodul melalui fungsi JavaScript.
  - Provider AI, adapter platform, dan antarmuka admin tetap terpisah agar dapat dikembangkan secara independen.

---

## 2. Arsitektur Dasar

```
aichan/
├── index.js                         # Root orchestrator dan entry point aplikasi
├── package.json                     # Konfigurasi root Node.js ESM
├── admin_web/
│   ├── index.js                     # HTTP server dan API admin
│   ├── package.json                 # Manifest modul admin web
│   └── interface/
│       ├── index.html               # Dashboard, playground, dan modal konfigurasi
│       ├── script.js                # Interaksi UI dan pemanggilan API
│       └── style.css                # Gaya antarmuka admin
├── aistudio/
│   ├── index.js                     # Provider Google Gemini
│   ├── config.json                  # API key provider
│   └── package.json                 # Dependency @google/genai
├── chatgpt/
│   ├── index.js                     # Provider OpenAI ChatGPT
│   ├── config.json                  # API key provider
│   └── package.json                 # Dependency openai
├── main/
│   ├── index.js                     # Modul utama dan lifecycle aplikasi
│   ├── config.js                    # Akses konfigurasi root data/config
│   ├── package.json                 # Manifest modul utama
│   └── storage/                     # Database dan repository storage
├── telegram/
│   ├── index.js                     # Adapter Telegram dan lifecycle modul
│   ├── config.json                  # API key dan owner ID Telegram
│   └── package.json                 # Manifest modul Telegram
├── PLAN.md                          # Dokumen perencanaan
└── README.md                        # Dokumentasi dan panduan ringkas
```

---

## 3. Roadmap Pengembangan

### Fase 1: Fondasi Runtime & Kontrak Modul
- [x] Tetapkan Node.js dengan ES modules sebagai runtime dan format kode utama.
- [x] Buat entry point root yang menginisialisasi `main` dan `aistudio`, lalu mendaftarkan modul terkait ke `admin_web`.
- [x] Tetapkan kontrak modul melalui `manifest`, `start()`, `stop()`, dan `status()`.
- [ ] Tambahkan scripts root untuk menjalankan aplikasi, pemeriksaan sintaks, dan pengujian.

### Fase 2: Provider AI & Konfigurasi
- [x] Implementasikan adapter Google Gemini menggunakan `@google/genai` di modul `aistudio`.
- [x] Implementasikan adapter OpenAI ChatGPT menggunakan `openai` di modul `chatgpt`.
- [x] Ambil daftar model secara dinamis dari API provider; frontend tidak menyimpan daftar model hardcoded.
- [x] Sediakan konfigurasi provider melalui `aistudio/config.json` dan dukungan model pada `generate()`.
- [ ] Tambahkan validasi konfigurasi, timeout, penanganan error, dan retry yang terkontrol pada request AI.
- [ ] Tambahkan abstraction provider yang memungkinkan provider AI lain mengikuti kontrak `generate()` yang sama.
- [x] Tambahkan manajemen riwayat percakapan pada request provider; batas konteks masih ditunda.

### Fase 3: Admin Web, Adapter, Eksekusi, & Database
- [x] Implementasikan admin web berbasis Node.js `http` tanpa framework tambahan.
- [x] Sediakan API untuk daftar modul, baca/simpan konfigurasi, dan pengujian prompt melalui `/api/generate`.
- [x] Sediakan UI dashboard dan AI chat playground untuk menguji modul `aistudio`.
- [ ] Hubungkan modul `telegram` ke Telegram Bot API dan teruskan pesan ke provider AI.
- [ ] Tambahkan validasi payload request dan response pada API admin serta adapter platform.
- [ ] Rancang registry tool yang dapat mendaftarkan dan menjalankan fungsi dengan schema input/output yang tervalidasi.
- [ ] Tetapkan SQLite sebagai storage awal dan `main` sebagai pemilik lifecycle serta akses database.
- [x] Tambahkan dependency database di `main/` dan tentukan lokasi data, backup, serta kebijakan retensi.
- [x] Rancang kontrak storage berbasis fungsi/repository untuk daftar `chat_id`, log pesan human/AI, dan system prompt berkode unik agar `telegram`, `aistudio`, dan `admin_web` tidak mengakses SQL secara langsung.
- [x] Implementasikan koneksi database dan migration/schema setelah desain storage disetujui.
- [x] Tambahkan endpoint admin dan UI untuk daftar chat, detail log pesan, prompt berdasarkan codename, pencarian, pagination, dan penghapusan setelah storage API dan kontrol akses tersedia.
- [x] Pusatkan akses konfigurasi di `main` melalui root `data/config/` dan teruskan konfigurasi ke setiap modul melalui dependency injection.

### Fase 4: Operasional & Polishing
- [ ] Tambahkan endpoint atau tampilan health check untuk status root, provider, admin web, dan adapter Telegram.
- [ ] Tambahkan logging terstruktur untuk startup, request, error, dan perubahan konfigurasi.
- [ ] Amankan konfigurasi sensitif dengan environment variables atau secret storage; jangan menyimpan API key di repository.
- [ ] Tambahkan pengujian unit dan integration untuk lifecycle modul, API admin, konfigurasi, dan alur generate.
- [ ] Siapkan scripts deployment dan process manager seperti PM2 atau Docker setelah alur lokal stabil.

---

## 4. Current Sprint Checklist

- [x] Inisialisasi Git repository dan remote GitHub pada branch `main`.
- [x] Susun dokumen perencanaan proyek (`PLAN.md`).
- [x] Tetapkan tech stack saat ini: Node.js, ES modules, native HTTP server, dan Google Gemini SDK.
- [x] Siapkan struktur modul aktif: `admin_web/`, `main/`, `aistudio/`, `chatgpt/`, dan `telegram/`.
- [x] Implementasikan dashboard admin, konfigurasi module, dan AI playground dasar.
- [x] Tentukan arah database awal: SQLite dikelola oleh modul `main`.
- [x] Sediakan discovery model provider melalui API admin dengan metadata capability yang dinormalisasi.
- [x] Finalisasi desain chat storage, system prompt catalog, lokasi data, backup, retensi log, dan batas akses antarmodul.
- [x] Rancang system prompt dengan `codename` unik, isi prompt, status aktif, dan metadata perubahan.
- [x] Implementasikan database tables untuk chat, message logs, dan system prompts serta storage API pada fase berikutnya.
- [x] Implementasikan endpoint serta UI untuk chat ID list, message logs, dan pengelolaan system prompt setelah storage API siap.
- [x] Implementasikan config service untuk menyimpan konfigurasi modul di root `data/config/`.
- [x] Kirim chat history ke provider tanpa mencampurkannya dengan system prompt; batas history belum diterapkan.
- [ ] Tambahkan root scripts untuk menjalankan dan memvalidasi aplikasi.
- [ ] Selesaikan integrasi Telegram dan validasi konfigurasi.
- [ ] Tambahkan pengujian dasar serta logging dan health check.
