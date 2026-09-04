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
    $('wz-submit').addEventListener('click', function (e) { Wizard.submit(e.currentTarget); });
    $('wz-catatan').addEventListener('input', function () { Wizard.autosave(); });
  },

  open: function (penugasanId) {
    nav('wizard');
    $('wz-context').innerHTML = '<p class="muted">Memuat…</p>';
    ['wz-step-kal-core', 'wz-step-core', 'wz-step-kal-teknis', 'wz-step-teknis'].forEach(function (i) { $(i).innerHTML = ''; });
    $('wz-unanswered').textContent = ''; $('wz-catatan').value = '';
    apiGet('a360.open', { sessionToken: SESSION.token, penugasanId: penugasanId }).then(function (d) {
      Wizard.st = { penugasanId: penugasanId, formToken: d.formToken, answers: {}, form: d.form, konteks: d.konteks };
      if (d.draft && d.draft.answers) { Wizard.st.answers = d.draft.answers; $('wz-catatan').value = d.draft.catatan || ''; }
      var k = d.konteks.dinilai;
      $('wz-context').innerHTML =
        '<div class="row"><span class="pill ' + d.konteks.jenis_relasi + '">' + d.konteks.jenis_relasi.toUpperCase() + '</span>' +
        '<strong>' + esc(k.nama) + '</strong></div>' +
        '<div class="muted" style="font-size:13px;margin-top:4px">' + esc(k.jabatan_text) + ' · ' + esc(k.bo) + ' / ' + esc(k.area) +
        ' · Level: ' + esc(k.level) + '</div>' +
        (d.konteks.includeTeknis ? '<div class="mt8" style="font-size:12px;color:var(--kk-biru)">Termasuk kuesioner Kompetensi Teknis Kepemimpinan</div>' : '');
      Wizard.render();
    }).catch(function (e) { $('wz-context').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  },

  render: function () {
    var f = Wizard.st.form;
    if (f.kalibrasiCore) $('wz-step-kal-core').appendChild(Wizard._qCard(f.kalibrasiCore, 'Kalibrasi — Core Values'));
    var cont = $('wz-step-core');
    cont.appendChild(el('h3', null, 'Kuesioner Core Values INVICTUS'));
    f.core.forEach(function (q) { cont.appendChild(Wizard._qCard(q)); });
    if (f.kalibrasiTeknis) $('wz-step-kal-teknis').appendChild(Wizard._qCard(f.kalibrasiTeknis, 'Kalibrasi — Teknis'));
    if (f.teknis && f.teknis.length) {
      var tc = $('wz-step-teknis');
      tc.appendChild(el('h3', null, 'Kompetensi Teknis Kepemimpinan'));
      f.teknis.forEach(function (q) { tc.appendChild(Wizard._qCard(q)); });
    }
    Wizard.updateProgress();
  },

  _qCard: function (q, heading) {
    var wrap = el('div', { class: 'q', id: 'q-' + q.id });
    if (heading) wrap.appendChild(el('div', { class: 'qk' }, heading));
    if (q.kategori_nama) wrap.appendChild(el('div', { class: 'qk' }, q.kategori_kode + ' · ' + q.kategori_nama));
    wrap.appendChild(el('div', { class: 'qt' }, esc(q.teks)));
    var narrative = q.opsi.length && q.opsi[0].deskripsi != null;
    var scale = el('div', { class: 'scale' + (narrative ? ' narrative' : '') });
    q.opsi.forEach(function (o) {
      var chip = el('div', { class: 'chip' + (narrative ? ' narrow' : '') });
      chip.innerHTML = narrative
        ? '<strong>' + esc(o.label) + '</strong><small>' + esc(o.deskripsi) + '</small>'
        : esc(o.label ? o.label : o.skor) + (o.label && o.label !== String(o.skor) ? '<small>' + o.skor + '</small>' : '<small>&nbsp;</small>');
      if (Wizard.st.answers[q.id] === o.skor) chip.classList.add('sel');
      chip.addEventListener('click', function () {
        Wizard.st.answers[q.id] = o.skor;
        Array.prototype.forEach.call(scale.querySelectorAll('.chip'), function (c) { c.classList.remove('sel'); });
        chip.classList.add('sel');
        wrap.classList.remove('unanswered');
        Wizard.updateProgress(); Wizard.autosave();
      });
      scale.appendChild(chip);
    });
    wrap.appendChild(scale);
    return wrap;
  },

  _requiredIds: function () {
    var f = Wizard.st.form, ids = [];
    if (f.kalibrasiCore) ids.push(f.kalibrasiCore.id);
    f.core.forEach(function (q) { ids.push(q.id); });
    if (f.kalibrasiTeknis) ids.push(f.kalibrasiTeknis.id);
    (f.teknis || []).forEach(function (q) { ids.push(q.id); });
    return ids;
  },

  updateProgress: function () {
    var ids = Wizard._requiredIds();
    var done = ids.filter(function (id) { return Wizard.st.answers[id] >= 1; }).length;
    var pct = ids.length ? Math.round(done / ids.length * 100) : 0;
    $('wz-pbar').style.width = pct + '%';
    $('wz-progress').textContent = done + ' dari ' + ids.length + ' terjawab';
    $('wz-submit').disabled = done < ids.length;
  },

  autosave: function () {
    clearTimeout(Wizard._saveT);
    $('wz-autosave').textContent = 'menyimpan…';
    Wizard._saveT = setTimeout(function () {
      apiPost('a360.saveDraft', {
        sessionToken: SESSION.token, penugasanId: Wizard.st.penugasanId,
        answers: Wizard.st.answers, catatan: $('wz-catatan').value
      }).then(function () { $('wz-autosave').textContent = 'tersimpan otomatis'; })
        .catch(function () { $('wz-autosave').textContent = ''; });
    }, 900);
  },

  submit: function (btn) {
    var ids = Wizard._requiredIds();
    var belum = ids.filter(function (id) { return !(Wizard.st.answers[id] >= 1); });
    if (belum.length) {
      belum.forEach(function (id) { var n = $('q-' + id); if (n) n.classList.add('unanswered'); });
      $('wz-unanswered').textContent = 'Masih ada ' + belum.length + ' pertanyaan belum dijawab (disorot merah).';
      var first = $('q-' + belum[0]); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    busy(btn, true);
    apiPost('a360.submit', {
      sessionToken: SESSION.token, penugasanId: Wizard.st.penugasanId, formToken: Wizard.st.formToken,
      answers: Wizard.st.answers, catatan: $('wz-catatan').value
    }).then(function (d) {
      busy(btn, false);
      var kq = d.kualitasData || {};
      toast(kq.flagged ? 'Terkirim. Catatan: jawaban ditandai untuk ditinjau HCMD.' : 'Penilaian berhasil dikirim. Terima kasih!');
      nav('assessment');
    }).catch(function (e) { busy(btn, false); toast(e.message, true); });
  }
};
