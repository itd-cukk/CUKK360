/**
 * QuestionBank.gs — Bank pertanyaan: Core Values INVICTUS, butir kalibrasi,
 * dan Kompetensi Teknis Kepemimpinan.
 *
 * Konten disalin PERSIS dari Bagian 5 prompt / Lampiran B–D FRD.
 * FR-15..FR-18, BR-07 (kalibrasi dikecualikan dari skor).
 */

/* ============================================================================
 * KONTEN SUMBER (jangan diubah tanpa persetujuan HCMD)
 * ========================================================================== */

/** 8 kategori; kode_huruf mengikuti akronim INVICTUS. id = 'cv_<n>'. */
var CV_KATEGORI = [
  { id: 'cv_1', kode: 'I', nama: 'Integritas' },
  { id: 'cv_2', kode: 'N', nama: 'Network' },
  { id: 'cv_3', kode: 'V', nama: 'Value Creation' },
  { id: 'cv_4', kode: 'I', nama: 'Innovation' },
  { id: 'cv_5', kode: 'C', nama: 'Credibility' },
  { id: 'cv_6', kode: 'T', nama: 'Togetherness' },
  { id: 'cv_7', kode: 'U', nama: 'Unity' },
  { id: 'cv_8', kode: 'S', nama: 'Speed' }
];

/**
 * 24 butir Core Values. `s` = [label skala 1, label skala 5]; label 2–4 diturunkan
 * kosong (client menampilkan angka + label ujung). Bila butuh 5 label eksplisit,
 * isi array 5 elemen.
 */
var CV_BUTIR = [
  // I — Integritas
  { kat: 'cv_1', teks: 'Selalu berkata dan bertindak dengan jujur', s: ['Sangat Tidak Sesuai', 'Sangat Sesuai'] },
  { kat: 'cv_1', teks: 'Selalu bersikap terbuka dalam memberikan informasi dan menerima masukan', s: ['Sangat Tidak Terbuka', 'Sangat Terbuka'] },
  { kat: 'cv_1', teks: 'Selalu konsisten antara ucapan dan tindakannya', s: ['Sangat Tidak Konsisten', 'Sangat Konsisten'] },
  // N — Network
  { kat: 'cv_2', teks: 'Selalu menyadari bahwa pekerjaan yang dilakukan merupakan bentuk rasa syukur kepada Tuhan', s: ['Sangat Tidak Menyadari', 'Sangat Menyadari'] },
  { kat: 'cv_2', teks: 'Selalu memiliki kepedulian terhadap lingkungan Kantor dan menjaga kelestarian alam dalam bekerja', s: ['Sangat Tidak Peduli', 'Sangat Peduli'] },
  { kat: 'cv_2', teks: 'Selalu membangun hubungan kerja yang baik dengan orang lain dan jaringan', s: ['Sangat Tidak Membangun Hubungan', 'Sangat Membangun Hubungan'] },
  // V — Value Creation
  { kat: 'cv_3', teks: 'Selalu berusaha meningkatkan kualitas diri dan berani menerima tantangan', s: ['Sangat Tidak Berusaha', 'Sangat Berusaha'] },
  { kat: 'cv_3', teks: 'Selalu memberikan pelayanan yang ramah, cepat, dan tepat kepada anggota maupun rekan kerja', s: ['Sangat Tidak Memberikan Pelayanan', 'Sangat Memberikan Pelayanan'] },
  { kat: 'cv_3', teks: 'Berani menyampaikan ide-ide baru untuk perbaikan dan pengembangan Lembaga', s: ['Sangat Tidak Berani', 'Sangat Berani'] },
  // I — Innovation
  { kat: 'cv_4', teks: 'Selalu berusaha menghadirkan pemikiran baru sesuai dengan perubahan yang terus terjadi', s: ['Sangat Tidak Berusaha', 'Sangat Berusaha'] },
  { kat: 'cv_4', teks: 'Berani mencoba cara kerja yang berbeda untuk perbaikan yang lebih baik', s: ['Sangat Tidak Berani Mencoba', 'Sangat Berani Mencoba'] },
  { kat: 'cv_4', teks: 'Mampu menghasilkan karya yang lebih baik melalui inovasi', s: ['Sangat Tidak Mampu', 'Sangat Mampu'] },
  // C — Credibility
  { kat: 'cv_5', teks: 'Dapat dipercaya dalam menjalankan tugas dan menjaga amanah', s: ['Sangat Tidak Dipercaya', 'Sangat Dipercaya'] },
  { kat: 'cv_5', teks: 'Bertanggung jawab atas hasil pekerjaan dan tindakannya', s: ['Sangat Tidak Bertanggung Jawab', 'Sangat Bertanggung Jawab'] },
  { kat: 'cv_5', teks: 'Selalu bekerja dengan tulus dan ikhlas, mampu menyelaraskan kepentingan organisasi dengan kepentingan pribadi', s: ['Sangat Tidak Mampu', 'Sangat Mampu'] },
  // T — Togetherness
  { kat: 'cv_6', teks: 'Saling mendukung secara emosional dan peduli terhadap sesama', s: ['Sangat Tidak Mendukung', 'Sangat Mendukung'] },
  { kat: 'cv_6', teks: 'Mau bekerja sama secara nyata untuk meringankan beban orang lain', s: ['Sangat Tidak Mau', 'Sangat Mau'] },
  { kat: 'cv_6', teks: 'Memperlakukan sesama dengan adil, saling menghargai, dan tidak diskriminatif', s: ['Sangat Tidak Mampu', 'Sangat Mampu'] },
  // U — Unity
  { kat: 'cv_7', teks: 'Mampu bekerja secara kompak untuk mencapai tujuan bersama', s: ['Sangat Tidak Mampu', 'Sangat Mampu'] },
  { kat: 'cv_7', teks: 'Mampu menempatkan diri atau beradaptasi sesuai situasi dan kebutuhan organisasi', s: ['Sangat Tidak Mampu', 'Sangat Mampu'] },
  { kat: 'cv_7', teks: 'Mampu menyelesaikan pekerjaan tepat waktu sesuai target', s: ['Sangat Tidak Mampu', 'Sangat Mampu'] },
  // S — Speed
  { kat: 'cv_8', teks: 'Lincah dan bergerak cepat tidak mau menunda pekerjaan', s: ['Sangat Tidak Melakukan', 'Sangat Melakukan'] },
  { kat: 'cv_8', teks: 'Selalu disiplin, fokus dan tidak mudah menyerah dalam menyelesaikan pekerjaan', s: ['Sangat Tidak Melakukan', 'Sangat Melakukan'] },
  { kat: 'cv_8', teks: 'Selalu menyemangati dan bekerja dalam tim untuk mencapai target bersama yang ditetapkan oleh lembaga', s: ['Sangat Tidak Melakukan', 'Sangat Melakukan'] }
];

/** Butir kalibrasi (Bagian 5.2). id tetap supaya mudah dikenali Validation.gs. */
var KALIBRASI = {
  core: {
    id: 'kal_core',
    teks: 'Butir ini memastikan Anda membaca instruksi dengan saksama. Untuk pertanyaan ini saja, pilih Angka 1.',
    jawabanBenar: 1
  },
  teknis: {
    id: 'kal_teknis',
    teks: 'Untuk pertanyaan ini saja, pilih Angka 2.',
    jawabanBenar: 2
  }
};

/** 6 butir Kompetensi Teknis Kepemimpinan (Bagian 5.3). id = 'tk_<n>'. */
var TEKNIS_BUTIR = [
  { id: 'tk_1', teks: 'Apakah pimpinan atau atasan Anda mampu mengambil keputusan yang cepat dan tepat dalam situasi mendesak?', kk: 'mengambil keputusan yang cepat dan tepat dalam situasi mendesak' },
  { id: 'tk_2', teks: 'Apakah pimpinan atau atasan Anda mengelola sumber daya (waktu, dana, dan SDM) secara efektif dan efisien?', kk: 'mengelola sumber daya secara efektif dan efisien' },
  { id: 'tk_3', teks: 'Apakah pimpinan atau atasan Anda memberikan arahan kerja yang jelas dan mudah dipahami staf?', kk: 'memberikan arahan kerja yang jelas dan mudah dipahami' },
  { id: 'tk_4', teks: 'Apakah pimpinan atau atasan Anda memastikan pekerjaan tim berjalan sesuai target dan prosedur?', kk: 'memastikan pekerjaan tim berjalan sesuai target dan prosedur' },
  { id: 'tk_5', teks: 'Apakah pimpinan atau atasan Anda menindaklanjuti masalah yang muncul dengan solusi yang konkret?', kk: 'menindaklanjuti masalah dengan solusi yang konkret' },
  { id: 'tk_6', teks: 'Apakah pimpinan atau atasan Anda bertanggung jawab penuh terhadap hasil kerja tim maupun individu?', kk: 'bertanggung jawab penuh terhadap hasil kerja tim maupun individu' }
];

/** Template 5 opsi naratif untuk butir teknis (skor 5..1). */
var TEKNIS_OPSI_TEMPLATE = [
  { skor: 5, label: 'Sangat Baik', d: 'Pimpinan selalu %KK% secara konsisten dan efektif.' },
  { skor: 4, label: 'Baik', d: 'Pimpinan umumnya %KK% dengan baik.' },
  { skor: 3, label: 'Cukup Baik', d: 'Pimpinan kadang %KK%, namun belum konsisten.' },
  { skor: 2, label: 'Kurang Baik', d: 'Pimpinan jarang %KK% secara memadai.' },
  { skor: 1, label: 'Sangat Tidak Baik', d: 'Pimpinan hampir tidak pernah %KK%.' }
];

/* ============================================================================
 * SEED
 * ========================================================================== */

/**
 * Seed kategori_core_value, pertanyaan_360 (24 core + 2 kalibrasi + 6 teknis),
 * dan opsi_jawaban_teknis. Idemponten: hanya menulis bila sheet terkait kosong.
 */
function seedQuestionBank_() {
  _seedKategoriCV_();
  _seedPertanyaan360_();
  _seedOpsiTeknis_();
}

function _seedKategoriCV_() {
  if (readObjects_('kategori_core_value').length) return;
  appendObjects_('kategori_core_value', CV_KATEGORI.map(function (k) {
    return { id: k.id, kode_huruf: k.kode, nama: k.nama };
  }));
}

function _seedPertanyaan360_() {
  if (readObjects_('pertanyaan_360').length) return;
  var rows = [];
  var urut = 1;

  // Kalibrasi Core Values (tampil sebelum kuesioner utama)
  rows.push(_row360_(KALIBRASI.core.id, 'kalibrasi', '', KALIBRASI.core.teks, ['', ''], 0));

  // 24 butir Core Values
  CV_BUTIR.forEach(function (b) {
    rows.push(_row360_('cvq_' + urut, 'core_value', b.kat, b.teks, b.s, urut));
    urut++;
  });

  // Kalibrasi Teknis
  rows.push(_row360_(KALIBRASI.teknis.id, 'kalibrasi', '', KALIBRASI.teknis.teks, ['', ''], 0));

  // 6 butir Teknis
  TEKNIS_BUTIR.forEach(function (b, i) {
    rows.push(_row360_(b.id, 'teknis', '', b.teks, ['', ''], 100 + i + 1));
  });

  appendObjects_('pertanyaan_360', rows);
}

function _row360_(id, tipe, katId, teks, s5, urut) {
  var l = { l1: '', l2: '', l3: '', l4: '', l5: '' };
  if (s5 && s5.length === 2) { l.l1 = s5[0]; l.l5 = s5[1]; }
  else if (s5 && s5.length === 5) { l.l1 = s5[0]; l.l2 = s5[1]; l.l3 = s5[2]; l.l4 = s5[3]; l.l5 = s5[4]; }
  return {
    id: id, tipe: tipe, kategori_id: katId || '', teks: teks,
    label_skala_1: l.l1, label_skala_2: l.l2, label_skala_3: l.l3,
    label_skala_4: l.l4, label_skala_5: l.l5, urutan: urut
  };
}

function _seedOpsiTeknis_() {
  if (readObjects_('opsi_jawaban_teknis').length) return;
  var rows = [];
  TEKNIS_BUTIR.forEach(function (b) {
    TEKNIS_OPSI_TEMPLATE.forEach(function (o) {
      rows.push({
        pertanyaan_id: b.id,
        skor: o.skor,
        teks_label: o.label,
        deskripsi: o.d.replace('%KK%', b.kk)
      });
    });
  });
  appendObjects_('opsi_jawaban_teknis', rows);
}

/* ============================================================================
 * READ — dipakai Assessment360.gs
 * ========================================================================== */

/**
 * Susun definisi kuesioner untuk sebuah penilaian.
 * Opsi jawaban DIACAK DI SERVER; mapping displayIndex→skor dikembalikan supaya
 * submit tetap benar (client mengirim balik token acak + pilihan).
 *
 * @param {{includeTeknis:boolean}} opt
 * @return {{
 *   kalibrasiCore:Object, core:Object[], kalibrasiTeknis:Object|null, teknis:Object[]
 * }}
 */
function buildQuestionnaire_(opt) {
  opt = opt || {};
  var all = readObjects_('pertanyaan_360');
  var kategori = {};
  readObjects_('kategori_core_value').forEach(function (k) { kategori[k.id] = k; });

  var byId = {};
  all.forEach(function (q) { byId[q.id] = q; });

  function scaleOptions_(q) {
    // 5 chip skala 1..5, urutan tampil diacak
    var opts = [1, 2, 3, 4, 5].map(function (n) {
      return { skor: n, label: (q['label_skala_' + n] || String(n)) };
    });
    return shuffle_(opts);
  }

  function narrativeOptions_(qid) {
    var o = readObjects_('opsi_jawaban_teknis')
      .filter(function (r) { return String(r.pertanyaan_id) === String(qid); })
      .map(function (r) { return { skor: Number(r.skor), label: r.teks_label, deskripsi: r.deskripsi }; });
    return shuffle_(o);
  }

  var core = all.filter(function (q) { return q.tipe === 'core_value'; })
    .sort(function (a, b) { return Number(a.urutan) - Number(b.urutan); })
    .map(function (q) {
      var kat = kategori[q.kategori_id] || {};
      return {
        id: q.id, tipe: 'core_value', kategori_id: q.kategori_id,
        kategori_kode: kat.kode_huruf || '', kategori_nama: kat.nama || '',
        teks: q.teks, opsi: scaleOptions_(q)
      };
    });

  var kalCore = byId[KALIBRASI.core.id];
  var kalibrasiCore = kalCore ? {
    id: kalCore.id, tipe: 'kalibrasi', teks: kalCore.teks, opsi: shuffle_([1, 2, 3, 4, 5].map(function (n) { return { skor: n, label: String(n) }; }))
  } : null;

  var teknis = [];
  var kalibrasiTeknis = null;
  if (opt.includeTeknis) {
    teknis = TEKNIS_BUTIR.map(function (b) {
      return { id: b.id, tipe: 'teknis', teks: b.teks, opsi: narrativeOptions_(b.id) };
    });
    var kalT = byId[KALIBRASI.teknis.id];
    kalibrasiTeknis = kalT ? {
      id: kalT.id, tipe: 'kalibrasi', teks: kalT.teks,
      opsi: shuffle_([1, 2, 3, 4, 5].map(function (n) { return { skor: n, label: String(n) }; }))
    } : null;
  }

  return { kalibrasiCore: kalibrasiCore, core: core, kalibrasiTeknis: kalibrasiTeknis, teknis: teknis };
}

/** Set id butir kalibrasi (dipakai Validation.gs & Report.gs untuk eksklusi skor). */
function kalibrasiIds_() {
  return [KALIBRASI.core.id, KALIBRASI.teknis.id];
}

/** Map id pertanyaan core_value → kategori (kode/nama). Dipakai Report.gs. */
function pertanyaanKategoriMap_() {
  var kategori = {};
  readObjects_('kategori_core_value').forEach(function (k) { kategori[k.id] = k; });
  var map = {};
  readObjects_('pertanyaan_360').forEach(function (q) {
    if (q.tipe === 'core_value') {
      var kat = kategori[q.kategori_id] || {};
      map[q.id] = { kategori_id: q.kategori_id, kode: kat.kode_huruf || '', nama: kat.nama || '' };
    }
  });
  return map;
}
