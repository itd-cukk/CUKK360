# KK-360 Performance — Penilaian Kinerja 360° Jaringan Gerakan Keling Kumang

Aplikasi web pengganti Google Form "Lembaran Penilaian Kinerja Jaringan Gerakan
Keling Kumang". Login berbasis **NIA + PIN + OTP** (bukan akun Google).

**Arsitektur (mengikuti pola project `laporan-hn`):**

```
┌──────────────────────────┐        fetch(SCRIPT_URL + '?action=...')        ┌───────────────────────────┐
│  FRONTEND (statis)        │  ────────  GET (baca) / POST (tulis)  ───────►  │  BACKEND — Google Apps     │
│  index.html + css/ + js/  │  ◄────────         JSON / JSONP        ───────  │  Script (Web App JSON API) │
│  di Cloudflare Pages      │                                                 │  gas/*.gs  +  Google Sheets │
└──────────────────────────┘                                                 └───────────────────────────┘
        ▲ auto-deploy tiap git push (integrasi Git Cloudflare)                        ▲ update: tempel gas/*.gs
                                                                                       ke editor / `clasp push`
```

| Lapis | Teknologi |
|---|---|
| Frontend | `index.html` + `css/styles.css` + `js/*.js` murni (tanpa framework). Chart.js via cdnjs. Di-host **Cloudflare Pages**, tersambung ke repo GitHub → tiap `git push` = auto-deploy. |
| Backend | Google Apps Script (V8) di-deploy sebagai **Web App** (`doGet`/`doPost` → JSON). Kode di `gas/00_Config.gs` … `gas/12_Router.gs`. |
| Database | 1 Google Spreadsheet, 17 sheet (lihat `SCHEMA` di `gas/01_Utils.gs`). |
| Komunikasi | `js/api.js`: `apiGet` (fetch, fallback JSONP) & `apiPost` (`Content-Type: text/plain` → tanpa CORS preflight). URL backend dari env `SCRIPT_URL` (disuntik `functions/_middleware.js`). |
| Auth | NIA + PIN (hash SHA-256 + pepper di Script Properties) + OTP email; sesi UUID di `CacheService` (TTL 8 jam). |
| Notifikasi | `MailApp` |
| Concurrency | `LockService` pada semua operasi tulis kritis |
| Performa | Master Data & Tabel Referensi Level Jabatan di-cache JSON di `PropertiesService`/`CacheService`, refresh saat impor roster |

### Struktur repo

```
/
├── index.html                 shell SPA (semua layar inline)
├── favicon.ico
├── _redirects                 Cloudflare Pages: blok /gas /tests /docs dari akses publik
├── css/
│   └── styles.css
├── js/
│   ├── config.js              getUrl() / SESSION / DEVICE_ID
│   ├── api.js                 apiGet / apiPost / JSONP fallback
│   ├── util.js                $ / el / esc / toast / busy
│   ├── auth.js                login NIA + PIN + OTP + sesi
│   ├── home.js                Beranda (progres + badge) & Panel Admin
│   ├── assessment.js          Penilaian 360°: daftar + wizard
│   ├── interview.js           Wawancara Appraisal: daftar + form
│   ├── report.js              Laporan: individu (radar/bar) + agregat + kualitas
│   └── app.js                 router nav() + bootstrap (dimuat terakhir)
├── functions/
│   └── _middleware.js         Cloudflare Pages Function — suntik window.__SCRIPT_URL__
├── gas/                        BACKEND — di-deploy ke Apps Script (bukan ke Cloudflare)
│   ├── appsscript.json        manifest (TZ Asia/Pontianak, webapp, oauthScopes)
│   ├── 00_Config.gs           jr() JSON/JSONP + entry-point Admin (setup/firstImport/reseed/setAdminNias)
│   ├── 01_Utils.gs            helper umum, konstanta, SCHEMA 17 sheet
│   ├── 02_Auth.gs             login/PIN/OTP/sesi/perangkat dikenal
│   ├── 03_MasterData.gs       impor roster + validasi, resolveLevelJabatan_, deteksi hierarki, cache
│   ├── 04_Period.gs           periode + generateAssignments_
│   ├── 05_QuestionBank.gs     bank pertanyaan INVICTUS / kalibrasi / Teknis Kepemimpinan
│   ├── 06_Assessment360.gs    alur Penilaian 360°
│   ├── 07_Interview.gs        Wawancara Appraisal + seed pertanyaan wawancara
│   ├── 08_Validation.gs       straight-lining, kalibrasi, laporan kualitas data, audit reader
│   ├── 09_Notification.gs     pengingat H-3/H-1 + ringkasan progres Admin
│   ├── 10_Triggers.gs         time-driven trigger harian
│   ├── 11_Report.gs           agregasi skor INVICTUS, dashboard, laporan individu/agregat, ekspor
│   └── 12_Router.gs           doGet/doPost + tabel ACTIONS (action string → handler)
├── tests/                     unit test Jest (logika murni backend)
├── .github/workflows/test.yml CI: hanya `npm test` (deploy ditangani Cloudflare + manual GAS)
├── .clasp.json / .claspignore clasp OPSIONAL (rootDir: gas)
└── docs/
    ├── PANDUAN_SETUP.md       panduan langkah-demi-langkah lengkap
    └── FRD_...v1.2.docx
```

---

## Setup singkat

Panduan lengkap: **[`docs/PANDUAN_SETUP.md`](docs/PANDUAN_SETUP.md)**. Ringkasan:

### A. Backend (Google Apps Script)
1. <https://script.google.com> → **New project** → nama `KK-360 Performance`.
2. Buat 13 file `.gs` (nama = `00_Config` … `12_Router`) + `appsscript.json`, **tempel isi dari folder `gas/`**.
   *(atau `clasp login` lalu `clasp push` — `.clasp.json` `rootDir: gas`).*
3. Editor → Run berurutan: **`setup`** → isi Script Property `ADMIN_NIAS` → **`installTriggers`**.
4. Impor roster pertama: isi Script Property `BOOTSTRAP_ROSTER_SHEET_ID`, Run **`firstImportDryRun`** → **`firstImport`**.
5. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone**.
   Salin **URL `/exec`**.

### B. Frontend (GitHub + Cloudflare Pages)
1. Buat repo GitHub `CUKK360`, `git push`.
2. Cloudflare dash → **Workers & Pages → Create → Pages → Connect to Git** → pilih repo.
   - Framework preset: **None**, Build command: *(kosong)*, Build output directory: **`/`**.
3. Project **Settings → Environment variables** → tambah `SCRIPT_URL` = URL `/exec` dari A.5 → **Redeploy**.
4. Buka domain `*.pages.dev` → muncul layar Login NIA.

### C. Operasional periode pertama (di aplikasi)
Login admin → aktivasi PIN (OTP) → Panel Admin → tinjau jabatan belum terpetakan →
**Buat Periode** `360°` → **aktif** (otomatis deteksi hierarki + generate penugasan).

---

## Alur update ke depan

| Yang diubah | Cara |
|---|---|
| Frontend (`index.html`, `css/`, `js/`) | `git commit` + `git push` → Cloudflare Pages auto-deploy |
| Backend (`gas/*.gs`) | tempel isi file yang berubah ke editor Apps Script *(atau `clasp push`)*, lalu **Deploy → Manage deployments → Edit → New version** |
| Bank pertanyaan / tabel referensi di kode | setelah update `gas/`, Run **`reseedAll`** di editor |
| Roster bulanan | Panel Admin → Impor Roster → dry-run → Berlakukan |

---

## Endpoint backend (tabel `ACTIONS` di `gas/12_Router.gs`)

| action | Metode | Handler |
|---|---|---|
| `ping` | GET | cek koneksi |
| `auth.login` / `auth.requestOtp` / `auth.verifyOtp` / `auth.logout` | POST | `02_Auth.gs` |
| `auth.me` | GET | validasi sesi |
| `dashboard` | GET | `reportDashboard` |
| `a360.list` / `a360.open` | GET | daftar & buka tugas 360 |
| `a360.saveDraft` / `a360.submit` | POST | auto-save & kirim |
| `iv.list` / `iv.open` | GET | daftar & buka sesi wawancara |
| `iv.saveSelf` / `iv.saveAtasan` / `iv.confirm` | POST | isi & konfirmasi wawancara |
| `report.individu` / `report.individuPdf` / `report.agregat` / `report.excelUrl` | GET | laporan |
| `validation.report` / `audit.tail` | GET | kualitas data & audit (Admin/IAD) |
| `periode.list` | GET / `periode.create` / `periode.setStatus` | POST | periode (Admin) |
| `admin.importRoster` / `admin.upsertLevelRef` / `admin.installTriggers` / `admin.runReminderNow` / `admin.setHierarkiManual` | POST | Master Data (Admin) |
| `admin.masterSummary` / `admin.listLevelRef` / `admin.listAktivis` | GET | Master Data (Admin) |

Semua handler mengembalikan `{ok:true, data:...}` atau `{ok:false, error:"..."}`.

---

## Pengujian

```bash
npm install
npm test        # 51 test — resolveLevelJabatan_, format NIA, average_/predikat_, shuffle_
```

Harness `tests/helpers/loadGs.js` men-stub layanan Google (`SpreadsheetApp`, `MailApp`,
`CacheService`, …) untuk menguji fungsi murni dari `gas/*.gs`. Uji end-to-end (impor
roster, submit 360°, OTP, ekspor, CORS) dilakukan manual di staging.

---

## Aturan bisnis kunci (ditegakkan di backend)

| Kode | Ringkasan | Lokasi |
|---|---|---|
| BR-10 | Tidak menilai/dinilai lintas Unit Bisnis | `generateAssignments_`, `a360ListTasks`, `a360OpenTask` |
| BR-11 | NIA unik; impor duplikat ditahan | `importRosterFromSheet_` |
| BR-12 | OTP ke email pemilik NIA, bukan pihak yang login | `02_Auth.gs::_issueOtp_` |
| BR-04 / FR-24 | Seksi Teknis hanya bila relasi bawahan→atasan **atau** `is_trigger_teknis=TRUE` | `a360OpenTask` |
| BR-05 | Kalibrasi gagal tidak memblokir submit, hanya flag | `a360SubmitTask` + `evaluateSubmissionQuality_` |
| BR-07 | Skor dimensi mengecualikan butir kalibrasi | `computeScores_` |
| BR-13 | Pasangan wawancara = hierarki 360°; sesi terkunci setelah 2 konfirmasi | `generateInterviewSessions_`, `ivConfirmSession` |

---

## Asumsi yang diambil

1. **Backend = JSON API murni** (bukan HtmlService). FRD Bab 10 menyebut HtmlService;
   disubstitusi dengan model frontend-terpisah + `doGet`/`doPost` JSON agar **sama
   dengan project `laporan-hn` yang sudah berjalan** (Cloudflare Pages + GAS API).
2. **`appsscript.json` di `gas/`** (rootDir clasp). clasp bersifat opsional — update
   backend juga bisa dengan menempel isi file ke editor Apps Script.
3. **PIN 6 digit angka**; hash di Script Properties (`pin_<NIA>`), bukan di Sheet.
4. **"Perangkat dikenal"** = id acak di `localStorage` (`kk360_device`); hash-nya
   dicatat di Script Properties (`dev_<NIA>`, maks. 5). Perangkat baru → OTP.
5. **Admin** ditentukan lewat Script Property `ADMIN_NIAS`; peran lain dari Level Jabatan.
6. **Urutan Tabel Referensi Level Jabatan**: pola "Pratama/Plt/Junior/Asisten" sebelum
   "Pimpinan Menengah" umum ("Plt Branch Manager" → *Pratama*). Bisa ditata ulang Admin.
7. **Deteksi hierarki**: Staf se-`bo` → atasan level pimpinan di `bo` itu (fallback
   `area`); Pimpinan Menengah → level lebih tinggi se-`area` (fallback Puncak se-`unit`).
   Baris `sumber=koreksi_manual_admin` tak ditimpa.
8. **Peer**: rekan `unit+bo+level` sama, diambil acak `PEER_MIN` (default 2).
9. **CORS**: Web App di-deploy "Anyone" agar `/exec` mengembalikan
   `Access-Control-Allow-Origin: *` untuk GET & POST `text/plain` lintas-origin dari
   domain Cloudflare Pages (pola yang sama dipakai `laporan-hn`).
10. **`_redirects`** memblok `/gas/*`, `/tests/*`, `/docs/*` dari Cloudflare Pages.
    Kode backend tak memuat rahasia (semua di Script Properties), jadi ini higienis
    bukan pengamanan kritis.
11. Butir kalibrasi disimpan di `pertanyaan_360` id tetap `kal_core`/`kal_teknis`,
    jawabannya ikut ke `jawaban_360` untuk audit, tapi dikecualikan dari skor.

---

## Konfigurasi (Script Properties)

| Key | Wajib | Default | Keterangan |
|---|---|---|---|
| `SPREADSHEET_ID` | ✔ | dibuat `setup()` | ID Spreadsheet database |
| `OTP_PEPPER` | ✔ | dibuat `setup()` | garam hash OTP & PIN — **jangan diubah** |
| `ADMIN_NIAS` | ✔ | — | NIA admin, dipisah koma |
| `PEER_MIN` | — | `2` | minimal rekan selevel dinilai (BR-03) |
| `SELF_APPRAISAL_AKTIF` | — | `TRUE` | aktif/nonaktif form self-appraisal wawancara |
| `BOOTSTRAP_ROSTER_SHEET_ID` | — | — | ID Spreadsheet roster untuk `firstImport` |
| `BOOTSTRAP_ROSTER_TAB` | — | — | nama tab roster (default: tab pertama) |

Dan di **Cloudflare Pages** (Environment variables): `SCRIPT_URL` = URL Web App `/exec`.

---

## Non-Goals

Modul penggajian/rekrutmen/HRIS lain; migrasi DB ke luar Google Sheets; native mobile app.
