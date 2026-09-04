/**
 * Notification.gs — Pengingat otomatis (FR-38) & ringkasan progres ke Admin (FR-39).
 * Menggunakan MailApp bawaan Apps Script.
 */

/**
 * Kirim pengingat ke aktivis yang belum menuntaskan tugas 360 / sesi wawancara,
 * hanya bila hari ini termasuk H-3 atau H-1 sebelum tanggal_selesai periode aktif.
 * @param {{force?:boolean}=} opt force=true → abaikan cek H-3/H-1 (untuk uji manual)
 * @return {{dikirim:number, dilewati:number, detailPerPeriode:Object[]}}
 */
function notifyPendingTasks_(opt) {
  opt = opt || {};
  var hasil = { dikirim: 0, dilewati: 0, detailPerPeriode: [] };
  var periodes = readObjects_('periode_penilaian').filter(function (p) { return String(p.status) === 'aktif'; });

  periodes.forEach(function (per) {
    var dday = _hariMenujuDeadline_(per.tanggal_selesai);
    var kirimHariIni = opt.force || dday === 3 || dday === 1;
    var d = { periode: per.nama, jenis: per.jenis, hariMenujuDeadline: dday, kirim: kirimHariIni, target: 0 };

    if (kirimHariIni) {
      var pending = per.jenis === '360' ? _pendingPenilai360_(per.id) : _pendingPihakWawancara_(per.id);
      Object.keys(pending).forEach(function (nia) {
        var prof = getProfil_(nia);
        if (!prof || !prof.email) { hasil.dilewati++; return; }
        var info = pending[nia];
        try {
          MailApp.sendEmail({
            to: prof.email,
            subject: '[' + APP_NAME + '] Pengingat: ' + info.jumlah + ' tugas belum selesai — ' + per.nama,
            htmlBody: _tmplPengingat_(prof, per, info, dday)
          });
          hasil.dikirim++; d.target++;
        } catch (e) { hasil.dilewati++; Logger.log('kirim pengingat gagal ' + nia + ': ' + e); }
      });
    }
    hasil.detailPerPeriode.push(d);
  });

  _audit_('SYSTEM', 'notify_pending', hasil);
  return hasil;
}

/**
 * Ringkasan progres pengisian per unit/branch ke seluruh NIA Admin.
 * @return {{dikirim:number}}
 */
function notifyAdminProgress_() {
  var admins = getAdminNias_().map(getProfil_).filter(function (p) { return p && p.email; });
  if (!admins.length) return { dikirim: 0 };

  var laporan = [];
  readObjects_('periode_penilaian').filter(function (p) { return String(p.status) === 'aktif'; }).forEach(function (per) {
    laporan.push(per.jenis === '360' ? _progres360_(per) : _progresWawancara_(per));
  });

  var html = '<div style="font-family:Arial,sans-serif">' +
    '<h2 style="color:#c0392b">' + APP_NAME + ' — Ringkasan Progres</h2>' +
    '<p>' + Utilities.formatDate(new Date(), TZ, 'EEEE, dd MMM yyyy HH:mm') + '</p>' +
    laporan.map(_tmplProgresBlok_).join('') + '</div>';

  var dikirim = 0;
  admins.forEach(function (a) {
    try {
      MailApp.sendEmail({ to: a.email, subject: '[' + APP_NAME + '] Ringkasan Progres Pengisian', htmlBody: html });
      dikirim++;
    } catch (e) { Logger.log('kirim progres admin gagal: ' + e); }
  });
  _audit_('SYSTEM', 'notify_admin_progress', { dikirim: dikirim, periode: laporan.length });
  return { dikirim: dikirim };
}

/* ============================================================================
 * INTERNAL
 * ========================================================================== */

function _hariMenujuDeadline_(tglSelesai) {
  if (!tglSelesai) return -999;
  var end = new Date(String(tglSelesai) + 'T23:59:59');
  if (isNaN(end.getTime())) return -999;
  var now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
}

/** { nia_penilai: {jumlah, contoh:[nama...]} } untuk penugasan 360 belum selesai. */
function _pendingPenilai360_(periodeId) {
  var out = {};
  readObjects_('penugasan_penilaian').forEach(function (r) {
    if (String(r.periode_id) !== String(periodeId)) return;
    if (String(r.status) === 'selesai') return;
    var nia = normalizeNia_(r.nia_penilai);
    if (!out[nia]) out[nia] = { jumlah: 0, jenis: '360', contoh: [] };
    out[nia].jumlah++;
    var d = getProfil_(r.nia_dinilai);
    if (d && out[nia].contoh.length < 5) out[nia].contoh.push(d.nama + ' (' + r.jenis_relasi + ')');
  });
  return out;
}

/** Pihak wawancara (atasan/bawahan) yang sesinya belum selesai. */
function _pendingPihakWawancara_(periodeId) {
  var out = {};
  readObjects_('sesi_wawancara').forEach(function (r) {
    if (String(r.periode_id) !== String(periodeId)) return;
    if (String(r.status) === 'selesai') return;
    [r.nia_atasan, r.nia_bawahan].forEach(function (nia) {
      var n = normalizeNia_(nia);
      if (!out[n]) out[n] = { jumlah: 0, jenis: 'wawancara', contoh: [] };
      out[n].jumlah++;
    });
  });
  return out;
}

function _progres360_(per) {
  var rows = readObjects_('penugasan_penilaian').filter(function (r) { return String(r.periode_id) === String(per.id); });
  var byUnit = {};
  rows.forEach(function (r) {
    var p = getProfil_(r.nia_penilai) || {};
    var key = (p.unit || '?') + ' / ' + (p.area || '?');
    if (!byUnit[key]) byUnit[key] = { total: 0, selesai: 0 };
    byUnit[key].total++;
    if (String(r.status) === 'selesai') byUnit[key].selesai++;
  });
  return { judul: 'Penilaian 360 — ' + per.nama, jenis: '360', deadline: per.tanggal_selesai, byGroup: byUnit,
    total: rows.length, selesai: rows.filter(function (r) { return String(r.status) === 'selesai'; }).length };
}

function _progresWawancara_(per) {
  var rows = readObjects_('sesi_wawancara').filter(function (r) { return String(r.periode_id) === String(per.id); });
  var byUnit = {};
  rows.forEach(function (r) {
    var a = getProfil_(r.nia_atasan) || {};
    var key = (a.unit || '?') + ' / ' + (a.area || '?');
    if (!byUnit[key]) byUnit[key] = { total: 0, selesai: 0 };
    byUnit[key].total++;
    if (String(r.status) === 'selesai') byUnit[key].selesai++;
  });
  return { judul: 'Wawancara Appraisal — ' + per.nama, jenis: 'wawancara', deadline: per.tanggal_selesai, byGroup: byUnit,
    total: rows.length, selesai: rows.filter(function (r) { return String(r.status) === 'selesai'; }).length };
}

/* -------- template email -------- */

function _tmplPengingat_(prof, per, info, dday) {
  var url = _webAppUrl_();
  return '<div style="font-family:Arial,sans-serif;max-width:560px">' +
    '<h2 style="color:#c0392b;margin:0 0 4px">' + APP_NAME + '</h2>' +
    '<p>Halo <b>' + prof.nama + '</b>,</p>' +
    '<p>Anda masih memiliki <b>' + info.jumlah + '</b> tugas ' +
    (info.jenis === '360' ? 'Penilaian 360' : 'Sesi Wawancara Appraisal') +
    ' yang belum diselesaikan pada periode <b>' + per.nama + '</b>.</p>' +
    (dday > 0 ? '<p style="color:#c0392b"><b>Tenggat tinggal ' + dday + ' hari lagi (' + per.tanggal_selesai + ').</b></p>' : '') +
    (info.contoh && info.contoh.length ? '<ul>' + info.contoh.map(function (c) { return '<li>' + c + '</li>'; }).join('') + '</ul>' : '') +
    (url ? '<p><a href="' + url + '" style="background:#c0392b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Buka Aplikasi</a></p>' : '') +
    '<p style="color:#888;font-size:12px">Email otomatis — mohon tidak dibalas.</p></div>';
}

function _tmplProgresBlok_(l) {
  var pct = l.total ? Math.round(l.selesai / l.total * 100) : 0;
  var baris = Object.keys(l.byGroup).sort().map(function (k) {
    var g = l.byGroup[k];
    var p = g.total ? Math.round(g.selesai / g.total * 100) : 0;
    return '<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">' + k + '</td>' +
      '<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">' + g.selesai + ' / ' + g.total + ' (' + p + '%)</td></tr>';
  }).join('');
  return '<h3 style="margin:16px 0 4px">' + l.judul + ' — ' + pct + '% (' + l.selesai + '/' + l.total + ')</h3>' +
    '<p style="margin:0 0 4px;color:#666">Tenggat: ' + (l.deadline || '-') + '</p>' +
    '<table style="border-collapse:collapse;font-size:13px">' + baris + '</table>';
}

function _webAppUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}
