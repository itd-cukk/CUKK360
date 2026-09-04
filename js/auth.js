/* auth.js — login NIA + PIN + OTP + sesi. */

var Auth = {
  _pendingNia: null,

  bind: function () {
    $('btn-login').addEventListener('click', function (e) { Auth.login(e.currentTarget); });
    $('lnk-activate').addEventListener('click', function (e) { e.preventDefault(); Auth.startActivation(); });
    $('btn-req-activation').addEventListener('click', function (e) { Auth.requestActivation(e.currentTarget); });
    $('btn-admin-nootp').addEventListener('click', function (e) { Auth.adminActivate(e.currentTarget); });
    $('btn-verify-otp').addEventListener('click', function (e) { Auth.verifyOtp(e.currentTarget); });
    $('lnk-resend-otp').addEventListener('click', function (e) { e.preventDefault(); Auth.resendOtp(); });
    Array.prototype.forEach.call(document.querySelectorAll('.lnk-back-login'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); Auth.backToLogin(); });
    });
    $('btn-logout').addEventListener('click', function () { Auth.logout(); });
    $('in-pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') Auth.login($('btn-login')); });

    // Normalisasi NIA seperti backend normalizeNia_(): huruf besar, tanpa spasi.
    // NIA diperlakukan sebagai TEKS — angka 0 di depan & alfanumerik (01SK...) dipertahankan.
    ['in-nia', 'act-nia'].forEach(function (id) {
      var f = $(id);
      if (!f) return;
      f.addEventListener('input', function () {
        var pos = f.selectionStart;
        var norm = f.value.replace(/\s+/g, '').toUpperCase();
        if (norm !== f.value) { f.value = norm; try { f.setSelectionRange(pos, pos); } catch (e) {} }
      });
      // Saat selesai mengetik: pad '0' NIA numerik < 12 digit (Sheets sering
      // membuang 0 di depan). NIA alfanumerik tidak tersentuh.
      f.addEventListener('blur', function () {
        var s = f.value.replace(/\s+/g, '').toUpperCase();
        if (/^\d+$/.test(s) && s.length > 0 && s.length < 12) {
          f.value = ('000000000000' + s).slice(-12);
        } else {
          f.value = s;
        }
      });
    });
  },

  _show: function (id) {
    ['auth-login', 'auth-activate', 'auth-otp'].forEach(function (x) { $(x).classList.add('hidden'); });
    $(id).classList.remove('hidden');
  },
  backToLogin: function () { this._show('auth-login'); },
  startActivation: function () { $('act-nia').value = $('in-nia').value.trim(); this._show('auth-activate'); },

  login: function (btn) {
    var nia = $('in-nia').value.trim(), pin = $('in-pin').value.trim();
    if (!nia) return toast('Isi NIA', true);
    busy(btn, true);
    apiPost('auth.login', { nia: nia, pin: pin, deviceId: DEVICE_ID }).then(function (d) {
      busy(btn, false);
      if (d.status === 'OK') return Auth._enter(d.session);
      if (d.status === 'NEED_ACTIVATION') {
        toast('Akun belum aktif. Silakan aktivasi.');
        $('act-nia').value = nia; Auth._show('auth-activate');
      } else if (d.status === 'NEED_OTP') {
        Auth._pendingNia = d.nia;
        $('otp-info').textContent = 'Perangkat belum dikenal. OTP dikirim ke ' + d.emailMask +
          ' (berlaku ' + d.otpExpiresInMin + ' menit).';
        $('otp-newpin-wrap').classList.add('hidden');
        Auth._show('auth-otp');
      }
    }).catch(function (e) { busy(btn, false); toast(e.message, true); });
  },

  requestActivation: function (btn) {
    var nia = $('act-nia').value.trim();
    if (!nia) return toast('Isi NIA', true);
    busy(btn, true);
    apiPost('auth.requestOtp', { nia: nia }).then(function (d) {
      busy(btn, false);
      Auth._pendingNia = nia;
      $('otp-info').textContent = 'OTP dikirim ke ' + d.emailMask + ' (berlaku ' + d.otpExpiresInMin +
        ' menit). Buat PIN baru di bawah.';
      $('otp-newpin-wrap').classList.remove('hidden');
      Auth._show('auth-otp');
    }).catch(function (e) { busy(btn, false); toast(e.message, true); });
  },

  adminActivate: function (btn) {
    var nia = $('act-nia').value.replace(/\s+/g, '').toUpperCase();
    if (/^\d+$/.test(nia) && nia.length > 0 && nia.length < 12) nia = ('000000000000' + nia).slice(-12);
    if (!nia) return toast('Isi NIA', true);
    var newPin = window.prompt('Aktivasi Admin tanpa OTP.\nBuat PIN baru untuk NIA ' + nia + ' (6 digit angka):');
    if (newPin == null) return;
    newPin = String(newPin).trim();
    if (!/^\d{6}$/.test(newPin)) return toast('PIN harus 6 digit angka', true);
    busy(btn, true);
    apiPost('auth.adminActivate', { nia: nia, newPin: newPin, deviceId: DEVICE_ID }).then(function (d) {
      busy(btn, false);
      if (d.status === 'OK') { toast('Aktivasi admin berhasil'); Auth._enter(d.session); }
    }).catch(function (e) { busy(btn, false); toast(e.message, true); });
  },

  resendOtp: function () {
    if (!Auth._pendingNia) return;
    apiPost('auth.requestOtp', { nia: Auth._pendingNia })
      .then(function () { toast('OTP dikirim ulang'); })
      .catch(function (e) { toast(e.message, true); });
  },

  verifyOtp: function (btn) {
    var kode = $('in-otp').value.trim();
    var newPin = $('in-newpin').value.trim();
    if (kode.length !== 6) return toast('OTP harus 6 digit', true);
    var payload = { nia: Auth._pendingNia, kode: kode, deviceId: DEVICE_ID };
    if (!$('otp-newpin-wrap').classList.contains('hidden')) {
      if (!/^\d{6}$/.test(newPin)) return toast('PIN baru harus 6 digit angka', true);
      payload.newPin = newPin;
    }
    busy(btn, true);
    apiPost('auth.verifyOtp', payload).then(function (d) {
      busy(btn, false);
      if (d.status === 'OK') Auth._enter(d.session);
    }).catch(function (e) { busy(btn, false); toast(e.message, true); });
  },

  _enter: function (session) {
    SESSION = session;
    try { localStorage.setItem(SESSION_STORAGE_KEY, session.token); } catch (e) {}
    $('screen-auth').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('who').textContent = session.nama + ' · ' + session.unit;
    if (session.isAdmin) $('admin-panel').classList.remove('hidden');
    else $('admin-panel').classList.add('hidden');
    nav('home');
  },

  tryResume: function () {
    var tok = null;
    try { tok = localStorage.getItem(SESSION_STORAGE_KEY); } catch (e) {}
    if (!tok) return;
    apiGet('auth.me', { sessionToken: tok }).then(function (s) {
      Auth._enter(s);
    }).catch(function () {
      try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) {}
    });
  },

  logout: function () {
    var t = SESSION && SESSION.token;
    SESSION = null;
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) {}
    if (t) apiPost('auth.logout', { sessionToken: t }).catch(function () {});
    $('app').classList.add('hidden');
    $('screen-auth').classList.remove('hidden');
    Auth._show('auth-login');
    $('in-pin').value = '';
  }
};
