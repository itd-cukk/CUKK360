# PROMPT: Bangun Sistem "KK-360 Performance"
**Aplikasi Penilaian Kinerja 360° — Jaringan Gerakan Keling Kumang**
Stack wajib: **Google Apps Script + Google Sheets + clasp + GitHub Actions**

> Cara pakai: tempel seluruh isi file ini sebagai instruksi awal ke Claude Code (atau agent coding lain) di dalam folder repo kosong. Lampirkan juga file `FRD_Aplikasi_Penilaian_Kinerja_360_Keling_Kumang_v1.2.docx` dan `Data_Aktivis_Agus_2026.xlsx` sebagai referensi tambahan bila agent dapat membaca lampiran.

---

## 0. Peran dan Cara Kerja

Anda adalah developer full-stack yang membangun aplikasi produksi di atas **Google Apps Script**, dengan kode dikelola di **GitHub** melalui **clasp**. Bekerja secara bertahap sesuai **Bagian 6 (Urutan Pembangunan)** di bawah — selesaikan satu tahap, ringkas apa yang dibuat, baru lanjut ke tahap berikutnya. Jangan mengganti stack (mis. beralih ke Node.js/Express, Firebase, atau framework frontend seperti React) — seluruh sistem harus berjalan murni di atas Apps Script + HtmlService + Google Sheets sebagaimana ditetapkan pada Bab 10 dokumen FRD.

Jika ada bagian requirement yang ambigu, buat asumsi yang masuk akal, **tuliskan asumsi tersebut secara eksplisit** di README atau komentar kode, dan lanjutkan — jangan berhenti menunggu klarifikasi kecuali benar-benar memblokir (mis. kredensial/akses akun Google yang belum tersedia).

---

## 1. Ringkasan Proyek

Sistem menggantikan proses Google Form manual "Lembaran Penilaian Kinerja Jaringan Gerakan Keling Kumang" dengan aplikasi web responsif yang:

1. **Login memakai NIA** (Nomor Induk Aktivis), bukan akun Google — data identitas (NIA, Nama, Unit, BO/Tempat Tugas, Area, Jabatan) bersumber tunggal dari roster Excel HCMD yang diimpor ke Google Sheets.
2. Menyediakan **3 menu utama**: **(1) Penilaian 360°**, **(2) Pertanyaan Wawancara** (wawancara appraisal kinerja tahunan, terpisah dari 360°), **(3) Laporan**.
3. Membatasi ruang lingkup penilaian **hanya dalam Unit Bisnis yang sama** dengan pengguna yang login (tidak boleh menilai/dinilai lintas unit), dan mendeteksi **relasi penilaian** (Self/Peer/Atasan/Bawahan) **secara otomatis** dari data Jabatan + BO + Area — tanpa dropdown organisasi manual seperti pada Google Form lama.
4. Mengukur 8 dimensi Core Values **"INVICTUS"** (Integritas, Network, Value Creation, Innovation, Credibility, Togetherness, Unity, Speed) untuk semua relasi, ditambah kuesioner **Kompetensi Teknis Kepemimpinan** khusus bila pemangku jabatan berlevel Pimpinan.
5. Menghasilkan **dashboard & laporan** (skor individu, radar chart 8 dimensi, agregat per unit/branch, kualitas data, ekspor PDF/Excel).

Dokumen rujukan lengkap: **FRD v1.2** (11 bab + lampiran) — gunakan sebagai sumber kebenaran untuk detail yang tidak tercakup di prompt ini.

---

## 2. Batasan Teknis (Wajib)

| Aspek | Ketentuan |
|---|---|
| Backend/runtime | Google Apps Script murni (tidak ada server terpisah). |
| Database | Google Sheets (satu spreadsheet berisi banyak sheet/tab, lihat Bagian 4). |
| Frontend | `HtmlService` (Apps Script) + `google.script.run`. Boleh memakai CSS/JS ringan via CDN (mis. Tailwind CSS) untuk tampilan modern/responsif — **jangan** pakai React/Vue/Next.js. |
| Autentikasi | Kustom berbasis NIA + PIN, **bukan** OAuth Google. Deploy web app dengan `Execute as: Me`, `Who has access: Anyone, even anonymous`. |
| OTP & notifikasi | `MailApp`/`GmailApp` bawaan Apps Script. |
| Version control | `clasp` (`.clasp.json`, `.claspignore`) menautkan folder lokal ke Apps Script Project; seluruh histori perubahan ada di GitHub. |
| CI/CD | GitHub Actions menjalankan `clasp push` (staging) dan `clasp deploy` (produksi) saat merge ke branch terkait; kredensial `clasprc.json` disimpan sebagai GitHub Secret, **jangan pernah** commit kredensial ke repo. |
| Concurrency-safety | Pakai `LockService` pada operasi tulis kritis (submit jawaban 360°, konfirmasi sesi wawancara, impor roster) untuk mencegah race condition penulisan Sheets. |
| Performa | Cache Master Data Aktivis & Tabel Referensi Level Jabatan di `CacheService`/`PropertiesService` sebagai JSON, di-refresh tiap kali roster diimpor ulang — jangan `getDataRange()` penuh pada setiap request. |

---

## 3. Struktur Repository (Wajib Dibuat Persis Seperti Ini)

```
/
├── appsscript.json
├── .clasp.json
├── .claspignore
├── README.md
├── package.json                # untuk tooling lint/test lokal (opsional tapi disarankan)
├── src/
│   ├── Auth.gs                 # login NIA, PIN, OTP, sesi (CacheService)
│   ├── MasterData.gs           # impor roster, validasi, Tabel Referensi Level Jabatan, deteksi hierarki
│   ├── Period.gs               # periode penilaian, generate penugasan otomatis
│   ├── QuestionBank.gs         # bank pertanyaan Core Values INVICTUS, Teknis, Kalibrasi
│   ├── Assessment360.gs        # logika alur Penilaian 360°
│   ├── Interview.gs            # logika Wawancara Appraisal Tahunan
│   ├── Validation.gs           # straight-lining, kalibrasi gagal, audit log
│   ├── Notification.gs
│   ├── Triggers.gs             # instalasi time-driven trigger
│   ├── Report.gs               # agregasi skor, data laporan, ekspor PDF/Excel
│   ├── Utils.gs                # helper umum (format, validasi, dsb.)
│   ├── Login.html
│   ├── Dashboard.html
│   ├── Assessment.html
│   ├── Interview.html
│   ├── Report.html
│   └── Styles.html             # di-include lewat HtmlService templating (<?!= include('Styles') ?>)
├── tests/
│   └── *.test.js               # pengujian logika murni (Jest) yang tidak bergantung layanan Apps Script
├── .github/
│   └── workflows/
│       └── deploy.yml
└── docs/
    └── FRD_Aplikasi_Penilaian_Kinerja_360_Keling_Kumang_v1.2.docx
```

---

## 4. Skema Google Sheets (Database)

Buat satu Google Spreadsheet dengan sheet-sheet berikut (baris pertama = header persis seperti kolom di bawah):

| Sheet | Kolom |
|---|---|
| `aktivis` | `nia, nama, jabatan_text, unit, bo, area, email, status_aktif, sumber_impor, tanggal_impor` |
| `riwayat_mutasi_aktivis` | `id, nia, jabatan_text_lama, bo_lama, area_lama, berlaku_sejak_periode` |
| `referensi_level_jabatan` | `id, pola_kata_kunci, level, is_trigger_teknis` |
| `hierarki_terdeteksi` | `id, nia_bawahan, nia_atasan, periode_id, sumber` |
| `otp_log` | `id, nia_target, kode_otp_hash, waktu_kirim, waktu_kedaluwarsa, status` |
| `periode_penilaian` | `id, nama, jenis, tanggal_mulai, tanggal_selesai, status` |
| `kategori_core_value` | `id, kode_huruf, nama` |
| `pertanyaan_360` | `id, tipe, kategori_id, teks, label_skala_1, label_skala_2, label_skala_3, label_skala_4, label_skala_5, urutan` |
| `opsi_jawaban_teknis` | `pertanyaan_id, skor, teks_label, deskripsi` |
| `penugasan_penilaian` | `id, periode_id, nia_penilai, nia_dinilai, jenis_relasi, status` |
| `jawaban_360` | `id, penugasan_id, pertanyaan_id, skor` |
| `pertanyaan_wawancara` | `id, kategori, teks, berlaku_level` |
| `sesi_wawancara` | `id, periode_id, nia_atasan, nia_bawahan, status, tanggal_sesi, konfirmasi_atasan, konfirmasi_bawahan` |
| `jawaban_wawancara` | `id, sesi_id, pertanyaan_id, jawaban_self_appraisal, catatan_atasan` |
| `rencana_tindak_lanjut` | `id, sesi_id, deskripsi, target_waktu, status` |
| `audit_log` | `id, nia, aksi, waktu, detail, perangkat_ip` |

---

## 5. Bank Pertanyaan (Konten Wajib, Salin Persis)

### 5.1 Core Values "INVICTUS" (24 butir, skala 1–5, opsi diacak saat tampil)

**I — Integritas**
1. Selalu berkata dan bertindak dengan jujur *(1 Sangat Tidak Sesuai … 5 Sangat Sesuai)*
2. Selalu bersikap terbuka dalam memberikan informasi dan menerima masukan *(1 Sangat Tidak Terbuka … 5 Sangat Terbuka)*
3. Selalu konsisten antara ucapan dan tindakannya *(1 Sangat Tidak Konsisten … 5 Sangat Konsisten)*

**N — Network**
1. Selalu menyadari bahwa pekerjaan yang dilakukan merupakan bentuk rasa syukur kepada Tuhan *(1 Sangat Tidak Menyadari … 5 Sangat Menyadari)*
2. Selalu memiliki kepedulian terhadap lingkungan Kantor dan menjaga kelestarian alam dalam bekerja *(1 Sangat Tidak Peduli … 5 Sangat Peduli)*
3. Selalu membangun hubungan kerja yang baik dengan orang lain dan jaringan *(1 Sangat Tidak Membangun Hubungan … 5 Sangat Membangun Hubungan)*

**V — Value Creation**
1. Selalu berusaha meningkatkan kualitas diri dan berani menerima tantangan *(1 Sangat Tidak Berusaha … 5 Sangat Berusaha)*
2. Selalu memberikan pelayanan yang ramah, cepat, dan tepat kepada anggota maupun rekan kerja *(1 Sangat Tidak Memberikan Pelayanan … 5 Sangat Memberikan Pelayanan)*
3. Berani menyampaikan ide-ide baru untuk perbaikan dan pengembangan Lembaga *(1 Sangat Tidak Berani … 5 Sangat Berani)*

**I — Innovation**
1. Selalu berusaha menghadirkan pemikiran baru sesuai dengan perubahan yang terus terjadi *(1 Sangat Tidak Berusaha … 5 Sangat Berusaha)*
2. Berani mencoba cara kerja yang berbeda untuk perbaikan yang lebih baik *(1 Sangat Tidak Berani Mencoba … 5 Sangat Berani Mencoba)*
3. Mampu menghasilkan karya yang lebih baik melalui inovasi *(1 Sangat Tidak Mampu … 5 Sangat Mampu)*

**C — Credibility**
1. Dapat dipercaya dalam menjalankan tugas dan menjaga amanah *(1 Sangat Tidak Dipercaya … 5 Sangat Dipercaya)*
2. Bertanggung jawab atas hasil pekerjaan dan tindakannya *(1 Sangat Tidak Bertanggung Jawab … 5 Sangat Bertanggung Jawab)*
3. Selalu bekerja dengan tulus dan ikhlas, mampu menyelaraskan kepentingan organisasi dengan kepentingan pribadi *(1 Sangat Tidak Mampu … 5 Sangat Mampu)*

**T — Togetherness**
1. Saling mendukung secara emosional dan peduli terhadap sesama *(1 Sangat Tidak Mendukung … 5 Sangat Mendukung)*
2. Mau bekerja sama secara nyata untuk meringankan beban orang lain *(1 Sangat Tidak Mau … 5 Sangat Mau)*
3. Memperlakukan sesama dengan adil, saling menghargai, dan tidak diskriminatif *(1 Sangat Tidak Mampu … 5 Sangat Mampu)*

**U — Unity**
1. Mampu bekerja secara kompak untuk mencapai tujuan bersama *(1 Sangat Tidak Mampu … 5 Sangat Mampu)*
2. Mampu menempatkan diri atau beradaptasi sesuai situasi dan kebutuhan organisasi *(1 Sangat Tidak Mampu … 5 Sangat Mampu)*
3. Mampu menyelesaikan pekerjaan tepat waktu sesuai target *(1 Sangat Tidak Mampu … 5 Sangat Mampu)*

**S — Speed**
1. Lincah dan bergerak cepat tidak mau menunda pekerjaan *(1 Sangat Tidak Melakukan … 5 Sangat Melakukan)*
2. Selalu disiplin, fokus dan tidak mudah menyerah dalam menyelesaikan pekerjaan *(1 Sangat Tidak Melakukan … 5 Sangat Melakukan)*
3. Selalu menyemangati dan bekerja dalam tim untuk mencapai target bersama yang ditetapkan oleh lembaga *(1 Sangat Tidak Melakukan … 5 Sangat Melakukan)*

### 5.2 Butir Kalibrasi (Attention Check)

- Seksi Core Values: *"Butir ini memastikan Anda membaca instruksi dengan saksama. Untuk pertanyaan ini saja, pilih Angka 1."* — opsi 1–5 diacak; jawaban benar = 1.
- Seksi Teknis: *"Untuk pertanyaan ini saja, pilih Angka 2."* — opsi 1–5 diacak; jawaban benar = 2.
- Jawaban salah **tidak menggagalkan submit**, hanya menandai flag kualitas data (lihat `Validation.gs`).

### 5.3 Kompetensi Teknis Kepemimpinan (6 butir, hanya untuk pemangku jabatan Level = Pimpinan)

1. Apakah pimpinan atau atasan Anda mampu mengambil keputusan yang cepat dan tepat dalam situasi mendesak?
2. Apakah pimpinan atau atasan Anda mengelola sumber daya (waktu, dana, dan SDM) secara efektif dan efisien?
3. Apakah pimpinan atau atasan Anda memberikan arahan kerja yang jelas dan mudah dipahami staf?
4. Apakah pimpinan atau atasan Anda memastikan pekerjaan tim berjalan sesuai target dan prosedur?
5. Apakah pimpinan atau atasan Anda menindaklanjuti masalah yang muncul dengan solusi yang konkret?
6. Apakah pimpinan atau atasan Anda bertanggung jawab penuh terhadap hasil kerja tim maupun individu?

Setiap butir punya 5 opsi jawaban **naratif** (bukan angka polos), dipetakan ke skor, urutan tampil diacak:

| Skor | Label | Contoh Deskripsi (sesuaikan kata kerja per butir) |
|---|---|---|
| 5 | Sangat Baik | Pimpinan selalu melakukan hal tersebut secara konsisten dan efektif. |
| 4 | Baik | Pimpinan umumnya melakukan hal tersebut dengan baik. |
| 3 | Cukup Baik | Pimpinan kadang melakukan hal tersebut, namun belum konsisten. |
| 2 | Kurang Baik | Pimpinan jarang melakukan hal tersebut secara memadai. |
| 1 | Sangat Tidak Baik | Pimpinan hampir tidak pernah melakukan hal tersebut. |

### 5.4 Contoh Bank Pertanyaan Wawancara Appraisal Tahunan (dapat ditambah oleh Admin nanti)

| Kategori | Contoh Pertanyaan |
|---|---|
| Pencapaian Target | Target kerja apa saja yang telah tercapai dan tidak tercapai pada periode berjalan, beserta faktor pendukung/penghambatnya? |
| Kendala & Solusi | Kendala utama apa yang dihadapi dalam menjalankan tugas, dan solusi apa yang sudah/akan dilakukan? |
| Pengembangan Diri | Kompetensi atau keterampilan apa yang ingin dikembangkan pada periode berikutnya? |
| Rencana Kerja ke Depan | Apa rencana kerja utama untuk periode berikutnya dan dukungan apa yang dibutuhkan dari atasan/organisasi? |
| Khusus Pimpinan | Bagaimana strategi pengembangan tim/bawahan yang telah dan akan dijalankan pada periode berikutnya? |

---

## 6. Urutan Pembangunan (Ikuti Berurutan)

1. **Bootstrap proyek**: `clasp create`/`clasp clone`, `appsscript.json` (timezone `Asia/Pontianak` atau sesuai kebutuhan, `webapp` config, `oauthScopes` minimal: Spreadsheet, Gmail, Cache/Properties, Drive), buat file kosong sesuai struktur Bagian 3, inisialisasi Git + `.gitignore` (abaikan `.clasprc.json`).
2. **Buat & seed Google Sheets** sesuai skema Bagian 4. Tulis fungsi `MasterData.gs::importRosterFromSheet_(sourceSheetId)` yang membaca kolom `NIA, NAMA AKTIVIS, UNIT, BO, AREA, JABATAN` (persis seperti `Data_Aktivis_Agus_2026.xlsx`), melakukan upsert ke sheet `aktivis`, mendeteksi NIA duplikat, dan menandai NIA yang hilang dari roster baru sebagai `status_aktif = FALSE`.
3. **Tabel Referensi Level Jabatan**: seed `referensi_level_jabatan` dengan pola awal berikut (pencocokan case-insensitive substring terhadap `jabatan_text`):
   - `CEO|General Manager|Direktur|Wakil Rektor` → `Pimpinan Puncak`, trigger teknis = TRUE
   - `Head of|Area Manager|Branch Manager|Manager|Kepala` → `Pimpinan Menengah`, trigger teknis = TRUE
   - `Plt|Junior .*Manager|Asisten Manager|Asisten AM` → `Pimpinan Menengah (Pratama)`, trigger teknis = TRUE (dapat dikonfigurasi)
   - default/tidak cocok → `Staf Pelaksana`, trigger teknis = FALSE
   Tulis fungsi `resolveLevelJabatan_(jabatanText)` yang mengembalikan level & flag trigger, dan menandai jabatan yang tidak cocok pola manapun sebagai `"PERLU_DIPETAKAN"` untuk ditinjau admin.
4. **Deteksi hierarki otomatis** (`MasterData.gs::detectHierarchy_(periodeId)`): untuk tiap `bo` yang sama, aktivis Level Staf → atasan = aktivis Level Pimpinan Menengah pada `bo` yang sama; aktivis Level Pimpinan Menengah (Branch Manager) → atasan = aktivis Level Pimpinan Puncak/Area Manager pada `area` yang sama. Simpan hasil ke `hierarki_terdeteksi`. Sediakan cara bagi Admin mengoreksi manual (baris `sumber = koreksi_manual_admin` tidak ditimpa saat deteksi ulang).
5. **Modul Auth** (`Auth.gs`): `loginWithNia_(nia, pin)`, `requestOtp_(nia)` (kirim ke `email` pada sheet `aktivis`, simpan hash di `otp_log`, kedaluwarsa 5 menit), `verifyOtp_(nia, kode)`, buat session token (UUID) disimpan di `CacheService` (TTL mis. 8 jam) berisi `{nia, nama, jabatan_text, level, unit, bo, area}`. Setiap fungsi modul lain yang dipanggil dari client wajib menerima `sessionToken` dan memvalidasinya lebih dulu.
6. **Modul Bank Pertanyaan** (`QuestionBank.gs`): seed sheet `kategori_core_value` (8 baris I/N/V/I/C/T/U/S) dan `pertanyaan_360` (24 butir Core Values + 2 butir kalibrasi) persis dari Bagian 5.1–5.2, serta `opsi_jawaban_teknis` untuk 6 butir Teknis dari Bagian 5.3.
7. **Modul Periode & Penugasan** (`Period.gs`): CRUD periode; `generateAssignments_(periodeId)` membangkitkan baris `penugasan_penilaian` otomatis: 1 baris self per aktivis aktif dalam unit, baris peer (aktivis lain `bo` sama & level sama, minimal N — buat konfigurabel, default 2), baris atasan↔bawahan dari `hierarki_terdeteksi`.
8. **Modul Penilaian 360°** (`Assessment360.gs` + `Assessment.html`): daftar tugas (`getMyAssignments_(sessionToken)` — hanya tugas untuk `nia` yang login), buka tugas → tampilkan konteks pemangku jabatan (read-only), acak opsi jawaban di server sebelum dikirim ke client (simpan mapping agar submit tetap benar), simpan jawaban ke `jawaban_360` (pakai `LockService`), validasi seluruh wajib terisi, tandai `penugasan_penilaian.status = selesai`. Tampilkan seksi Teknis hanya jika `level` pemangku jabatan mengandung flag trigger.
9. **Modul Wawancara** (`Interview.gs` + `Interview.html`): `generateInterviewSessions_(periodeId)` dari `hierarki_terdeteksi`; form self-appraisal (bawahan) dan form catatan atasan berdampingan; simpan ke `jawaban_wawancara` & `rencana_tindak_lanjut`; `confirmSession_(sesiId, role)` mengunci sesi setelah kedua pihak konfirmasi.
10. **Modul Validasi** (`Validation.gs`): deteksi straight-lining (semua skor sama pada satu penugasan), deteksi kalibrasi gagal, tulis `audit_log` di setiap aksi penting (login, request OTP, submit 360°, konfirmasi wawancara, impor roster).
11. **Modul Notifikasi & Trigger** (`Notification.gs`, `Triggers.gs`): instalasi time-driven trigger harian yang mengirim pengingat ke aktivis dengan tugas belum selesai H-3/H-1 sebelum deadline periode, dan ringkasan progres ke Admin.
12. **Modul Laporan** (`Report.gs` + `Report.html`): agregasi skor per dimensi INVICTUS per `nia` (rata-rata dari `jawaban_360` dikelompokkan `jenis_relasi`), render radar chart (pakai Google Charts via `HtmlService`, tipe `RadarChart`/gviz atau Chart.js via CDN), tabel agregat per `bo`/`area`/`unit`, laporan kualitas data (dari `Validation.gs`), tombol ekspor: Excel via tautan ekspor bawaan Sheets, PDF via `DocumentApp` template atau ekspor Sheets ke PDF.
13. **UI/UX** (`Login.html`, `Dashboard.html`, `Styles.html`): desain responsif mobile-first, palet warna merah–biru–hijau (identitas Keling Kumang) dipadukan warna netral, sudut membulat, tombol skala berupa chip besar (bukan radio kecil), progress bar pada wizard, dark-mode opsional. Beranda menampilkan 3 menu utama sebagai kartu besar (Penilaian 360°, Pertanyaan Wawancara, Laporan) dengan badge jumlah tugas belum selesai.
14. **CI/CD**: `.github/workflows/deploy.yml` — job `test` (jalankan `npm test` di folder `tests/`), job `deploy` (branch `main` → `clasp push` lalu `clasp deploy`; branch `develop` → hanya `clasp push` ke deployment staging), kredensial dari `secrets.CLASP_CREDENTIALS`.
15. **README.md**: instruksi setup lokal (`npm i -g @google/clasp`, `clasp login`, `clasp clone <scriptId>`), cara menjalankan seed data, cara membuat Spreadsheet ID & menaruhnya di `Script Properties`, cara deploy manual sebagai fallback, serta daftar asumsi yang diambil selama pembangunan.
16. **Pengujian**: tulis unit test (Jest) untuk fungsi murni seperti `resolveLevelJabatan_`, kalkulasi skor rata-rata per dimensi, dan validasi format NIA — fungsi yang bergantung pada layanan Apps Script (`SpreadsheetApp`, dll.) cukup diuji manual/dengan mock sederhana, jelaskan keterbatasannya di README.

---

## 7. Aturan Bisnis Kunci (Jangan Dilanggar)

- **BR-10**: aktivis hanya boleh menilai/dinilai sesama aktivis pada `unit` yang sama — filter ini diterapkan di query server (`Assessment360.gs`), bukan hanya disembunyikan di UI.
- **BR-11**: NIA unik; impor roster dengan NIA duplikat ditahan dan dilaporkan ke Admin, tidak diberlakukan otomatis.
- **BR-12**: OTP selalu dikirim ke email milik **pemegang NIA yang diakses**, bukan ke pihak yang sedang mencoba login.
- **BR-04/FR-24**: seksi Teknis Kepemimpinan hanya muncul bila `is_trigger_teknis = TRUE` untuk pemangku jabatan yang dinilai.
- **BR-05**: kegagalan butir kalibrasi tidak boleh memblokir submit — hanya menandai flag data.
- Skor akhir per dimensi **mengecualikan** butir kalibrasi dari perhitungan rata-rata.

---

## 8. Kriteria Selesai (Definition of Done)

- [ ] Struktur repo sama persis dengan Bagian 3, dapat di-`clasp push` tanpa error.
- [ ] Login NIA berhasil untuk NIA yang ada di sheet `aktivis`, gagal dengan pesan jelas untuk NIA tidak ada/nonaktif.
- [ ] Alur OTP berfungsi end-to-end (kirim email, verifikasi, sesi tersimpan di Cache).
- [ ] Daftar tugas Penilaian 360° yang tampil ke seorang NIA **tidak pernah** memuat aktivis dari `unit` lain.
- [ ] Kuesioner Teknis Kepemimpinan hanya muncul saat menilai pemangku jabatan berlevel Pimpinan.
- [ ] Butir kalibrasi tercatat sebagai flag kualitas data, tidak menghalangi submit.
- [ ] Menu Pertanyaan Wawancara menghasilkan sesi otomatis sesuai hierarki yang sama dengan 360°, dan dapat dikunci setelah dua pihak konfirmasi.
- [ ] Dashboard Laporan menampilkan minimal: radar chart 8 dimensi INVICTUS untuk satu individu, tabel agregat per branch, dan tombol ekspor Excel/PDF yang benar-benar mengunduh berkas.
- [ ] Workflow GitHub Actions berhasil menjalankan `clasp push`/`clasp deploy` pada percobaan simulasi (boleh dijelaskan langkah manual bila kredensial nyata belum tersedia saat development).
- [ ] README menjelaskan cara setup dari nol oleh orang lain (HCMD/ITD) tanpa perlu bertanya ke pembuat awal.

---

## 9. Non-Goals (Jangan Dikerjakan Sekarang)

- Modul penggajian, rekrutmen, atau HRIS lain di luar siklus 360° dan wawancara appraisal.
- Migrasi database ke luar Google Sheets (cukup disiapkan agar mudah dimigrasikan nanti, tidak perlu diimplementasikan).
- Native mobile app — cukup web responsif.
