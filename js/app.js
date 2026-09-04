/* app.js — router + bootstrap. Dimuat terakhir. */

function nav(view) {
  Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) { v.classList.add('hidden'); });
  var target = $('view-' + view);
  if (target) target.classList.remove('hidden');
  window.scrollTo(0, 0);
  if (view === 'home') Home.load();
  else if (view === 'assessment') Assess.loadList();
  else if (view === 'interview') IV.loadList();
  else if (view === 'report') { Report.init(); }
}

document.addEventListener('click', function (e) {
  var n = e.target.closest && e.target.closest('[data-nav]');
  if (n) nav(n.getAttribute('data-nav'));
});

(function boot() {
  Auth.bind();
  Admin.bind();
  Wizard.bind();
  IV.bind();
  Report.bind();

  // NIA hint kecil
  var inNia = $('in-nia');
  if (inNia) inNia.addEventListener('input', function () {
    $('nia-status').textContent = inNia.value.trim().length >= 8 ? 'Tekan Masuk untuk melanjutkan.' : '';
  });

  if (!getUrl()) {
    toast('URL backend (SCRIPT_URL) belum diset. Buka console: setUrl("https://script.google.com/.../exec")', true);
  }

  Auth.tryResume();
})();
