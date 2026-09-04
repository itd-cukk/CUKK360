/* home.js — Beranda (dashboard progres + badge) & Panel Admin. */

var Home = {
  load: function () {
    $('home-greeting').textContent = 'Halo, ' + SESSION.nama + ' — ' + SESSION.jabatan_text +
      ' · ' + SESSION.unit + ' / ' + SESSION.bo;

    apiGet('dashboard', { sessionToken: SESSION.token }).then(function (d) {
      if (d.tugasSaya) {
        $('badge-360').textContent = d.tugasSaya.sisa || 0;
        $('badge-360').className = 'badge' + (d.tugasSaya.sisa === 0 ? ' ok' : '');
      }
      if (d.wawancaraSaya) {
        var totIv = d.wawancaraSaya.sebagaiAtasan + d.wawancaraSaya.sebagaiBawahan - d.wawancaraSaya.selesai;
        $('badge-iv').textContent = totIv;
        $('badge-iv').className = 'badge' + (totIv === 0 ? ' ok' : '');
      }
      var body = $('home-progress-body'); body.innerHTML = '';
      if (d.periode360 && d.p360) {
        $('home-progress-sub').textContent = 'Periode 360°: ' + d.periode360.nama +
          ' — tenggat ' + (d.periode360.tanggal_selesai || '-');
        body.appendChild(Home._progressBlock('Penilaian 360°', d.p360));
      } else {
        $('home-progress-sub').textContent = 'Belum ada periode 360° aktif.';
      }
      if (d.periodeWawancara && d.pWawancara) body.appendChild(Home._progressBlock('Wawancara Appraisal', d.pWawancara));
      if (d.kualitas) {
        body.appendChild(el('p', { class: 'muted mt16' },
          'Kualitas data: ' + d.kualitas.gagalKalibrasi + ' gagal kalibrasi · ' + d.kualitas.straightLining +
          ' straight-lining · ' + d.kualitas.jabatanBelumDipetakan + ' jabatan belum dipetakan'));
      }
    }).catch(function (e) { $('home-progress-sub').textContent = e.message; });

    if (SESSION.isAdmin) Admin.refresh();
  },

  _progressBlock: function (title, p) {
    var pct = p.total ? Math.round(p.selesai / p.total * 100) : 0;
    var wrap = el('div', { class: 'mt16' });
    wrap.appendChild(el('div', null, '<strong>' + esc(title) + '</strong> — ' + pct + '% (' + p.selesai + '/' + p.total + ')'));
    var bar = el('div', { class: 'pbar mt8' }); bar.innerHTML = '<i style="width:' + pct + '%"></i>'; wrap.appendChild(bar);
    var rows = Object.keys(p.byGroup || {}).sort().map(function (k) {
      var g = p.byGroup[k]; var gp = g.total ? Math.round(g.selesai / g.total * 100) : 0;
      return '<tr><td>' + esc(k) + '</td><td style="text-align:right">' + g.selesai + '/' + g.total + ' (' + gp + '%)</td></tr>';
    }).join('');
    if (rows) wrap.appendChild(el('table', { class: 'data mt8' }, rows));
    return wrap;
  }
};

var Admin = {
  bind: function () {
    $('btn-imp-preview').addEventListener('click', function () { Admin.importRoster(false); });
    $('btn-imp-apply').addEventListener('click', function () { Admin.importRoster(true); });
    $('btn-add-lvlref').addEventListener('click', function () { Admin.addLevelRef(); });
    $('btn-create-periode').addEventListener('click', function () { Admin.createPeriode(); });
    $('btn-install-triggers').addEventListener('click', function () { Admin.installTriggers(); });
    $('btn-run-reminder').addEventListener('click', function () { Admin.runReminderNow(); });
  },

  refresh: function () {
    apiGet('admin.listLevelRef', { sessionToken: SESSION.token }).then(Admin._renderLevelRef).catch(function () {});
    apiGet('periode.list', { sessionToken: SESSION.token }).then(Admin._renderPeriode).catch(function () {});
    apiGet('admin.masterSummary', { sessionToken: SESSION.token }).then(function (d) {
      $('lvl-perlu').textContent = d.jabatanPerluDipetakan.length
        ? (d.jabatanPerluDipetakan.length + ' jabatan perlu dipetakan: ' +
           d.jabatanPerluDipetakan.slice(0, 8).join(' · ') + (d.jabatanPerluDipetakan.length > 8 ? ' …' : ''))
        : 'Semua jabatan sudah terpetakan.';
    }).catch(function () {});
  },

  importRoster: function (apply) {
    var id = $('imp-id').value.trim();
    if (!id) return toast('Isi ID Spreadsheet sumber', true);
    $('imp-result').textContent = 'Memproses…';
    apiPost('admin.importRoster', {
      sessionToken: SESSION.token, sourceSheetId: id, tabName: $('imp-tab').value.trim(), apply: !!apply
    }).then(function (d) {
      $('imp-result').textContent = JSON.stringify(d, null, 2);
      toast(apply ? (d.summary.ditahanKarenaDuplikat ? 'Ditahan: ada NIA duplikat' : 'Impor selesai') : 'Pratinjau selesai');
      if (apply) Admin.refresh();
    }).catch(function (e) { $('imp-result').textContent = e.message; toast(e.message, true); });
  },

  _renderLevelRef: function (rows) {
    $('lvlref-list').innerHTML = '<div style="overflow-x:auto"><table class="data"><tr><th>Pola</th><th>Level</th><th>Teknis?</th></tr>' +
      rows.map(function (r) {
        var trig = (r.is_trigger_teknis === true || String(r.is_trigger_teknis).toUpperCase() === 'TRUE');
        return '<tr><td>' + esc(r.pola_kata_kunci) + '</td><td>' + esc(r.level) + '</td><td>' + (trig ? '✔' : '—') + '</td></tr>';
      }).join('') + '</table></div>';
  },

  addLevelRef: function () {
    apiPost('admin.upsertLevelRef', {
      sessionToken: SESSION.token,
      pola_kata_kunci: $('lvl-pola').value.trim(), level: $('lvl-level').value, is_trigger_teknis: $('lvl-trig').checked
    }).then(function (rows) { $('lvl-pola').value = ''; Admin._renderLevelRef(rows); toast('Pola ditambahkan'); })
      .catch(function (e) { toast(e.message, true); });
  },

  _renderPeriode: function (rows) {
    $('periode-list').innerHTML = '<div style="overflow-x:auto"><table class="data"><tr><th>Nama</th><th>Jenis</th><th>Tenggat</th><th>Status</th><th></th></tr>' +
      rows.map(function (r) {
        var btns = ['draft', 'aktif', 'tutup'].filter(function (s) { return s !== r.status; })
          .map(function (s) {
            return '<button class="secondary btn-per-status" data-id="' + esc(r.id) + '" data-status="' + s +
              '" style="padding:4px 8px;font-size:12px">' + s + '</button>';
          }).join(' ');
        return '<tr><td>' + esc(r.nama) + '</td><td>' + esc(r.jenis) + '</td><td>' + esc(r.tanggal_selesai || '-') +
          '</td><td><b>' + esc(r.status) + '</b></td><td>' + btns + '</td></tr>';
      }).join('') + '</table></div>';
    Array.prototype.forEach.call(document.querySelectorAll('.btn-per-status'), function (b) {
      b.addEventListener('click', function () { Admin.setPeriode(b.getAttribute('data-id'), b.getAttribute('data-status')); });
    });
  },

  createPeriode: function () {
    apiPost('periode.create', {
      sessionToken: SESSION.token,
      nama: $('per-nama').value.trim(), jenis: $('per-jenis').value,
      tanggal_mulai: $('per-mulai').value, tanggal_selesai: $('per-selesai').value
    }).then(function () { $('per-nama').value = ''; toast('Periode dibuat'); Admin.refresh(); })
      .catch(function (e) { toast(e.message, true); });
  },

  setPeriode: function (id, status) {
    if (status === 'aktif' && !confirm('Mengaktifkan periode akan menjalankan deteksi hierarki & generate penugasan. Lanjut?')) return;
    apiPost('periode.setStatus', { sessionToken: SESSION.token, periodeId: id, status: status }).then(function (d) {
      toast('Status → ' + status + (d.generate ? ' · ' + JSON.stringify(d.generate) : ''));
      Admin.refresh();
    }).catch(function (e) { toast(e.message, true); });
  },

  installTriggers: function () {
    apiPost('admin.installTriggers', { sessionToken: SESSION.token })
      .then(function (m) { toast(typeof m === 'string' ? m : 'Trigger dipasang'); })
      .catch(function (e) { toast(e.message, true); });
  },

  runReminderNow: function () {
    apiPost('admin.runReminderNow', { sessionToken: SESSION.token })
      .then(function (d) { toast('Pengingat dikirim: ' + JSON.stringify(d.pending && d.pending.dikirim !== undefined ? d.pending.dikirim : d.pending)); })
      .catch(function (e) { toast(e.message, true); });
  }
};
