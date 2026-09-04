/* assessment.js — Penilaian 360°: daftar tugas + wizard. */

var Assess = {
  loadList: function () {
    var box = $('asg-list'); box.innerHTML = '<p class="muted">Memuat…</p>';
    apiGet('a360.list', { sessionToken: SESSION.token }).then(function (d) {
      if (!d.periode) { $('asg-periode').textContent = 'Belum ada periode 360° aktif.'; box.innerHTML = ''; return; }
      $('asg-periode').textContent = d.periode.nama + ' · tenggat ' + (d.periode.tanggal_selesai || '-');
      var r = d.ringkasan; var pct = r.total ? Math.round(r.selesai / r.total * 100) : 0;
      $('asg-pbar').style.width = pct + '%';
      $('asg-count').textContent = r.selesai + ' dari ' + r.total + ' tugas selesai (' + pct + '%)';
      box.innerHTML = '';
      if (!d.tasks.length) { box.innerHTML = '<p class="muted">Tidak ada tugas untuk Anda pada periode ini.</p>'; return; }
      d.tasks.forEach(function (t) {
        var done = t.status === 'selesai';
        var card = el('div', { class: 'card', style: 'margin-bottom:10px;cursor:' + (done ? 'default' : 'pointer') });
        card.innerHTML =
          '<div class="row"><span class="pill ' + t.jenis_relasi + '">' + t.jenis_relasi.toUpperCase() + '</span>' +
          (done ? '<span class="pill done">SELESAI</span>' : '') +
          '<strong style="flex:1">' + esc(t.dinilai.nama) + '</strong></div>' +
          '<div class="muted" style="font-size:13px;margin-top:4px">' + esc(t.dinilai.jabatan_text || '') +
          ' · ' + esc(t.dinilai.bo || '') + ' / ' + esc(t.dinilai.area || '') + '</div>';
        card.addEventListener('click', function () { Wizard.open(t.penugasanId); });
        box.appendChild(card);
      });
    }).catch(function (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  }
};

var Wizard = {
  st: null, _saveT: null,

  bind: function () {
    $('btn-wz-back').addEventListener('click', function () {
      if (confirm('Keluar dari formulir? Jawaban tersimpan otomatis sebagai draft.')) nav('assessment');
    });
    $('wz-prev').addEventListener('click', function () { Wizard.go(-1); });
    $('wz-next').addEventListener('click', function () { Wizard.go(1); });
    $('wz-submit').addEventListener('click', function (e) { Wizard.submit(e.currentTarget); });
  },

  open: function (penugasanId) {
    nav('wizard');
    $('wz-context').innerHTML = '<span class="muted">Memuat…</span>';
    $('wz-body').innerHTML = ''; $('wz-unanswered').textContent = '';
    apiGet('a360.open', { sessionToken: SESSION.token, penugasanId: penugasanId }).then(function (d) {
      Wizard.st = {
        penugasanId: penugasanId, formToken: d.formToken, form: d.form, konteks: d.konteks,
        answers: (d.draft && d.draft.answers) || {}, catatan: (d.draft && d.draft.catatan) || '',
        steps: [], cur: 0
      };
      Wizard._buildSteps();
      var k = d.konteks.dinilai;
      $('wz-context').innerHTML =
        '<div class="context-badge">' + esc((k.nama || '?').charAt(0)) + '</div>' +
        '<div><div class="context-name">' + esc(k.nama) +
        ' <span class="pill ' + d.konteks.jenis_relasi + '">' + d.konteks.jenis_relasi.toUpperCase() + '</span></div>' +
        '<div class="context-sub">' + esc(k.jabatan_text) + ' — ' + esc(k.bo) + ' / ' + esc(k.area) + '</div></div>';
      Wizard.renderStep();
    }).catch(function (e) { $('wz-context').innerHTML = '<span class="muted">' + esc(e.message) + '</span>'; });
  },

  _buildSteps: function () {
    var f = Wizard.st.form, steps = [];
    if (f.kalibrasiCore) steps.push({ kind: 'kalibrasi', title: 'Butir Perhatian', help: 'Baca instruksi butir ini baik-baik lalu pilih sesuai perintah.', qs: [f.kalibrasiCore] });

    var byKat = [];
    f.core.forEach(function (q) {
      var g = byKat.filter(function (x) { return x.id === q.kategori_id; })[0];
      if (!g) { g = { id: q.kategori_id, kode: q.kategori_kode, nama: q.kategori_nama, qs: [] }; byKat.push(g); }
      g.qs.push(q);
    });
    byKat.forEach(function (g, i) {
      steps.push({
        kind: 'dimensi', title: (g.kode || '') + ' · ' + (g.nama || 'Dimensi'),
        help: 'Dimensi ke-' + (i + 1) + ' dari 8. Skala 1 = sangat rendah, 5 = sangat tinggi (arti lengkap ada di pilihan ujung).',
        qs: g.qs
      });
    });

    if (f.kalibrasiTeknis) steps.push({ kind: 'kalibrasi', title: 'Butir Perhatian (Teknis)', help: 'Baca instruksi butir ini baik-baik lalu pilih sesuai perintah.', qs: [f.kalibrasiTeknis] });
    if (f.teknis && f.teknis.length) steps.push({ kind: 'teknis', title: 'Kompetensi Teknis Kepemimpinan', help: 'Pilih pernyataan yang paling menggambarkan pimpinan/atasan yang dinilai.', qs: f.teknis });

    steps.push({ kind: 'penutup', title: 'Catatan & Kirim', help: '', qs: [] });
    Wizard.st.steps = steps;
  },

  renderStep: function () {
    var st = Wizard.st, step = st.steps[st.cur], body = $('wz-body');
    body.innerHTML = ''; $('wz-unanswered').textContent = '';

    body.appendChild(el('div', { class: 'wz-stephead' },
      '<div class="wz-stepnum">Langkah ' + (st.cur + 1) + ' / ' + st.steps.length + '</div>' +
      '<h3 style="margin:2px 0 0">' + esc(step.title) + '</h3>' +
      (step.help ? '<div class="muted" style="font-size:12.5px;margin-top:4px">' + esc(step.help) + '</div>' : '')));

    if (step.kind === 'penutup') body.appendChild(Wizard._renderPenutup());
    else step.qs.forEach(function (q) { body.appendChild(Wizard._qCard(q)); });

    var last = st.cur === st.steps.length - 1;
    $('wz-prev').disabled = st.cur === 0;
    $('wz-next').classList.toggle('hidden', last);
    $('wz-submit').classList.toggle('hidden', !last);
    Wizard._updateChrome();

    var top = document.getElementById('view-wizard');
    if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _renderPenutup: function () {
    var ids = Wizard._requiredIds();
    var done = ids.filter(function (id) { return Wizard.st.answers[id] >= 1; }).length;
    var wrap = el('div', { class: 'q-card' });
    wrap.appendChild(el('p', null, '<b>' + done + ' dari ' + ids.length + '</b> pertanyaan terjawab.' +
      (done < ids.length ? ' <span style="color:var(--red)">Lengkapi dulu sebelum mengirim.</span>' : ' Formulir siap dikirim.')));
    wrap.appendChild(el('label', null, 'Catatan khusus untuk pemangku jabatan (opsional)'));
    var ta = el('textarea', { placeholder: 'Masukan / observasi tambahan…' });
    ta.value = Wizard.st.catatan || '';
    ta.addEventListener('input', function () { Wizard.st.catatan = ta.value; Wizard.autosave(); });
    wrap.appendChild(ta);
    return wrap;
  },

  _qCard: function (q) {
    var narrative = q.opsi.length && q.opsi[0].deskripsi != null;
    var wrap = el('div', { class: 'q-card', id: 'q-' + q.id });
    wrap.appendChild(el('div', { class: 'qt' }, esc(q.teks)));
    var scale = el('div', { class: 'scale' + (narrative ? ' narrative' : '') });
    q.opsi.forEach(function (o) {
      var chip = el('div', { class: 'chip' + (narrative ? ' narrow' : '') });
      if (narrative) chip.innerHTML = '<strong>' + esc(o.label) + '</strong><small>' + esc(o.deskripsi) + '</small>';
      else chip.innerHTML = '<span class="chip-num">' + o.skor + '</span>' +
        (o.label && o.label !== String(o.skor) ? '<small>' + esc(o.label) + '</small>' : '');
      if (Wizard.st.answers[q.id] === o.skor) chip.classList.add('sel');
      chip.addEventListener('click', function () {
        Wizard.st.answers[q.id] = o.skor;
        Array.prototype.forEach.call(scale.querySelectorAll('.chip'), function (c) { c.classList.remove('sel'); });
        chip.classList.add('sel');
        wrap.classList.remove('unanswered');
        $('wz-unanswered').textContent = '';
        Wizard._updateChrome();
        Wizard.autosave();
      });
      scale.appendChild(chip);
    });
    wrap.appendChild(scale);
    return wrap;
  },

  _requiredIds: function () {
    var ids = [];
    Wizard.st.steps.forEach(function (s) { if (s.kind !== 'penutup') s.qs.forEach(function (q) { ids.push(q.id); }); });
    return ids;
  },
  _stepComplete: function (i) {
    var step = Wizard.st.steps[i];
    if (!step || step.kind === 'penutup') return true;
    return step.qs.every(function (q) { return Wizard.st.answers[q.id] >= 1; });
  },
  _allAnswered: function () {
    return Wizard._requiredIds().every(function (id) { return Wizard.st.answers[id] >= 1; });
  },

  go: function (dir) {
    var st = Wizard.st;
    if (dir > 0 && !Wizard._stepComplete(st.cur)) {
      st.steps[st.cur].qs.forEach(function (q) {
        if (!(st.answers[q.id] >= 1)) { var n = $('q-' + q.id); if (n) n.classList.add('unanswered'); }
      });
      $('wz-unanswered').textContent = 'Jawab semua pertanyaan di langkah ini dulu.';
      return;
    }
    st.cur = Math.max(0, Math.min(st.steps.length - 1, st.cur + dir));
    Wizard.renderStep();
  },

  _updateChrome: function () {
    var ids = Wizard._requiredIds();
    var done = ids.filter(function (id) { return Wizard.st.answers[id] >= 1; }).length;
    $('wz-pbar').style.width = (ids.length ? Math.round(done / ids.length * 100) : 0) + '%';
    var step = Wizard.st.steps[Wizard.st.cur];
    $('wz-progress').textContent = 'Langkah ' + (Wizard.st.cur + 1) + '/' + Wizard.st.steps.length +
      ' · ' + step.title + '  —  ' + done + '/' + ids.length + ' terjawab';
    $('wz-next').disabled = !Wizard._stepComplete(Wizard.st.cur);
    $('wz-submit').disabled = !Wizard._allAnswered();
  },

  autosave: function () {
    clearTimeout(Wizard._saveT);
    $('wz-autosave').textContent = 'menyimpan…';
    Wizard._saveT = setTimeout(function () {
      apiPost('a360.saveDraft', {
        sessionToken: SESSION.token, penugasanId: Wizard.st.penugasanId,
        answers: Wizard.st.answers, catatan: Wizard.st.catatan || ''
      }).then(function () { $('wz-autosave').textContent = 'tersimpan otomatis'; })
        .catch(function () { $('wz-autosave').textContent = ''; });
    }, 900);
  },

  submit: function (btn) {
    if (!Wizard._allAnswered()) {
      var firstBad = Wizard._requiredIds().filter(function (id) { return !(Wizard.st.answers[id] >= 1); })[0];
      for (var i = 0; i < Wizard.st.steps.length; i++) {
        if ((Wizard.st.steps[i].qs || []).some(function (q) { return q.id === firstBad; })) { Wizard.st.cur = i; break; }
      }
      Wizard.renderStep();
      $('wz-unanswered').textContent = 'Masih ada pertanyaan belum dijawab (disorot merah).';
      return;
    }
    busy(btn, true);
    apiPost('a360.submit', {
      sessionToken: SESSION.token, penugasanId: Wizard.st.penugasanId, formToken: Wizard.st.formToken,
      answers: Wizard.st.answers, catatan: Wizard.st.catatan || ''
    }).then(function (d) {
      busy(btn, false);
      var kq = d.kualitasData || {};
      toast(kq.flagged ? 'Terkirim. Jawaban ditandai untuk ditinjau HCMD.' : 'Penilaian berhasil dikirim. Terima kasih!');
      nav('assessment');
    }).catch(function (e) { busy(btn, false); toast(e.message, true); });
  }
};
