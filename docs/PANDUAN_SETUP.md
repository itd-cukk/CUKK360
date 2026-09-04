# Panduan Setup KK-360 Performance — Langkah demi Langkah

Model deployment **sama seperti project `laporan-hn` yang sudah berjalan**:

- **Backend** = Google Apps Script (Web App JSON API) + Google Sheets → di-update
  dengan **menempel isi file `gas/*.gs` ke editor Apps Script** (atau `clasp push`).
- **Frontend** = file statis (`index.html` + `css/` + `js/`) di **Cloudflare Pages**,
  tersambung ke repo **GitHub** → tiap `git push` = auto-deploy.
- Keduanya terhubung lewat `fetch(SCRIPT_URL)`; `SCRIPT_URL` = URL Web App `/exec`,
  disimpan sebagai environment variable di Cloudflare Pages.

Ikuti berurutan. ⏱️ = sekali saat instalasi; 🔁 = rutin ke depan.

```
BAGIAN A  Backend: buat Apps Script Project + tempel gas/*.gs   ⏱️
BAGIAN B  Backend: inisialisasi database (setup / seed)         ⏱️
BAGIAN C  Backend: impor roster aktivis pertama                 ⏱️
BAGIAN D  Backend: deploy Web App → dapat URL /exec             ⏱️
BAGIAN E  GitHub: buat repo + push                              ⏱️
BAGIAN F  Cloudflare Pages: connect repo + set SCRIPT_URL       ⏱️
BAGIAN G  Operasional periode pertama (di aplikasi web)        🔁
BAGIAN H  Update rutin ke depan                                🔁
BAGIAN I  Troubleshooting
```

Perkiraan waktu instalasi: 45–60 menit.

---

## Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Akun Google sistem | disarankan akun khusus (mis. `it-kk360@domain`), **bukan** akun pribadi. Web App "Execute as: Me" akun ini; email OTP terkirim dari akun ini. Kuota `MailApp`: Workspace 1.500/hari, gmail biasa 100/hari. |
| Akun GitHub | pemilik/kolaborator repo `CUKK360`. |
| Akun Cloudflare | gratis cukup. <https://dash.cloudflare.com/sign-up> |
| Git + (opsional) Node.js ≥ 18 | Node hanya untuk `npm test` / `clasp`. Tempel manual tidak butuh Node. |
| Berkas roster | `Data_Aktivis_[Bulan]_[Tahun].xlsx` dari HCMD (kolom NO, NIA, NAMA AKTIVIS, UNIT, BO, AREA, JABATAN). |

---

## BAGIAN A — Backend: Apps Script Project ⏱️

### A1. Login akun Google sistem & buat project
1. Login browser **hanya** dengan akun Google sistem.
2. Buka <https://script.google.com> → **New project**.
3. Rename → `KK-360 Performance` (klik judul kiri atas).

### A2. Isi kode — pilih salah satu cara

**Cara 1 — tempel manual (seperti `laporan-hn`, tanpa Node):**
1. Di editor, hapus file `Code.gs` bawaan (⋮ → Delete).
2. Untuk **tiap** file di folder `gas/` repo ini, buat file baru di editor
   (**＋ → Script**) dengan nama **persis tanpa `.gs`**, lalu tempel seluruh isinya:

   | Buat file (editor) | Dari berkas repo |
   |---|---|
   | `00_Config` | `gas/00_Config.gs` |
   | `01_Utils` | `gas/01_Utils.gs` |
   | `02_Auth` | `gas/02_Auth.gs` |
   | `03_MasterData` | `gas/03_MasterData.gs` |
   | `04_Period` | `gas/04_Period.gs` |
   | `05_QuestionBank` | `gas/05_QuestionBank.gs` |
   | `06_Assessment360` | `gas/06_Assessment360.gs` |
   | `07_Interview` | `gas/07_Interview.gs` |
   | `08_Validation` | `gas/08_Validation.gs` |
   | `09_Notification` | `gas/09_Notification.gs` |
   | `10_Triggers` | `gas/10_Triggers.gs` |
   | `11_Report` | `gas/11_Report.gs` |
   | `12_Router` | `gas/12_Router.gs` |

3. Manifest: ⚙️ **Project Settings** → centang **"Show 'appsscript.json' manifest file in editor"**.
   Buka file `appsscript.json` yang muncul → **ganti seluruh isinya** dengan isi `gas/appsscript.json` repo.

> Urutan nomor file (00…12) penting agar mudah dirawat; Apps Script sendiri
> memuat semua file jadi satu lingkup global.

**Cara 2 — clasp (butuh Node):**
```bash
cd "<folder repo>"
npm install -g @google/clasp && npm install
# nyalakan API: https://script.google.com/home/usersettings  → ON
clasp login                      # pilih akun Google sistem
# Ambil Script ID: editor ⚙️ Project Settings → "IDs" → salin.
# Edit .clasp.json → ganti "GANTI_DENGAN_SCRIPT_ID_ANDA" dengan Script ID itu.
clasp push                       # mengunggah seluruh gas/  (rootDir sudah = gas)
npm test                         # opsional, 51 test harus lulus
```

---

## BAGIAN B — Backend: inisialisasi database ⏱️

Semua di **editor Apps Script**: pilih nama fungsi di dropdown atas → **Run**.
Saat pertama Run → **Authorize access** → pilih akun sistem → *Advanced* →
*Go to KK-360 Performance (unsafe)* → **Allow**. (Scope: Spreadsheet, Gmail, Script, Drive — wajar.)

| # | Fungsi (di file `00_Config`) | Hasil |
|---|---|---|
| B1 | **`setup`** | buat Spreadsheet **"KK-360 Performance — Database"**, simpan `SPREADSHEET_ID` + `OTP_PEPPER` ke Script Properties, buat **17 sheet** + header, seed tabel referensi level jabatan + 8 kategori INVICTUS + 24+2+6 pertanyaan + contoh pertanyaan wawancara. Lihat **Execution log**: `setup() selesai. SPREADSHEET_ID=... URL=...` |
| B2 | isi **`ADMIN_NIAS`** | ⚙️ **Project Settings → Script Properties → Add**: Property `ADMIN_NIAS`, Value `010020000002,010921100266` (NIA admin ITD/HCMD, dipisah koma, tanpa spasi). *Atau* Run `setAdminNias('010020000002,010921100266')` setelah menaruh pemanggilan sementara. |
| B3 | **`installTriggers`** | pasang trigger harian 07:00 Asia/Pontianak (pengingat H-3/H-1 + ringkasan progres tiap Senin). |

**Verifikasi:** buka URL Spreadsheet dari log B1 → ada 17 tab; tab `referensi_level_jabatan`
terisi 3 baris, `pertanyaan_360` terisi 32 baris.

---

## BAGIAN C — Backend: impor roster pertama ⏱️

> Impor **pertama** dijalankan dari editor karena impor lewat aplikasi butuh login
> admin, sedangkan login admin butuh NIA admin sudah ada di sheet `aktivis`.

### C1. Upload roster ke Google Sheets
1. Upload `Data_Aktivis_Agus_2026.xlsx` ke Drive akun sistem.
2. Klik kanan → **Open with → Google Sheets**.
3. Salin **ID** dari URL: `.../spreadsheets/d/`**`ID_DI_SINI`**`/edit`. Catat nama tab (mis. `Agustus`).

### C2. Set Script Properties
⚙️ **Project Settings → Script Properties → Add**:

| Property | Value |
|---|---|
| `BOOTSTRAP_ROSTER_SHEET_ID` | ID dari C1 |
| `BOOTSTRAP_ROSTER_TAB` | `Agustus` (kosongkan bila tab pertama) |

### C3. Pratinjau lalu berlakukan
1. Run **`firstImportDryRun`** → cek Execution log: `niaDuplikat` harus **kosong**
   (bila ada → koreksi berkas di HCMD dulu, BR-11); tinjau `kolomWajibKosong`,
   `formatNiaTidakSesuai`, `jabatanBaru`.
2. Run **`firstImport`** → log: `ditambahBaru`, `diperbarui`, `dinonaktifkan`.
   Cek sheet `aktivis` terisi ± 789 baris.

---

## BAGIAN D — Backend: deploy Web App ⏱️

1. Editor → tombol **Deploy** (kanan atas) → **New deployment**.
2. ⚙️ (Select type) → **Web app**.
3. Isi:
   - **Description:** `KK-360 produksi v1`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone** *(WAJIB — agar `/exec` mengizinkan `fetch` lintas-origin/CORS dari domain Cloudflare Pages)*
4. **Deploy** → **Authorize access** bila diminta.
5. **Salin "Web app URL"** (berakhiran `/exec`). Ini nilai untuk `SCRIPT_URL` di Bagian F.
6. Uji cepat di browser: buka `<URL>/exec?action=ping` → harus muncul
   `{"ok":true,"data":{"app":"KK-360 Performance","time":"..."}}`.

---

## BAGIAN E — GitHub ⏱️

### E1. Buat repo kosong
<https://github.com/new> → Owner `kekiusmaximus404`, nama **`CUKK360`**,
**JANGAN** centang "Add README / .gitignore / license" → **Create repository**.

### E2. Push
Di folder repo lokal:
```bash
git remote -v                                   # cek origin sudah ke .../CUKK360.git
# kalau belum ada:
git remote add origin https://github.com/kekiusmaximus404/CUKK360.git

git push -u origin main
#  → login Git Credential Manager dengan akun GitHub yang punya akses tulis
```

> Backend (`gas/`) juga ikut ter-push ke GitHub sebagai arsip versi — tapi
> **tidak** di-deploy ke Cloudflare (`_redirects` memblok `/gas/*`) dan **tidak**
> otomatis masuk Apps Script. Update Apps Script tetap manual (Bagian H).

---

## BAGIAN F — Cloudflare Pages ⏱️

### F1. Buat project Pages dari repo
1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → tab **Pages**
   → **Connect to Git** → pilih repo `CUKK360`.
2. Build settings:
   - **Framework preset:** `None`
   - **Build command:** *(kosongkan)*
   - **Build output directory:** `/`  *(root — index.html ada di root)*
3. **Save and Deploy**. Tunggu deploy pertama selesai → dapat domain `https://cukk360.pages.dev` (atau serupa).

### F2. Set environment variable SCRIPT_URL
1. Project Pages → **Settings → Environment variables** → **Add variable**
   (untuk **Production**, dan **Preview** bila ingin branch preview jalan):
   - **Variable name:** `SCRIPT_URL`
   - **Value:** URL `/exec` dari Bagian D.5
2. **Save** → menu **Deployments** → deployment terakhir → **⋯ → Retry deployment**
   (agar `_middleware.js` menyuntik nilai baru).

### F3. Uji
Buka `https://cukk360.pages.dev` → muncul layar **Login NIA**.
Bila muncul toast "URL backend belum diset": env var belum kebaca — ulangi F2,
atau sementara di Console browser jalankan
`setUrl("https://script.google.com/.../exec"); location.reload()`.

### F4. (opsional) domain kustom
Project Pages → **Custom domains** → tambah mis. `kk360.cu-kelingkumang.id`
(atur CNAME sesuai instruksi Cloudflare).

---

## BAGIAN G — Operasional periode pertama 🔁 (di aplikasi web)

### G1. Aktivasi akun Admin
1. Buka domain Pages → **Aktivasi akun / Lupa PIN** → masukkan NIA admin → **Kirim OTP**.
2. Cek email terdaftar NIA itu (kolom `email` di sheet `aktivis`; bila kosong → isi
   manual di sheet, lalu Run `refreshMasterCache_` di editor).
3. Masukkan OTP + buat **PIN 6 digit** → masuk. Panel **Admin / HCMD** muncul di Beranda.

### G2. Tinjau jabatan belum terpetakan
Panel Admin → bagian **Tabel Referensi Level Jabatan** → baca daftar "perlu dipetakan".
Tambah pola bila ada jabatan pimpinan yang belum tertangkap, mis.:
- Pola `Deputi` → level `Pimpinan Puncak`, ✔ trigger teknis
- Pola `Manager Keling Kumang Hotel` → `Pimpinan Menengah`, ✔ trigger teknis

### G3. Buat & buka periode Penilaian 360°
Panel Admin → **Periode Penilaian**:
1. Nama `Penilaian 360 Tahun 2026`, jenis `360°`, isi tanggal mulai & **tenggat** → **Buat Periode**.
2. Klik tombol **`aktif`** pada baris periode → konfirmasi.
   → otomatis menjalankan **deteksi hierarki** + **generate penugasan** (self, peer ≥2, atasan↔bawahan).

### G4. (opsional) periode Wawancara
Sama, jenis `Wawancara`. Aktivasi → sistem membentuk **Sesi Wawancara** per pasangan
atasan–bawahan mengikuti hierarki 360° (BR-13).

### G5. Uji sebagai aktivis biasa
Login NIA non-admin (aktivasi PIN dulu) → **Penilaian 360°**: daftar tugas hanya
aktivis **unit yang sama**; buka tugas → isi 24 butir INVICTUS (+ Teknis bila menilai
pimpinan/atasan) → **Kirim**. Cek menu **Laporan** (radar skor diri sendiri).

### G6. Pantau & tutup
- **Beranda** → kartu "Progres Periode Berjalan".
- Trigger harian kirim pengingat H-3 & H-1; Panel Admin → **Kirim Pengingat Sekarang** untuk uji.
- Setelah tenggat: set periode ke **`tutup`** (data terkunci; bisa dibuka lagi ke `aktif` bila perlu koreksi).

### G7. Laporan & ekspor
Menu **Laporan**: **Individu** (radar + Self/Peer/Atasan/Bawahan + PDF),
**Agregat** (peringkat per BO/Area/Unit + Ekspor Excel), **Kualitas Data**
(gagal kalibrasi, straight-lining, NIA duplikat, jabatan belum dipetakan).

---

## BAGIAN H — Update rutin ke depan 🔁

### H1. Ubah tampilan / frontend (`index.html`, `css/`, `js/`)
```bash
git add -A && git commit -m "..." && git push
```
→ Cloudflare Pages **auto-deploy** dalam ~1 menit. Selesai.

### H2. Ubah logika backend (`gas/*.gs`)
1. **Tempel** isi file yang berubah ke file yang sama di editor Apps Script
   *(atau `clasp push` bila pakai clasp)*.
2. Editor → **Deploy → Manage deployments** → pilih deployment produksi → ✏️ (Edit)
   → **Version: New version** → **Deploy**. **URL `/exec` tetap sama**.
3. `git commit` + `git push` juga (arsip versi di GitHub).

### H3. Ubah bank pertanyaan / tabel referensi di kode
Setelah H2, Run **`reseedAll`** di editor. (Untuk pertanyaan yang sudah ada, hapus
dulu barisnya di sheet, atau kelola langsung lewat sheet — Admin boleh edit sheet.)

### H4. Impor roster bulanan
Upload xlsx baru → Google Sheets → **Panel Admin → Impor Roster** → tempel ID + tab
→ **Pratinjau (dry-run)** → **Impor & Berlakukan**. Perubahan jabatan/BO/area tercatat
di `riwayat_mutasi_aktivis`; NIA yang hilang → `status_aktif=FALSE`. Bila periode 360
sedang aktif & struktur berubah besar: set periode ke `draft` lalu `aktif` lagi
(penugasan yang sudah `selesai` dipertahankan).

### H5. Jangan diubah
`OTP_PEPPER` (mengubahnya membuat semua PIN & OTP lama invalid).

---

## BAGIAN I — Troubleshooting

| Gejala | Sebab & solusi |
|---|---|
| Buka `/exec?action=ping` → halaman login Google / "butuh izin" | Web App belum di-deploy "Anyone", atau versi lama. Deploy ulang (Bagian D), pastikan *Who has access = Anyone*. |
| Aplikasi: toast "URL backend (SCRIPT_URL) belum diset" | Env var `SCRIPT_URL` di Cloudflare belum ada / deploy belum di-retry (F2). Sementara: Console → `setUrl("<url>/exec"); location.reload()`. |
| Aplikasi: "Gagal menghubungi backend" / error CORS di Console | Web App bukan "Anyone"; atau URL salah (harus `/exec`, bukan `/dev`). Fallback JSONP hanya untuk GET — POST butuh CORS terbuka. |
| Login → "NIA tidak ditemukan" untuk NIA yang ada di xlsx | Roster belum diimpor / cache basi. Run `firstImport` (atau `refreshMasterCache_`) di editor. |
| OTP tidak masuk | Kolom `email` di sheet `aktivis` kosong/salah → isi manual, Run `refreshMasterCache_`. Cek kuota `MailApp` (editor → Executions) & folder spam. |
| "Sesi formulir kedaluwarsa" saat submit 360 | Formulir dibiarkan > 3 jam. Buka ulang tugas. |
| Seksi Teknis tak muncul padahal menilai pimpinan | Pola jabatan itu belum ada di `referensi_level_jabatan` atau `is_trigger_teknis=FALSE`. Tambah/ubah di Panel Admin. |
| GitHub push → "Repository not found" | Repo `CUKK360` belum dibuat / akun tak punya akses. Buat repo kosong (E1). |
| Cloudflare Pages: file `.gs` bisa diakses publik | Pastikan `_redirects` ada di root (sudah disertakan). Bukan isu rahasia — semua kredensial di Script Properties, bukan di kode. |
| Cloudflare deploy sukses tapi halaman kosong | `Build output directory` salah (harus `/`), atau `js/app.js` error. Buka Console browser. |
| Editor: "Exceeded maximum execution time" saat laporan agregat | Data `jawaban_360` sangat besar. Untuk skala besar, jadwalkan agregasi via trigger ke sheet ringkasan (peningkatan mendatang). |

---

## Lampiran — Fungsi editor yang dijalankan manual (file `00_Config`)

| Fungsi | Kapan | Bagian |
|---|---|---|
| `setup` | sekali saat instalasi | B1 |
| `setAdminNias('nia1,nia2')` *(atau Script Property `ADMIN_NIAS`)* | sekali / ganti admin | B2 |
| `installTriggers` / `removeTriggers` | pasang / hentikan pengingat harian | B3 |
| `firstImportDryRun` → `firstImport` | impor roster pertama | C3 |
| `reseedAll` | setelah ubah bank pertanyaan di kode | H3 |
| `refreshMasterCache_` (file `03_MasterData`) | setelah edit sheet `aktivis`/`referensi_level_jabatan` manual | I |

## Lampiran — Environment variable Cloudflare Pages

| Nama | Value | Scope |
|---|---|---|
| `SCRIPT_URL` | URL Web App Apps Script (`.../exec`) | Production (+ Preview bila perlu) |

## Lampiran — Script Properties (Apps Script)

| Key | Wajib | Diisi oleh |
|---|---|---|
| `SPREADSHEET_ID` | ✔ | `setup()` |
| `OTP_PEPPER` | ✔ | `setup()` — jangan diubah |
| `ADMIN_NIAS` | ✔ | manual / `setAdminNias` |
| `PEER_MIN` | — | manual (default 2) |
| `SELF_APPRAISAL_AKTIF` | — | manual (`TRUE`/`FALSE`) |
| `BOOTSTRAP_ROSTER_SHEET_ID` / `BOOTSTRAP_ROSTER_TAB` | — | manual (untuk `firstImport`) |
