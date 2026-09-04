/* report.js — Laporan: individu (radar + bar), agregat, kualitas data. */

var Report = {
  _radar: null, _bar: null, _inited: false,

  bind: function () {
    $('btn-rep-individu').addEventListener('click', function () { Report.loadIndividu(); });
    $('btn-rep-pdf').addEventListener('click', function () { Report.downloadPdf(); });
    $('btn-rep-agregat').addEventListener('click', function () { Report.loadAgregat(); });
    $('btn-rep-excel').addEventListener('click', function () { Report.exportExcel(); });
    $('btn-rep-kualitas').addEventListener('click', function () { Report.loadKualitas(); });
  },

  init: function () {
    if (Report._inited) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-rtab]'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.rtab'), function (x) { x.classList.add('hidden'); });
        $('rtab-' + b.getAttribute('data-rtab')).classList.remove('hidden');
      });
    });
    Report._inited = true;
  },

  loadIndividu: function () {
    var nia = $('rep-nia').value.trim();
    var box = $('rep-ind-body'); box.innerHTML = '<p class="muted">Memuat…</p>';
    apiGet('report.individu', { sessionToken: SESSION.token, niaTarget: nia }).then(function (d) {
      var rel = d.perbandinganRelasi || {};
      box.innerHTML =
        '<h3 class="mb0">' + esc(d.profil.nama) + ' <span class="muted">(' + esc(d.profil.nia) + ')</span></h3>' +
        '<div class="muted">' + esc(d.profil.jabatan_text) + ' · ' + esc(d.profil.unit) + ' / ' + esc(d.profil.bo) + ' / ' + esc(d.profil.area) + '</div>' +
        '<p class="mt8">Periode <b>' + esc(d.periode.nama) + '</b> · Skor keseluruhan: <b>' + (d.overall == null ? '-' : d.overall) +
        '</b> · Predikat: <b>' + esc(d.predikat) + '</b>' +
        (d.teknis != null ? ' · Teknis Kepemimpinan: <b>' + d.teknis + '</b>' : '') + '</p>' +
        (!d.adaData ? '<p class="muted">Belum ada data penilaian masuk untuk aktivis ini.</p>' : '') +
        (d.wawancara ? '<p class="muted">Wawancara Appraisal: status <b>' + esc(d.wawancara.status) + '</b>' +
          (d.wawancara.tanggal_sesi ? ' · ' + esc(d.wawancara.tanggal_sesi) : '') + '</p>' : '');
      Report._drawRadar(d.radar || []);
      Report._drawBar(rel);
    }).catch(function (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  },

  _drawRadar: function (radar) {
    if (typeof Chart === 'undefined') return;
    var ctx = $('rep-radar').getContext('2d');
    if (Report._radar) Report._radar.destroy();
    Report._radar = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: radar.map(function (r) { return r.kode + '·' + r.nama; }),
        datasets: [{
          label: 'Skor Dimensi', data: radar.map(function (r) { return r.skor; }),
          backgroundColor: 'rgba(30,111,184,.18)', borderColor: '#1e6fb8', pointBackgroundColor: '#c0392b'
        }]
      },
      options: { scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
    });
  },

  _drawBar: function (rel) {
    if (typeof Chart === 'undefined') return;
    var ctx = $('rep-bar').getContext('2d');
    if (Report._bar) Report._bar.destroy();
    Report._bar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Self', 'Peer', 'Atasan', 'Bawahan'],
        datasets: [{
          label: 'Rata-rata skor', data: [rel.self || 0, rel.peer || 0, rel.atasan || 0, rel.bawahan || 0],
          backgroundColor: ['#1e6fb8', '#27913f', '#c0392b', '#b26a00']
        }]
      },
      options: { scales: { y: { min: 0, max: 5 } }, plugins: { legend: { display: false } } }
    });
  },

  downloadPdf: function () {
    var nia = $('rep-nia').value.trim();
    toast('Menyiapkan PDF…');
    apiGet('report.individuPdf', { sessionToken: SESSION.token, niaTarget: nia }).then(function (d) {
      var a = document.createElement('a');
      a.href = d.dataUri; a.download = d.filename;
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { toast(e.message, true); });
  },

  loadAgregat: function () {
    var box = $('rep-agg-body'); box.innerHTML = '<p class="muted">Memuat…</p>';
    apiGet('report.agregat', { sessionToken: SESSION.token, groupBy: $('rep-groupby').value }).then(function (d) {
      if (!d.baris.length) { box.innerHTML = '<p class="muted">Belum ada data.</p>'; return; }
      var dims = Object.keys(d.baris[0].perDimensi);
      var head = '<tr><th>#</th><th>' + d.groupBy.toUpperCase() + '</th><th>Aktivis</th><th>Rata</th><th>Predikat</th>' +
        dims.map(function (k) { return '<th>' + esc(k.split('·')[0]) + '</th>'; }).join('') + '</tr>';
      var rows = d.baris.map(function (r) {
        return '<tr><td>' + r.peringkat + '</td><td>' + esc(r.grup) + '</td><td>' + r.jumlahAktivis + '</td>' +
          '<td><b>' + (r.rataOverall == null ? '-' : r.rataOverall) + '</b></td><td>' + esc(r.predikat) + '</td>' +
          dims.map(function (k) { return '<td>' + (r.perDimensi[k] == null ? '-' : r.perDimensi[k]) + '</td>'; }).join('') + '</tr>';
      }).join('');
      box.innerHTML = '<div style="overflow-x:auto"><table class="data">' + head + rows + '</table></div>';
    }).catch(function (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  },

  exportExcel: function () {
    apiGet('report.excelUrl', { sessionToken: SESSION.token })
      .then(function (d) { window.open(d.url, '_blank'); })
      .catch(function (e) { toast(e.message, true); });
  },

  loadKualitas: function () {
    var box = $('rep-qual-body'); box.innerHTML = '<p class="muted">Memuat…</p>';
    apiGet('validation.report', { sessionToken: SESSION.token }).then(function (d) {
      function tbl(title, arr, cols, render) {
        var h = '<h3>' + title + ' (' + arr.length + ')</h3>';
        if (!arr.length) return h + '<p class="muted">Tidak ada.</p>';
        return h + '<div style="overflow-x:auto"><table class="data"><tr>' +
          cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>' +
          arr.map(render).join('') + '</table></div>';
      }
      box.innerHTML =
        tbl('Gagal Kalibrasi', d.gagalKalibrasi, ['Penilai', 'Dinilai', 'Seksi', 'Dijawab'], function (r) {
          return '<tr><td>' + esc(r.nia_penilai) + '</td><td>' + esc(r.nia_dinilai) + '</td><td>' + esc(r.seksi) + '</td><td>' + esc(r.dijawab) + '</td></tr>';
        }) +
        tbl('Straight-lining', d.straightLining, ['Penilai', 'Dinilai', 'Nilai', 'Butir'], function (r) {
          return '<tr><td>' + esc(r.nia_penilai) + '</td><td>' + esc(r.nia_dinilai) + '</td><td>' + esc(r.nilai) + '</td><td>' + esc(r.jumlahButir) + '</td></tr>';
        }) +
        tbl('NIA Duplikat', d.niaDuplikat, ['NIA', 'Jumlah'], function (r) {
          return '<tr><td>' + esc(r.nia) + '</td><td>' + esc(r.jumlah) + '</td></tr>';
        }) +
        tbl('Jabatan Belum Dipetakan', d.jabatanBelumDipetakan.map(function (x) { return { j: x }; }), ['Teks Jabatan'], function (r) {
          return '<tr><td>' + esc(r.j) + '</td></tr>';
        });
    }).catch(function (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  }
};
