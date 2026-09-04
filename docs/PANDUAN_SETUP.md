# Panduan Setup KK-360 Performance — Langkah demi Langkah

Panduan ini mengurutkan **seluruh langkah dari nol** sampai aplikasi bisa dipakai
aktivis: menyiapkan Google Apps Script (GAS), menghubungkan `clasp`, memasang
repo GitHub + CI/CD, menginisialisasi database, deploy web app, dan operasional
periode pertama.

Ikuti berurutan. Tanda ⏱️ = dilakukan sekali saat instalasi; 🔁 = rutin ke depan.

Ringkasan alur:

```
BAGIAN A  Siapkan akun & Apps Script Project        ⏱️
BAGIAN B  Hubungkan komputer lokal via clasp        ⏱️
BAGIAN C  Push kode pertama ke Apps Script          ⏱️
BAGIAN D  Inisialisasi database (setup / seed)      ⏱️
BAGIAN E  Impor roster aktivis pertama              ⏱️
BAGIAN F  Deploy Web App                            ⏱️
BAGIAN G  Repo GitHub + Secrets + CI/CD             ⏱️
BAGIAN H  Operasional periode pertama              🔁
BAGIAN I  Update rutin ke depan                    🔁
BAGIAN J  Troubleshooting
```

Perkiraan waktu total instalasi: 45–60 menit.

---

## Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Akun Google | **Disarankan akun khusus sistem** (mis. `it-kk360@domain-anda`), bukan akun pribadi. Semua Web App berjalan "Execute as: Me" akun ini, dan email OTP dikirim dari akun ini. Pastikan kuota `MailApp` cukup (akun Workspace: 1.500 email/hari; akun gmail biasa: 100/hari). |
| Node.js ≥ 18 | untuk `clasp` + menjalankan test. Unduh: <https://nodejs.org> |
| Git | untuk GitHub. Unduh: <https://git-scm.com> |
| Akun GitHub | pemilik/kolaborator repo `CUKK360`. |
| Berkas roster | `Data_Aktivis_[Bulan]_[Tahun].xlsx` dari HCMD (kolom: NO, NIA, NAMA AKTIVIS, UNIT, BO, AREA, JABATAN). |

---

## BAGIAN A — Akun & Apps Script Project ⏱️

### A1. Login ke akun Google sistem
Buka browser, login **hanya** dengan akun Google sistem yang akan memiliki proyek ini.

### A2. Aktifkan Google Apps Script API
1. Buka <https://script.google.com/home/usersettings>
2. Nyalakan **"Google Apps Script API"** → ON.
   (Wajib agar `clasp` bisa push/pull.)

### A3. Buat Apps Script Project
Ada 2 cara — **pilih salah satu**:

**Cara 1 (disarankan): lewat `clasp` di Bagian B** — lompat ke Bagian B, `clasp create` akan membuat project sekaligus.

**Cara 2: manual**
1. Buka <https://script.google.com> → **New project**.
2. Rename jadi `KK-360 Performance`.
3. Catat **Script ID**: menu ⚙️ **Project Settings** → "IDs" → salin *Script ID*.
4. Lanjut ke Bagian B (pakai `clasp clone <SCRIPT_ID>`).

> Anda **tidak perlu** menyalin file `.gs`/`.html` satu per satu secara manual —
> `clasp push` (Bagian C) yang mengunggah seluruh isi folder `src/`.

---

## BAGIAN B — Hubungkan lokal via clasp ⏱️

Jalankan di terminal, di folder repo (`.../penkin-cukk`):

```bash
# B1. Install dependency
npm install -g @google/clasp
npm install                      # jest + clasp lokal untuk test

# B2. Login clasp (buka browser, pilih akun Google sistem yang sama)
clasp login
#  → membuat berkas ~/.clasprc.json  (JANGAN commit — sudah di .gitignore)

# B3a. Kalau BELUM punya project (Cara 1 Bagian A):
clasp create --type webapp --title "KK-360 Performance" --rootDir src
#  → clasp menulis scriptId ke .clasp.json

# B3b. Kalau SUDAH punya Script ID (Cara 2 Bagian A):
#  Edit .clasp.json, ganti "GANTI_DENGAN_SCRIPT_ID_ANDA" dengan Script ID Anda.
#  Isi file jadi:  { "scriptId": "1AbC...", "rootDir": "src" }
```

Verifikasi `.clasp.json` sudah benar:
```bash
cat .clasp.json
# { "scriptId": "1AbC...xyz", "rootDir": "src" }
```

---

## BAGIAN C — Push kode pertama ⏱️

```bash
# C1. Jalankan test dulu (harus lulus 51/51)
npm test

# C2. Unggah seluruh src/ ke Apps Script
clasp push
#  → "Pushed 18 files."  (12 .gs + 5 .html + appsscript.json)

# C3. Buka project di browser untuk verifikasi
clasp open
```

Di editor Apps Script, pastikan file berikut muncul:
`Code, Utils, Auth, MasterData, Period, QuestionBank, Assessment360, Interview,
Validation, Notification, Triggers, Report` (12 script) dan
`Login, Dashboard, Assessment, Interview, Report, Styles` (6 HTML).

---

## BAGIAN D — Inisialisasi database ⏱️

Semua di **editor Apps Script** (pilih fungsi di dropdown atas, klik **Run**).
Saat pertama kali Run, Google minta **Authorize access** → pilih akun sistem →
"Advanced" → "Go to KK-360 Performance (unsafe)" → **Allow**. Ini normal (scope:
Spreadsheet, Gmail, Script, Drive).

| Urutan | Fungsi | Hasil |
|---|---|---|
| D1 | `setup` | Membuat Spreadsheet **"KK-360 Performance — Database"**, menyimpan `SPREADSHEET_ID` + `OTP_PEPPER` ke Script Properties, membuat **17 sheet** + header, seed tabel referensi level jabatan, 8 kategori INVICTUS, 24+2+6 pertanyaan, contoh pertanyaan wawancara. Lihat log: `setup() selesai. SPREADSHEET_ID=...` |
| D2 | `setAdminNias` | **Perlu argumen.** Klik ▸ di sebelah tombol Run tidak menyediakan input argumen di editor baru — sebagai gantinya edit sementara baris pemanggilan, ATAU lihat cara di bawah. |
| D3 | `installTriggers` | Memasang trigger harian 07:00 Asia/Pontianak (pengingat H-3/H-1 + ringkasan progres Senin). |

### D2 — cara mengisi NIA Admin
Editor Apps Script baru tidak punya kolom argumen. Dua opsi:

**Opsi A — via Script Properties (paling mudah):**
1. ⚙️ **Project Settings** → **Script Properties** → **Add script property**
2. Property: `ADMIN_NIAS` — Value: `010020000002,010921100266` (NIA admin ITD/HCMD, dipisah koma, tanpa spasi)
3. Save.

**Opsi B — fungsi sekali pakai:** tambahkan sementara di `Code.gs`:
```js
function _isiAdmin() { return setAdminNias('010020000002,010921100266'); }
```
`clasp push`, Run `_isiAdmin`, lalu hapus lagi.

### D4 — verifikasi
Buka Spreadsheet database (URL ada di log D1 atau Drive akun sistem). Pastikan
ada 17 tab: `aktivis, riwayat_mutasi_aktivis, referensi_level_jabatan,
hierarki_terdeteksi, otp_log, periode_penilaian, kategori_core_value,
pertanyaan_360, opsi_jawaban_teknis, penugasan_penilaian, jawaban_360,
pertanyaan_wawancara, sesi_wawancara, jawaban_wawancara, rencana_tindak_lanjut,
audit_log` (+ tab `referensi_level_jabatan` sudah terisi 3 baris, `pertanyaan_360`
terisi 32 baris).

---

## BAGIAN E — Impor roster aktivis pertama ⏱️

> **Kenapa lewat editor, bukan aplikasi?** Impor lewat Panel Admin butuh login
> admin; login admin butuh NIA admin sudah ada di sheet `aktivis`. Telur-ayam.
> Maka impor **pertama** dijalankan dari editor.

### E1. Upload roster ke Google Sheets
1. Upload `Data_Aktivis_Agus_2026.xlsx` ke Drive akun sistem.
2. Klik kanan → **Open with → Google Sheets** (mengubah jadi format Sheets).
3. Dari URL Sheets, salin **ID**-nya:
   `https://docs.google.com/spreadsheets/d/`**`ID_DI_SINI`**`/edit#gid=0`
4. Catat juga nama tab-nya (mis. `Agustus`).

### E2. Set Script Properties untuk bootstrap impor
⚙️ **Project Settings → Script Properties → Add**:
| Property | Value |
|---|---|
| `BOOTSTRAP_ROSTER_SHEET_ID` | ID Spreadsheet dari E1 |
| `BOOTSTRAP_ROSTER_TAB` | `Agustus` (kosongkan bila mau tab pertama) |

### E3. Pratinjau (dry-run)
Editor → pilih fungsi **`firstImportDryRun`** → **Run**. Cek log:
- `niaDuplikat` harus **kosong** (kalau ada → koreksi berkas di HCMD dulu, BR-11).
- `kolomWajibKosong`, `formatNiaTidakSesuai` → tinjau.
- `jabatanBaru` → daftar jabatan yang belum terpetakan (wajar, ditangani di Bagian H).

### E4. Berlakukan
Pilih fungsi **`firstImport`** → **Run**. Log menampilkan:
`ditambahBaru`, `diperbarui`, `dinonaktifkan`. Cek sheet `aktivis` terisi ± 789 baris.

### E5. (opsional) hapus Script Property bootstrap
Setelah sukses, `BOOTSTRAP_ROSTER_SHEET_ID` boleh dibiarkan (dipakai lagi bulan
depan bila mau impor cepat dari editor) atau dihapus.

---

## BAGIAN F — Deploy Web App ⏱️

1. Editor Apps Script → tombol **Deploy** (kanan atas) → **New deployment**.
2. ⚙️ (Select type) → **Web app**.
3. Isi:
   - **Description:** `KK-360 produksi v1`
   - **Execute as:** **Me** (akun sistem)
   - **Who has access:** **Anyone** *(atau "Anyone, even anonymous" bila opsi itu muncul)*
4. **Deploy** → **Authorize access** bila diminta.
5. Salin **Web app URL** (berakhiran `/exec`). Inilah tautan untuk aktivis.
6. Uji: buka URL di jendela samaran (incognito) → harus muncul layar Login NIA.

> **Setiap kali deploy versi baru** (manual): Deploy → **Manage deployments** →
> pilih deployment produksi → ✏️ → **Version: New version** → **Deploy**. URL tetap sama.
> Kalau pakai CI (Bagian G), langkah ini otomatis.

---

## BAGIAN G — Repo GitHub + CI/CD ⏱️

### G1. Buat repo kosong di GitHub
<https://github.com/new> → Owner `kekiusmaximus404`, nama **`CUKK360`**,
**JANGAN** centang "Add README / .gitignore / license". **Create repository.**

### G2. Hubungkan & push
Di folder repo lokal:
```bash
git remote -v                       # cek: origin sudah ke .../CUKK360.git ?
# kalau belum:
git remote add origin https://github.com/kekiusmaximus404/CUKK360.git

git push -u origin main
#  → login Git Credential Manager dengan akun GitHub yang punya akses tulis
```

### G3. Ambil kredensial clasp untuk Secret
```bash
# Windows PowerShell:
Get-Content $HOME\.clasprc.json -Raw
# Git Bash / macOS / Linux:
cat ~/.clasprc.json
```
Salin **seluruh isi** (satu baris JSON, ada `token`, `client_id`, dst.).

### G4. Set GitHub Secrets
Repo GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `CLASP_CREDENTIALS` | seluruh isi `~/.clasprc.json` dari G3 |
| `CLASP_SCRIPT_ID` | Script ID (dari `.clasp.json` / Project Settings) |

### G5. Cara kerja CI (`.github/workflows/deploy.yml`)
| Aksi Anda | Yang terjadi di GitHub Actions |
|---|---|
| `git push` ke branch **`develop`** | job `test` (jest) → `clasp push --force` (staging) |
| `git push` / merge PR ke branch **`main`** | job `test` → `clasp push --force` → `clasp deploy` (produksi) |
| buka Pull Request ke `main` | job `test` saja (tanpa deploy) |

### G6. (opsional) branch & deployment staging
```bash
git checkout -b develop
git push -u origin develop
```
Untuk memisahkan staging & produksi, buat **dua deployment** di Apps Script
(satu "produksi", satu "staging") dan sesuaikan `clasp deploy --deploymentId ...`
di workflow bila perlu. Untuk skala saat ini, satu deployment produksi + `clasp push`
staging sudah cukup.

### G7. Uji CI
Ubah hal kecil (mis. komentar di `README.md`), lalu:
```bash
git add -A && git commit -m "test CI" && git push
```
Buka tab **Actions** di GitHub → pastikan job `test` hijau; untuk push ke `main`,
job `deploy` juga jalan dan `clasp deploy` sukses.

---

## BAGIAN H — Operasional periode pertama 🔁

Sekarang semua lewat **aplikasi web** (URL `/exec`).

### H1. Aktivasi akun Admin
1. Buka URL aplikasi → **Aktivasi akun / Lupa PIN**.
2. Masukkan NIA admin → **Kirim OTP**.
3. Cek email terdaftar NIA itu (kolom `email` di sheet `aktivis` — bila kosong,
   isi manual dulu di sheet, lalu Run `refreshMasterCache_` di editor).
4. Masukkan OTP + buat **PIN 6 digit** → masuk.
5. Panel **"Panel Admin / HCMD"** muncul di Beranda.

### H2. Tinjau jabatan belum terpetakan
Panel Admin → bagian **Tabel Referensi Level Jabatan** → baca daftar
"jabatan perlu dipetakan". Tambahkan pola bila ada jabatan pimpinan yang belum
tertangkap, contoh:
- Pola `Manager Keling Kumang Hotel` → level `Pimpinan Menengah`, ✔ trigger teknis
- Pola `Deputi` → level `Pimpinan Puncak`, ✔ trigger teknis

Sisanya yang memang staf boleh dibiarkan (default `Staf Pelaksana`).

### H3. (opsional) impor ulang roster via UI
Setelah admin bisa login, impor bulan berikutnya cukup:
Panel Admin → **Impor Roster** → tempel ID Spreadsheet + nama tab →
**Pratinjau (dry-run)** → bila bersih → **Impor & Berlakukan**.

### H4. Buat & buka periode Penilaian 360°
Panel Admin → **Periode Penilaian**:
1. Nama: `Penilaian 360 Tahun 2026`, jenis `360°`, isi tanggal mulai & **tenggat**.
2. **Buat Periode**.
3. Klik tombol **`aktif`** pada baris periode → konfirmasi.
   → sistem otomatis menjalankan **deteksi hierarki** + **generate penugasan**
   (self, peer ≥2, atasan↔bawahan). Toast menampilkan jumlah baris dibuat.

### H5. Buat & buka periode Wawancara (opsional, terpisah)
Sama seperti H4, jenis `Wawancara`. Aktivasi → sistem membentuk **Sesi Wawancara**
per pasangan atasan–bawahan (mengikuti hierarki 360° — BR-13).

### H6. Uji sebagai aktivis biasa
Login dengan NIA non-admin (aktivasi PIN dulu) → cek:
- **Penilaian 360°**: daftar tugas hanya berisi aktivis **unit yang sama**;
  buka satu tugas → isi 24 butir INVICTUS (+ Teknis bila menilai pimpinan/atasan)
  → **Kirim**.
- **Pertanyaan Wawancara**: sesi sebagai atasan / bawahan muncul.
- **Laporan**: lihat skor diri sendiri (radar 8 dimensi).

### H7. Pantau progres
- **Beranda** → kartu "Progres Periode Berjalan" (per unit/area).
- Trigger harian mengirim pengingat H-3 & H-1 ke yang belum selesai, dan
  ringkasan progres ke Admin tiap Senin.
- Admin bisa **Kirim Pengingat Sekarang** dari Panel Admin untuk uji.

### H8. Menutup periode
Setelah tenggat: Panel Admin → set periode ke **`tutup`**. Data pengisian terkunci
(bisa dibuka lagi dengan set balik ke `aktif` bila perlu koreksi).

### H9. Laporan & ekspor
Menu **Laporan**:
- **Individu**: radar INVICTUS, Self vs Peer vs Atasan vs Bawahan, skor Teknis,
  ringkasan wawancara. Tombol **Unduh PDF**.
- **Agregat**: peringkat per BO / Area / Unit. Tombol **Ekspor Excel**
  (mengunduh seluruh database sebagai `.xlsx`).
- **Kualitas Data**: gagal kalibrasi, straight-lining, NIA duplikat, jabatan
  belum dipetakan (untuk IAD/HCMD).

---

## BAGIAN I — Update rutin ke depan 🔁

### I1. Ubah kode aplikasi
```bash
git checkout -b fitur/xyz          # kerja di branch
# ...edit src/...
npm test                           # pastikan lulus
git add -A && git commit -m "..."
git push -u origin fitur/xyz
```
Buka PR ke `main` → CI jalan `test`. Merge → CI otomatis `clasp push` + `clasp deploy`.
**Tanpa CI:** `clasp push` lalu Deploy → Manage deployments → New version.

### I2. Ubah bank pertanyaan / tabel referensi di kode
Seed bersifat idemponten (hanya menulis bila sheet kosong). Bila mengubah isi
`QuestionBank.gs` / `Interview.gs` / `DEFAULT_LEVEL_REF`:
1. `clasp push`.
2. Editor → Run **`reseedAll`** — untuk pertanyaan yang sudah ada perlu dihapus
   dulu barisnya di sheet, atau kelola lewat sheet langsung (Admin boleh edit sheet).

### I3. Impor roster bulanan
Upload xlsx baru → Sheets → Panel Admin ▸ Impor Roster ▸ dry-run ▸ Berlakukan.
Perubahan jabatan/BO/area tercatat otomatis di `riwayat_mutasi_aktivis`.
NIA yang hilang dari roster baru → `status_aktif = FALSE`.
Setelah impor, bila periode 360 sedang aktif dan struktur berubah signifikan,
jalankan ulang generate: set periode ke `draft` lalu `aktif` lagi (penugasan
yang sudah `selesai` dipertahankan).

### I4. Rotasi kredensial
- OTP pepper (`OTP_PEPPER`) **jangan diubah** setelah ada PIN aktif (semua PIN jadi invalid).
- Bila `~/.clasprc.json` di-regenerate (`clasp login` ulang), perbarui Secret `CLASP_CREDENTIALS`.

---

## BAGIAN J — Troubleshooting

| Gejala | Sebab & solusi |
|---|---|
| `clasp push` → "User has not enabled the Apps Script API" | Buka <https://script.google.com/home/usersettings>, ON-kan API. Tunggu 1–2 menit. |
| `clasp push` → "Project settings not found" / scriptId salah | Cek `.clasp.json` → `scriptId` benar & `rootDir` = `src`. |
| Run `setup` → "SPREADSHEET_ID belum di-set" | Wajar sebelum `setup()` sukses. Jalankan `setup` sekali; kalau error di tengah, jalankan lagi (idemponten). |
| Login aplikasi → "NIA tidak ditemukan" untuk NIA yang ada di xlsx | Roster belum diimpor / cache basi. Jalankan `firstImport` (atau `refreshMasterCache_`) di editor. |
| OTP tidak masuk | Kolom `email` di sheet `aktivis` kosong/salah → isi manual, Run `refreshMasterCache_`. Cek kuota `MailApp` (Editor → Executions). Cek folder spam. |
| "Sesi formulir kedaluwarsa" saat submit 360 | Formulir dibiarkan > 3 jam. Buka ulang tugas dari daftar. |
| Seksi Teknis tidak muncul padahal menilai pimpinan | Pola jabatan pimpinan itu belum ada di `referensi_level_jabatan` atau `is_trigger_teknis` = FALSE. Tambah/ubah pola di Panel Admin. |
| Web App menampilkan halaman kosong/putih | Deploy versi lama, atau `include('Styles')` gagal. Deploy **New version**. Cek Editor → Executions untuk error `doGet`. |
| GitHub push → "Repository not found" | Repo `CUKK360` belum dibuat di GitHub, atau akun yang login tidak punya akses. Buat repo kosong dulu (G1). |
| CI job `deploy` gagal "Login failed" | Secret `CLASP_CREDENTIALS` tidak valid / kedaluwarsa. `clasp login` ulang lokal, salin `~/.clasprc.json` baru ke Secret. |
| Skor dimensi terasa rendah semua | Cek Laporan Kualitas Data — banyak straight-lining / kalibrasi gagal? Butir kalibrasi TIDAK ikut skor (BR-07), jadi bukan itu sebabnya. |
| Apps Script "Exceeded maximum execution time" saat laporan agregat | Data `jawaban_360` sangat besar. Untuk skala besar, jadwalkan agregasi via trigger & simpan hasil ke sheet ringkasan (peningkatan mendatang). |

---

## Lampiran — Daftar fungsi editor yang dijalankan manual

| Fungsi | Kapan | Bagian |
|---|---|---|
| `setup` | sekali saat instalasi | D1 |
| `setAdminNias('nia1,nia2')` *(atau Script Property `ADMIN_NIAS`)* | sekali / saat ganti admin | D2 |
| `installTriggers` | sekali (pasang trigger harian) | D3 |
| `removeTriggers` | bila ingin menghentikan pengingat otomatis | — |
| `firstImportDryRun` | sebelum impor roster pertama | E3 |
| `firstImport` | impor roster pertama | E4 |
| `reseedAll` | setelah mengubah bank pertanyaan di kode | I2 |
| `refreshMasterCache_` | setelah mengedit sheet `aktivis`/`referensi_level_jabatan` manual | J |

---

## Lampiran — Daftar Script Properties

| Key | Wajib | Diisi oleh | Keterangan |
|---|---|---|---|
| `SPREADSHEET_ID` | ✔ | `setup()` | ID Spreadsheet database |
| `OTP_PEPPER` | ✔ | `setup()` | garam hash OTP & PIN — **jangan diubah** |
| `ADMIN_NIAS` | ✔ | manual / `setAdminNias` | NIA admin, dipisah koma |
| `PEER_MIN` | — | manual | minimal rekan selevel dinilai (default 2) |
| `SELF_APPRAISAL_AKTIF` | — | manual | `TRUE`/`FALSE` — form self-appraisal wawancara |
| `BOOTSTRAP_ROSTER_SHEET_ID` | — | manual | ID Spreadsheet roster untuk `firstImport` |
| `BOOTSTRAP_ROSTER_TAB` | — | manual | nama tab roster (default: tab pertama) |
