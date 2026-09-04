/* interview.js — Wawancara Appraisal Tahunan: daftar sesi + form. */

var IV = {
  cur: null,

  bind: function () {
    $('btn-ivf-add-rtl').addEventListener('click', function () { IV.addRtlRow(); });
    $('ivf-save').addEventListener('click', function (e) { IV.save(e.currentTarget); });
    $('ivf-confirm').addEventListener('click', function (e) { IV.confirm(e.currentTarget); });
  },

  loadList: function () {
    ['iv-list-atasan', 'iv-list-bawahan'].forEach(function (i) { $(i).innerHTML = '<p class="muted">Memuat…</p>'; });
    apiGet('iv.list', { sessionToken: SESSION.token }).then(function (d) {
      if (!d.periode) {
        $('iv-periode').textContent = 'Belum ada periode Wawancara aktif.';
        ['iv-list-atasan', 'iv-list-bawahan'].forEach(function (i) { $(i).innerHTML = ''; });
        return;
      }
      $('iv-periode').textContent = d.periode.nama + ' · tenggat ' + (d.periode.tanggal_selesai || '-');
      IV._renderList('iv-list-atasan', d.sebagaiAtasan);
      IV._renderList('iv-list-bawahan', d.sebagaiBawahan);
    }).catch(function (e) { toast(e.message, true); });
  },

  _renderList: function (id, arr) {
    var box = $(id); box.innerHTML = '';
    if (!arr.length) { box.innerHTML = '<p class="muted">Tidak ada sesi.</p>'; return; }
    arr.forEach(function (s) {
      var c = el('div', { class: 'card', style: 'margin-bottom:10px;cursor:pointer' });
      c.innerHTML = '<div class="row"><span class="pill">' + esc(s.status) + '</span>' +
        '<strong style="flex:1">' + esc(s.lawan.nama) + '</strong></div>' +
        '<div class="muted" style="font-size:13px">' + esc(s.lawan.jabatan_text || '') + ' · ' + esc(s.lawan.bo || '') + '</div>' +
        '<div class="muted" style="font-size:12px;margin-top:4px">Konfirmasi — atasan: ' +
        (s.konfirmasi_atasan ? '✔' : '—') + ' · bawahan: ' + (s.konfirmasi_bawahan ? '✔' : '—') + '</div>';
      c.addEventListener('click', function () { IV.open(s.sesiId); });
      box.appendChild(c);
    });
  },

  open: function (sesiId) {
    nav('iv-form');
    $('ivf-body').innerHTML = '<p class="muted">Memuat…</p>';
    apiGet('iv.open', { sessionToken: SESSION.token, sesiId: sesiId }).then(function (d) {
      IV.cur = d; IV.cur.sesiId = sesiId;
      var s = d.sesi;
      $('ivf-head').innerHTML =
        '<div><strong>Atasan:</strong> ' + esc(s.atasan.nama) + ' — ' + esc(s.atasan.jabatan_text || '') + '</div>' +
        '<div><strong>Bawahan:</strong> ' + esc(s.bawahan.nama) + ' — ' + esc(s.bawahan.jabatan_text || '') + '</div>' +
        '<div class="muted" style="font-size:12px;margin-top:6px">Peran Anda: <b>' + s.peran + '</b> · Status: ' + esc(s.status) +
        (s.terkunci ? ' · <b style="color:var(--kk-hijau)">TERKUNCI</b>' : '') + '</div>' +
        (s.peran === 'atasan' ? '<label>Tanggal sesi</label><input type="date" id="ivf-tanggal" value="' + esc(s.tanggal_sesi || '') + '">' : '');

      var body = $('ivf-body'); body.innerHTML = '';
      d.pertanyaan.forEach(function (q) {
        var wrap = el('div', { class: 'q' });
        wrap.innerHTML = '<div class="qk">' + esc(q.kategori) + '</div><div class="qt">' + esc(q.teks) + '</div>';
        if (d.selfAppraisalAktif || q.jawaban_self_appraisal) {
          var selfRO = s.peran === 'atasan' || s.terkunci;
          wrap.appendChild(el('label', null, 'Self-appraisal (bawahan)'));
          var ta1 = el('textarea', { id: 'self-' + q.id }); ta1.value = q.jawaban_self_appraisal || '';
          if (selfRO) ta1.setAttribute('readonly', 'readonly');
          wrap.appendChild(ta1);
        }
        wrap.appendChild(el('label', null, 'Catatan atasan'));
        var ta2 = el('textarea', { id: 'note-' + q.id }); ta2.value = q.catatan_atasan || '';
        if (s.peran === 'bawahan' || s.terkunci) ta2.setAttribute('readonly', 'readonly');
        wrap.appendChild(ta2);
        body.appendChild(wrap);
      });

      $('ivf-rtl-wrap').classList.remove('hidden');
      $('ivf-rtl').innerHTML = '';
      (d.rencanaTindakLanjut.length ? d.rencanaTindakLanjut : [{ deskripsi: '', target_waktu: '', status: 'rencana' }])
        .forEach(function (r) { IV.addRtlRow(r); });

      var locked = s.terkunci;
      $('ivf-save').disabled = locked;
      $('ivf-confirm').disabled = locked || (s.peran === 'atasan' ? s.konfirmasi_atasan : s.konfirmasi_bawahan);
    }).catch(function (e) { $('ivf-body').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  },

  addRtlRow: function (r) {
    r = r || {};
    var row = el('div', { class: 'grid2', style: 'margin-bottom:8px' });
    row.innerHTML =
      '<input type="text" class="rtl-desc" placeholder="Deskripsi rencana" value="' + esc(r.deskripsi || '') + '">' +
      '<input type="text" class="rtl-target" placeholder="Target waktu" value="' + esc(r.target_waktu || '') + '">';
    $('ivf-rtl').appendChild(row);
  },

  _collectRtl: function () {
    var out = [];
    Array.prototype.forEach.call($('ivf-rtl').querySelectorAll('.grid2'), function (row) {
      var d = row.querySelector('.rtl-desc').value.trim();
      if (d) out.push({ deskripsi: d, target_waktu: row.querySelector('.rtl-target').value.trim(), status: 'rencana' });
    });
    return out;
  },

  save: function (btn) {
    var d = IV.cur, s = d.sesi;
    busy(btn, true);
    var p;
    if (s.peran === 'bawahan') {
      var ans = {};
      d.pertanyaan.forEach(function (q) { var n = $('self-' + q.id); if (n) ans[q.id] = n.value; });
      p = apiPost('iv.saveSelf', { sessionToken: SESSION.token, sesiId: d.sesiId, answers: ans });
    } else {
      var notes = {};
      d.pertanyaan.forEach(function (q) { notes[q.id] = ($('note-' + q.id) || {}).value || ''; });
      p = apiPost('iv.saveAtasan', {
        sessionToken: SESSION.token, sesiId: d.sesiId, catatan: notes,
        tanggal_sesi: ($('ivf-tanggal') || {}).value || '', rencanaTindakLanjut: IV._collectRtl()
      });
    }
    p.then(function () { busy(btn, false); toast('Tersimpan'); })
      .catch(function (e) { busy(btn, false); toast(e.message, true); });
  },

  confirm: function (btn) {
    if (!confirm('Konfirmasi bahwa sesi wawancara telah dilaksanakan & dicatat dengan benar?')) return;
    busy(btn, true);
    apiPost('iv.confirm', { sessionToken: SESSION.token, sesiId: IV.cur.sesiId }).then(function (d) {
      busy(btn, false);
      toast(d.terkunci ? 'Kedua pihak sudah konfirmasi. Sesi terkunci.' : 'Konfirmasi Anda tercatat. Menunggu pihak lain.');
      IV.loadList(); nav('interview');
    }).catch(function (e) { busy(btn, false); toast(e.message, true); });
  }
};
