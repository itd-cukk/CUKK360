/**
 * Period.gs — Periode penilaian & pembangkitan penugasan otomatis.
 *
 * FR-12..FR-14, BR-01 (wajib self), BR-02 (atasan-bawahan), BR-03 (min peer),
 * BR-10 (tidak lintas unit).
 */

/** Jumlah minimal rekan selevel yang harus dinilai (BR-03). Konfigurabel. */
function peerMin_() {
  return Number(scriptProps_().getProperty('PEER_MIN') || 2);
}

/* ============================================================================
 * CRUD PERIODE
 * ========================================================================== */

/**
 * @param {string} sessionToken
 * @param {{nama:string, jenis:('360'|'wawancara'), tanggal_mulai:string, tanggal_selesai:string}} p
 */
function periodeCreate(sessionToken, p) {
  try {
    requireAdmin_(sessionToken);
    p = p || {};
    if (!p.nama) return err_('Nama periode wajib.', 'VALIDATION');
    if (['360', 'wawancara'].indexOf(p.jenis) === -1) return err_('Jenis harus 360 atau wawancara.', 'VALIDATION');
    var row = {
      id: shortId_('per'),
      nama: p.nama,
      jenis: p.jenis,
      tanggal_mulai: p.tanggal_mulai || '',
      tanggal_selesai: p.tanggal_selesai || '',
      status: 'draft'
    };
    appendObject_('periode_penilaian', row);
    _audit_('SYSTEM', 'periode_create', row);
    return ok_(row);
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/** Ubah status: draft → aktif → tutup. Saat → aktif, jalankan generate. */
function periodeSetStatus(sessionToken, periodeId, status) {
  try {
    requireAdmin_(sessionToken);
    if (['draft', 'aktif', 'tutup'].indexOf(status) === -1) return err_('Status tidak valid.', 'VALIDATION');
    var per = _findPeriode_(periodeId);
    if (!per) return err_('Periode tidak ditemukan.', 'NOT_FOUND');

    updateRow_('periode_penilaian', per.__row, { status: status });

    var extra = null;
    if (status === 'aktif') {
      if (per.jenis === '360') {
        detectHierarchy_(periodeId);
        extra = generateAssignments_(periodeId);
      } else {
        detectHierarchy_(periodeId);
        extra = generateInterviewSessions_(periodeId);
      }
    }
    _audit_('SYSTEM', 'periode_set_status', { periodeId: periodeId, status: status, extra: extra });
    return ok_({ periodeId: periodeId, status: status, generate: extra });
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

function periodeList(sessionToken) {
  try {
    requireSession_(sessionToken);
    return ok_(readObjects_('periode_penilaian').map(_stripRow_));
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

function _findPeriode_(id) {
  var rows = readObjects_('periode_penilaian');
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
  return null;
}

/**
 * Periode aktif untuk sebuah jenis. Bila lebih dari satu, ambil yang terbaru dibuat.
 * @param {('360'|'wawancara')} jenis
 * @return {Object|null}
 */
function getActivePeriode_(jenis) {
  var rows = readObjects_('periode_penilaian').filter(function (r) {
    return String(r.status) === 'aktif' && (!jenis || String(r.jenis) === String(jenis));
  });
  if (!rows.length) return null;
  return _stripRow_(rows[rows.length - 1]);
}

function _stripRow_(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { if (k !== '__row') c[k] = o[k]; });
  return c;
}

/* ============================================================================
 * GENERATE PENUGASAN 360 (FR-13)
 * ========================================================================== */

/**
 * Bangkitkan seluruh baris `penugasan_penilaian` untuk periode 360.
 * Idemponten sebagian: penugasan yang sudah `selesai` dipertahankan; sisanya
 * (belum/proses) dibangun ulang mengikuti Master Data + hierarki terkini.
 *
 * Jenis relasi: self | peer | atasan | bawahan
 *   - atasan  : baris di mana nia_penilai adalah ATASAN menilai bawahannya (downward)
 *   - bawahan : baris di mana nia_penilai adalah BAWAHAN menilai atasannya (upward)
 *
 * @param {string} periodeId
 * @return {{self:number, peer:number, atasan:number, bawahan:number, total:number, dipertahankan:number}}
 */
function generateAssignments_(periodeId) {
  return withLock_(function () {
    var aktivis = getAktivisCached_().filter(function (a) { return a.status_aktif; });
    var byNia = {};
    aktivis.forEach(function (a) { byNia[a.nia] = a; });

    // enrich level
    aktivis.forEach(function (a) { a._level = resolveLevelJabatan_(a.jabatan_text).level; });

    var existing = readObjects_('penugasan_penilaian').filter(function (r) {
      return String(r.periode_id) === String(periodeId);
    });
    var keep = existing.filter(function (r) { return String(r.status) === 'selesai'; });
    var keepKeys = {};
    keep.forEach(function (r) { keepKeys[_asgKey_(r.nia_penilai, r.nia_dinilai, r.jenis_relasi)] = true; });

    // hapus penugasan belum selesai utk periode ini
    _deletePenugasanBelumSelesai_(periodeId);

    var toAdd = [];
    function add(penilai, dinilai, relasi) {
      var key = _asgKey_(penilai, dinilai, relasi);
      if (keepKeys[key]) return; // sudah ada & selesai
      if (normalizeNia_(penilai) === normalizeNia_(dinilai) && relasi !== 'self') return;
      // BR-10: hanya dalam unit yang sama
      var p = byNia[normalizeNia_(penilai)], d = byNia[normalizeNia_(dinilai)];
      if (!p || !d || p.unit !== d.unit) return;
      keepKeys[key] = true;
      toAdd.push({
        id: shortId_('asg'), periode_id: periodeId,
        nia_penilai: normalizeNia_(penilai), nia_dinilai: normalizeNia_(dinilai),
        jenis_relasi: relasi, status: 'belum'
      });
    }

    var count = { self: 0, peer: 0, atasan: 0, bawahan: 0 };

    // 1) SELF — 1 per aktivis aktif
    aktivis.forEach(function (a) { add(a.nia, a.nia, 'self'); });

    // 2) PEER — sesama unit+bo+level, minimal peerMin_(); acak pilihannya
    var grup = {};
    aktivis.forEach(function (a) {
      var k = a.unit + '||' + a.bo + '||' + a._level;
      (grup[k] = grup[k] || []).push(a);
    });
    var N = peerMin_();
    Object.keys(grup).forEach(function (k) {
      var anggota = grup[k];
      if (anggota.length < 2) return;
      anggota.forEach(function (a) {
        var kandidat = anggota.filter(function (x) { return x.nia !== a.nia; });
        var pilih = shuffle_(kandidat).slice(0, Math.max(N, Math.min(kandidat.length, N)));
        // bila anggota < N+1, nilai semua yang ada
        if (kandidat.length <= N) pilih = kandidat;
        pilih.forEach(function (x) { add(a.nia, x.nia, 'peer'); });
      });
    });

    // 3) ATASAN & BAWAHAN — dari hierarki_terdeteksi periode ini
    var hir = readObjects_('hierarki_terdeteksi').filter(function (h) {
      return String(h.periode_id) === String(periodeId);
    });
    hir.forEach(function (h) {
      var atasan = normalizeNia_(h.nia_atasan), bawahan = normalizeNia_(h.nia_bawahan);
      if (!byNia[atasan] || !byNia[bawahan]) return;
      add(atasan, bawahan, 'atasan');   // atasan menilai bawahan (downward)
      add(bawahan, atasan, 'bawahan');  // bawahan menilai atasan (upward)
    });

    if (toAdd.length) appendObjects_('penugasan_penilaian', toAdd);
    toAdd.forEach(function (r) { count[r.jenis_relasi]++; });

    var res = {
      self: count.self, peer: count.peer, atasan: count.atasan, bawahan: count.bawahan,
      total: toAdd.length, dipertahankan: keep.length
    };
    _audit_('SYSTEM', 'generate_assignments', Object.assign({ periodeId: periodeId }, res));
    return res;
  });
}

function _asgKey_(penilai, dinilai, relasi) {
  return normalizeNia_(penilai) + '>' + normalizeNia_(dinilai) + '#' + relasi;
}

function _deletePenugasanBelumSelesai_(periodeId) {
  var sh = getSheet_('penugasan_penilaian');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return;
  var iPer = SCHEMA.penugasan_penilaian.indexOf('periode_id');
  var iStat = SCHEMA.penugasan_penilaian.indexOf('status');
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][iPer]) === String(periodeId) && String(values[r][iStat]) !== 'selesai') {
      sh.deleteRow(r + 1);
    }
  }
}
