# KK-360 Performance — Penilaian Kinerja 360° Jaringan Gerakan Keling Kumang

Aplikasi web pengganti Google Form "Lembaran Penilaian Kinerja Jaringan Gerakan Keling Kumang".
Dibangun **murni di atas Google Apps Script + Google Sheets + HtmlService**, dikelola lewat
**clasp + GitHub Actions**. Login berbasis **NIA + PIN + OTP** (bukan akun Google).

Dokumen sumber kebenaran: `docs/FRD_Aplikasi_Penilaian_Kinerja_360_Keling_Kumang_v1.2.docx` (11 bab + lampiran).

---

## 1. Arsitektur singkat

| Lapis | Teknologi |
|---|---|
| Backend/runtime | Google Apps Script (V8), tanpa server terpisah |
| Database | 1 Google Spreadsheet, 17 sheet (lihat `SCHEMA` di `src/Utils.gs`) |
| Frontend | `HtmlService` + `google.script.run`, CSS custom (palet Keling Kumang), Chart.js via cdnjs |
| Auth | NIA + PIN (hash SHA-256 + pepper di Script Properties) + OTP email; sesi UUID di `CacheService` (TTL 8 jam) |
| Notifikasi | `MailApp` |
| Concurrency | `LockService` pada seluruh operasi tulis kritis |
| Performa | Master Data & Tabel Referensi Level Jabatan di-cache sebagai JSON di `PropertiesService`/`CacheService`, di-refresh saat impor roster |
| CI/CD | GitHub Actions → `clasp push` (develop/staging) & `clasp push + clasp deploy` (main/produksi) |

### Struktur repo

```
/
├── src/
│   ├── appsscript.json      # manifest (rootDir clasp = src/)
│   ├── Code.gs              # doGet, include(), setup()/reseed (router — lihat Asumsi #1)
│   ├── Auth.gs              # login NIA, PIN, OTP, sesi, perangkat dikenal
│   ├── MasterData.gs        # impor roster, validasi, Tabel Referensi Level Jabatan, deteksi hierarki, cache
│   ├── Period.gs            # periode penilaian + generateAssignments_
│   ├── QuestionBank.gs      # bank pertanyaan INVICTUS, kalibrasi, Teknis Kepemimpinan
│   ├── Assessment360.gs     # alur Penilaian 360°
│   ├── Interview.gs         # Wawancara Appraisal Tahunan + seed bank pertanyaan wawancara
│   ├── Validation.gs        # straight-lining, kalibrasi gagal, laporan kualitas data, audit reader
│   ├── Notification.gs      # pengingat H-3/H-1, ringkasan progres Admin
│   ├── Triggers.gs          # instalasi time-driven trigger harian
│   ├── Report.gs            # agregasi skor INVICTUS, dashboard, laporan individu/agregat, ekspor
│   ├── Utils.gs             # helper umum, konstanta, SCHEMA Google Sheets
│   ├── Login.html           # shell SPA (memuat Dashboard/Assessment/Interview/Report + seluruh client JS)
│   ├── Dashboard.html       # beranda 3 menu + panel Admin (fragment)
│   ├── Assessment.html      # daftar tugas + wizard 360° (fragment)
│   ├── Interview.html       # daftar sesi + form wawancara (fragment)
│   ├── Report.html          # dashboard laporan (fragment)
│   └── Styles.html          # CSS, di-include lewat <?!= include('Styles') ?>
├── tests/                   # unit test Jest (logika murni)
├── .github/workflows/deploy.yml
└── docs/FRD_...v1.2.docx
```

---

## 2. Setup dari nol (untuk HCMD / ITD)

### 2.1 Prasyarat lokal

```bash
npm install -g @google/clasp
npm install            # devDependencies: jest, clasp
clasp login            # buat ~/.clasprc.json (JANGAN commit)
```

### 2.2 Buat Apps Script Project & tautkan

Opsi A — proyek baru:
```bash
clasp create --type webapp --title "KK-360 Performance" --rootDir src
# clasp menulis scriptId ke .clasp.json; commit .clasp.json TANPA kredensial
```
Opsi B — sudah ada scriptId: edit `.clasp.json`, ganti `GANTI_DENGAN_SCRIPT_ID_ANDA`.

```bash
clasp push        # unggah seluruh src/ ke Apps Script
```

### 2.3 Bootstrap database & seed data

Di editor Apps Script (Extensions ▸ Apps Script), jalankan fungsi berikut **sekali**, berurutan:

1. `setup()` — membuat Spreadsheet database baru, menyimpan `SPREADSHEET_ID` + `OTP_PEPPER`
   ke **Script Properties**, membuat 17 sheet + header, lalu seed:
   - `referensi_level_jabatan` (pola awal Lampiran F)
   - `kategori_core_value` (8 dimensi INVICTUS) + `pertanyaan_360` (24 butir + 2 kalibrasi + 6 teknis) + `opsi_jawaban_teknis`
   - `pertanyaan_wawancara` (contoh Lampiran G)
2. `setAdminNias("<NIA_admin_1>,<NIA_admin_2>")` — daftar NIA yang mendapat hak **Admin/Super Admin**
   (di luar status kepegawaian pada Master Data, sesuai Bab 3 FRD).
3. `installTriggers()` — memasang trigger harian 07:00 `Asia/Pontianak` untuk pengingat & ringkasan progres.

> Jika `SPREADSHEET_ID` sudah ada dan ingin memakai Spreadsheet lain, ubah manual di
> **Project Settings ▸ Script Properties**, lalu jalankan `reseedAll()`.

### 2.4 Deploy Web App

Deploy ▸ New deployment ▸ **Web app**:
- **Execute as:** Me
- **Who has access:** Anyone (even anonymous)

Bagikan URL `/exec` ke aktivis.

### 2.5 Impor roster aktivis pertama kali

1. Upload `Data_Aktivis_[Bulan]_[Tahun].xlsx` ke Google Drive, **buka sebagai Google Sheets**, salin ID Spreadsheet-nya.
2. Login aplikasi sebagai NIA Admin ▸ **Panel Admin ▸ Impor Roster**:
   - tempel ID Spreadsheet sumber, isi nama tab (mis. `Agustus`)
   - klik **Pratinjau (dry-run)** → cek laporan validasi (NIA duplikat, kolom kosong, format NIA, jabatan baru)
   - bila bersih, klik **Impor & Berlakukan**
   - Kolom sumber yang dibaca: `NIA, NAMA AKTIVIS, UNIT, BO, AREA, JABATAN` (+ `EMAIL` opsional).
   - **BR-11:** impor dengan NIA duplikat **ditahan** (tidak diberlakukan) sampai dikoreksi.
3. Tinjau **jabatan "perlu dipetakan"** di Panel Admin, tambahkan pola ke Tabel Referensi Level Jabatan bila perlu.

### 2.6 Membuka periode penilaian

Panel Admin ▸ **Periode Penilaian** ▸ buat periode (`jenis = 360` atau `wawancara`, isi tenggat) ▸ set status **aktif**.
Mengaktifkan periode otomatis menjalankan `detectHierarchy_()` lalu `generateAssignments_()` (360) atau
`generateInterviewSessions_()` (wawancara).

### 2.7 Deploy manual (fallback tanpa CI)

```bash
clasp push
clasp deploy --description "manual $(date +%F)"
```

---

## 3. CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`:
- **job `test`** — `npm test` (Jest) untuk setiap push & PR ke `main`.
- **job `deploy`** (hanya `push`):
  - branch `develop` → `clasp push --force` (staging)
  - branch `main` → `clasp push --force && clasp deploy` (produksi)

### GitHub Secrets yang wajib diisi

| Secret | Isi |
|---|---|
| `CLASP_CREDENTIALS` | seluruh isi berkas `~/.clasprc.json` hasil `clasp login` |
| `CLASP_SCRIPT_ID` | Script ID Apps Script Project |

**Jangan pernah** commit `.clasprc.json` / `clasprc.json` — sudah masuk `.gitignore`.

---

## 4. Pengujian

```bash
npm test
```

Cakupan unit test (logika murni, tanpa layanan Apps Script):
- `tests/resolveLevelJabatan.test.js` — pemetaan teks jabatan → Level Jabatan + pemicu Teknis (FR-09).
- `tests/utils.test.js` — normalisasi & validasi format NIA (teks, alfanumerik), `average_`/`round2_`, `shuffle_`, `cleanText_`, `toBool_`.
- `tests/score.test.js` — ambang `predikat_` dan pola agregasi skor per dimensi (BR-07).

Fungsi yang bergantung pada `SpreadsheetApp`/`MailApp`/`CacheService` **tidak** diuji otomatis;
harness `tests/helpers/loadGs.js` men-stub layanan Google seperlunya untuk fungsi murni.
Uji end-to-end (impor roster, submit 360°, OTP email, ekspor) dilakukan **manual** di lingkungan staging.

---

## 5. Aturan bisnis kunci yang ditegakkan di server

| Kode | Ringkasan | Lokasi |
|---|---|---|
| BR-10 | Tidak boleh menilai/dinilai lintas Unit Bisnis | `generateAssignments_`, `a360ListTasks`, `a360OpenTask` |
| BR-11 | NIA unik; impor duplikat ditahan | `importRosterFromSheet_` |
| BR-12 | OTP dikirim ke email pemilik NIA (Master Data), bukan pihak yang login | `Auth._issueOtp_` |
| BR-04 / FR-24 | Seksi Teknis hanya bila relasi = bawahan→atasan **atau** `is_trigger_teknis = TRUE` | `a360OpenTask` |
| BR-05 | Kalibrasi gagal **tidak** memblokir submit, hanya flag | `a360SubmitTask` + `evaluateSubmissionQuality_` |
| BR-07 | Skor dimensi mengecualikan butir kalibrasi | `computeScores_` (hanya butir `core_value`) |
| BR-13 | Pasangan wawancara = hierarki 360°; sesi terkunci setelah 2 konfirmasi | `generateInterviewSessions_`, `ivConfirmSession` |

---

## 6. Asumsi yang diambil selama pembangunan

1. **File router `Code.gs`.** Diagram struktur pada prompt tidak menyebut file pemegang
   `doGet`/`include`. Apps Script mewajibkannya, jadi ditambahkan `src/Code.gs`. Seluruh
   logika bisnis tetap di modul sesuai Bagian 3 prompt.
2. **`appsscript.json` berada di `src/`**, bukan root repo. `clasp` mensyaratkan manifest
   berada di dalam `rootDir`. `rootDir` diset ke `src/`.
3. **PIN 6 digit angka** dipakai sebagai kredensial utama (prompt menyebut "PIN/password").
   Hash PIN disimpan di **Script Properties** (`pin_<NIA>`), bukan di Sheet, agar tidak
   ikut terekspor pada laporan/ekspor Excel.
4. **"Perangkat dikenal"** = fingerprint acak yang disimpan browser di `localStorage`
   (`kk360_device`) dan hash-nya dicatat di Script Properties (`dev_<NIA>`, maks. 5).
   Login dari perangkat yang hash-nya belum tercatat memicu OTP (FR-04/BR-12).
5. **Peran fungsional** (Aktivis/Pimpinan) diturunkan dari Level Jabatan hasil pemetaan;
   **Admin/Super Admin** ditentukan eksplisit lewat `setAdminNias(...)` (Script Property `ADMIN_NIAS`).
6. **Urutan Tabel Referensi Level Jabatan**: pola "Pratama/Plt/Junior/Asisten" ditaruh
   **sebelum** "Pimpinan Menengah" umum, sehingga "Plt Branch Manager" → *Pimpinan Menengah
   (Pratama)*. Prompt Bagian 6.3 menuliskan urutan terbalik; Admin dapat menata ulang
   baris via Panel Admin.
7. **Deteksi hierarki**: Staf pada satu `bo` → atasan = pemegang level pimpinan pada `bo`
   yang sama (fallback: pimpinan pada `area` yang sama); Pimpinan Menengah → atasan =
   level lebih tinggi pada `area` yang sama (fallback: Pimpinan Puncak pada `unit` yang sama).
   Baris `sumber = koreksi_manual_admin` tidak pernah ditimpa saat deteksi ulang.
8. **Peer assignment**: rekan dengan `unit + bo + level` yang sama; diambil acak sebanyak
   `PEER_MIN` (Script Property, default 2). Bila anggota grup ≤ `PEER_MIN`, semua dinilai.
9. **Ekspor Excel** = tautan ekspor bawaan Google Sheets (`/export?format=xlsx`) untuk
   seluruh database (Admin). **Ekspor PDF laporan individu** dibuat via
   `Utilities.newBlob(html).getAs('application/pdf')` dan dikirim ke client sebagai
   data URI base64 (tanpa akses Drive).
10. **`riwayat_mutasi_aktivis`** dicatat saat impor roster mengubah `jabatan_text`/`bo`/`area`
    (FR-11), memakai `berlaku_sejak_periode` = periode 360 aktif saat impor (kosong bila tidak ada).
11. Butir kalibrasi disimpan di `pertanyaan_360` dengan `id` tetap `kal_core` / `kal_teknis`
    dan `tipe = kalibrasi`; jawabannya ikut ditulis ke `jawaban_360` untuk keperluan audit,
    namun dikecualikan dari seluruh perhitungan skor.

---

## 7. Konfigurasi (Script Properties)

| Key | Wajib | Default | Keterangan |
|---|---|---|---|
| `SPREADSHEET_ID` | ya | — | dibuat otomatis oleh `setup()` |
| `OTP_PEPPER` | ya | dibuat `setup()` | garam hash OTP & PIN |
| `ADMIN_NIAS` | ya | — | NIA admin, dipisah koma |
| `PEER_MIN` | tidak | `2` | minimal rekan selevel yang dinilai (BR-03) |
| `SELF_APPRAISAL_AKTIF` | tidak | `TRUE` | aktif/nonaktif form self-appraisal wawancara (FR-30) |

---

## 8. Non-Goals (belum dikerjakan, sesuai Bagian 9 prompt)

- Modul penggajian / rekrutmen / HRIS lain.
- Migrasi database ke luar Google Sheets (skema sudah dipisah rapi agar mudah dimigrasikan).
- Native mobile app (cukup web responsif mobile-first).
