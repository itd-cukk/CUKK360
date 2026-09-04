/**
 * Auth.gs — Autentikasi berbasis NIA + PIN, aktivasi, OTP, dan sesi.
 *
 * FR-01..FR-06, BR-12. TIDAK memakai OAuth Google.
 *
 * Model keamanan:
 *  - PIN di-hash (SHA-256 + pepper + garam NIA) dan disimpan di Script Properties
 *    key `pin_<NIA>` (bukan di Sheet, supaya tidak ikut ter-ekspor laporan).
 *  - Sesi = token UUID di CacheService (TTL 8 jam) berisi profil ringkas.
 *  - "Perangkat dikenal" = fingerprint (hash) yang pernah sukses OTP untuk NIA itu,
 *    disimpan di Script Properties key `dev_<NIA>` (daftar hash, maksimal 5).
 *  - Login dari perangkat tak dikenal WAJIB OTP ke email pemilik NIA (BR-12).
 */

/* ============================================================================
 * PUBLIC (dipanggil dari client via google.script.run)
 * ========================================================================== */

/**
 * Langkah 1 login: cek NIA + PIN. Bila perangkat belum dikenal → minta OTP.
 * @param {{nia:string, pin:string, deviceId:string}} p
 * @return {{ok:boolean, data?:{status:string, ...}, error?:string}}
 */
function authLogin(p) {
  try {
    p = p || {};
    var nia = normalizeNia_(p.nia);
    if (!isValidNiaFormat_(nia)) return err_('Format NIA tidak valid.', 'NIA_FORMAT');

    var profil = getProfil_(nia);
    if (!profil) return err_('NIA tidak ditemukan pada Master Data Aktivis.', 'NIA_NOT_FOUND');
    if (!profil.status_aktif) return err_('NIA berstatus nonaktif. Hubungi HCMD.', 'NIA_INACTIVE');

    var pinHash = scriptProps_().getProperty('pin_' + nia);
    if (!pinHash) {
      _audit_(nia, 'login_belum_aktivasi', {});
      return ok_({ status: 'NEED_ACTIVATION', nia: nia, emailMask: _maskEmail_(profil.email) });
    }

    if (!p.pin || sha256Hex_(nia + '|' + p.pin + '|' + _pinPepper_()) !== pinHash) {
      _audit_(nia, 'login_pin_salah', {});
      return err_('PIN salah.', 'PIN_WRONG');
    }

    var known = _isKnownDevice_(nia, p.deviceId);
    if (!known) {
      var sent = _issueOtp_(nia, profil.email);
      _audit_(nia, 'login_minta_otp', { emailMask: _maskEmail_(profil.email) });
      return ok_({ status: 'NEED_OTP', nia: nia, emailMask: _maskEmail_(profil.email), otpExpiresInMin: OTP_TTL_MINUTES, debugSent: sent });
    }

    var token = _createSession_(profil);
    _audit_(nia, 'login_sukses', { device: 'known' });
    return ok_({ status: 'OK', session: _sessionPublic_(token, profil) });
  } catch (e) {
    return err_(e.message || String(e), 'EXCEPTION');
  }
}

/**
 * Aktivasi akun pertama kali / lupa PIN: kirim OTP ke email terdaftar.
 * @param {{nia:string}} p
 */
function authRequestActivationOtp(p) {
  try {
    var nia = normalizeNia_((p || {}).nia);
    var profil = getProfil_(nia);
    if (!profil) return err_('NIA tidak ditemukan.', 'NIA_NOT_FOUND');
    if (!profil.status_aktif) return err_('NIA nonaktif.', 'NIA_INACTIVE');
    if (!profil.email) return err_('Email pada Master Data kosong. Hubungi HCMD untuk melengkapi.', 'NO_EMAIL');
    var sent = _issueOtp_(nia, profil.email);
    _audit_(nia, 'request_otp_aktivasi', { emailMask: _maskEmail_(profil.email) });
    return ok_({ emailMask: _maskEmail_(profil.email), otpExpiresInMin: OTP_TTL_MINUTES, debugSent: sent });
  } catch (e) {
    return err_(e.message || String(e), 'EXCEPTION');
  }
}

/**
 * Verifikasi OTP. Bila `newPin` diisi → set/ubah PIN (aktivasi atau reset).
 * Selalu menandai perangkat sebagai dikenal setelah OTP sukses.
 * @param {{nia:string, kode:string, deviceId:string, newPin?:string}} p
 */
function authVerifyOtp(p) {
  try {
    p = p || {};
    var nia = normalizeNia_(p.nia);
    var profil = getProfil_(nia);
    if (!profil) return err_('NIA tidak ditemukan.', 'NIA_NOT_FOUND');

    var check = _verifyOtp_(nia, String(p.kode || '').trim());
    if (!check.ok) return err_(check.msg, check.code);

    if (p.newPin) {
      if (!/^\d{6}$/.test(String(p.newPin))) return err_('PIN harus 6 digit angka.', 'PIN_FORMAT');
      scriptProps_().setProperty('pin_' + nia, sha256Hex_(nia + '|' + p.newPin + '|' + _pinPepper_()));
      _audit_(nia, 'set_pin', {});
    } else {
      if (!scriptProps_().getProperty('pin_' + nia)) {
        return err_('Akun belum punya PIN. Sertakan PIN baru saat verifikasi.', 'NEED_NEW_PIN');
      }
    }

    _rememberDevice_(nia, p.deviceId);
    var token = _createSession_(profil);
    _audit_(nia, 'login_sukses', { device: 'otp_verified' });
    return ok_({ status: 'OK', session: _sessionPublic_(token, profil) });
  } catch (e) {
    return err_(e.message || String(e), 'EXCEPTION');
  }
}

/** Akhiri sesi. */
function authLogout(sessionToken) {
  try {
    CacheService.getScriptCache().remove(CACHE_SESSION_PREFIX + sessionToken);
    return ok_(true);
  } catch (e) { return err_(e.message, 'EXCEPTION'); }
}

/** Ambil profil sesi berjalan (dipakai client saat refresh halaman). */
function authMe(sessionToken) {
  var s = getSession_(sessionToken);
  if (!s) return err_('Sesi tidak valid / kedaluwarsa. Silakan login ulang.', 'SESSION_INVALID');
  return ok_(s);
}

/* ============================================================================
 * INTERNAL — sesi
 * ========================================================================== */

function _pinPepper_() {
  return scriptProps_().getProperty('OTP_PEPPER') || 'kk360-default-pepper';
}

/**
 * Buat sesi baru, simpan di cache, kembalikan token.
 * @param {Object} profil hasil getProfil_
 * @return {string} token
 */
function _createSession_(profil) {
  var token = uuid_();
  var payload = {
    token: token,
    nia: profil.nia,
    nama: profil.nama,
    jabatan_text: profil.jabatan_text,
    level: profil.level,
    isPimpinan: profil.isPimpinan,
    unit: profil.unit,
    bo: profil.bo,
    area: profil.area,
    isAdmin: isAdminNia_(profil.nia),
    createdAt: nowIso_()
  };
  CacheService.getScriptCache().put(CACHE_SESSION_PREFIX + token, JSON.stringify(payload), SESSION_TTL_SECONDS);
  return token;
}

function _sessionPublic_(token, profil) {
  return {
    token: token, nia: profil.nia, nama: profil.nama, jabatan_text: profil.jabatan_text,
    level: profil.level, isPimpinan: profil.isPimpinan, unit: profil.unit,
    bo: profil.bo, area: profil.area, isAdmin: isAdminNia_(profil.nia)
  };
}

/**
 * Validasi sessionToken. Dipakai SETIAP fungsi modul lain yang dipanggil client.
 * @param {string} sessionToken
 * @return {Object|null} payload sesi atau null
 */
function getSession_(sessionToken) {
  if (!sessionToken) return null;
  var raw = CacheService.getScriptCache().get(CACHE_SESSION_PREFIX + sessionToken);
  if (!raw) return null;
  try {
    var s = JSON.parse(raw);
    // perpanjang TTL sliding
    CacheService.getScriptCache().put(CACHE_SESSION_PREFIX + sessionToken, raw, SESSION_TTL_SECONDS);
    return s;
  } catch (e) { return null; }
}

/**
 * Guard standar: kembalikan sesi atau lempar error terstandar.
 * @param {string} sessionToken
 * @return {Object}
 */
function requireSession_(sessionToken) {
  var s = getSession_(sessionToken);
  if (!s) throw new Error('SESSION_INVALID: Sesi tidak valid atau kedaluwarsa. Login ulang.');
  return s;
}

function requireAdmin_(sessionToken) {
  var s = requireSession_(sessionToken);
  if (!s.isAdmin) throw new Error('FORBIDDEN: Membutuhkan hak akses Admin.');
  return s;
}

/* ============================================================================
 * INTERNAL — OTP
 * ========================================================================== */

/**
 * Terbitkan OTP: generate 6 digit, simpan hash + kedaluwarsa di otp_log,
 * kirim email ke pemilik NIA. Selalu kirim ke email MASTER DATA (BR-12).
 * @return {boolean} true bila email terkirim
 */
function _issueOtp_(nia, email) {
  var kode = ('' + Math.floor(100000 + Math.random() * 900000));
  var now = new Date();
  var exp = addMinutes_(now, OTP_TTL_MINUTES);

  withLock_(function () {
    // batalkan OTP aktif sebelumnya untuk NIA ini
    var rows = readObjects_('otp_log');
    rows.forEach(function (r) {
      if (normalizeNia_(r.nia_target) === nia && String(r.status) === 'aktif') {
        updateRow_('otp_log', r.__row, { status: 'dibatalkan' });
      }
    });
    appendObject_('otp_log', {
      id: shortId_('otp'),
      nia_target: nia,
      kode_otp_hash: hashOtp_(nia, kode),
      waktu_kirim: now.toISOString(),
      waktu_kedaluwarsa: exp.toISOString(),
      status: 'aktif'
    });
    // simpan counter percobaan di cache
    CacheService.getScriptCache().put('otp_try_' + nia, '0', OTP_TTL_MINUTES * 60 + 60);
  });

  if (!email) return false;
  try {
    MailApp.sendEmail({
      to: email,
      subject: '[' + APP_NAME + '] Kode OTP Anda: ' + kode,
      htmlBody:
        '<div style="font-family:Arial,sans-serif;max-width:480px">' +
        '<h2 style="color:#c0392b;margin:0 0 8px">' + APP_NAME + '</h2>' +
        '<p>Kode verifikasi (OTP) untuk NIA <b>' + nia + '</b>:</p>' +
        '<p style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f4f6f8;' +
        'padding:12px 16px;border-radius:12px;text-align:center">' + kode + '</p>' +
        '<p>Berlaku ' + OTP_TTL_MINUTES + ' menit. Jangan bagikan kode ini kepada siapa pun. ' +
        'Jika Anda tidak sedang login, abaikan email ini dan laporkan ke ITD.</p>' +
        '</div>'
    });
    return true;
  } catch (e) {
    Logger.log('Gagal kirim OTP: ' + e);
    return false;
  }
}

/**
 * @return {{ok:boolean, msg?:string, code?:string}}
 */
function _verifyOtp_(nia, kode) {
  if (!/^\d{6}$/.test(kode)) return { ok: false, msg: 'Kode OTP harus 6 digit.', code: 'OTP_FORMAT' };

  var tryKey = 'otp_try_' + nia;
  var tries = Number(CacheService.getScriptCache().get(tryKey) || '0') + 1;
  CacheService.getScriptCache().put(tryKey, String(tries), OTP_TTL_MINUTES * 60 + 60);
  if (tries > OTP_MAX_ATTEMPTS) return { ok: false, msg: 'Terlalu banyak percobaan. Minta OTP baru.', code: 'OTP_LOCKED' };

  var res = withLock_(function () {
    var rows = readObjects_('otp_log');
    // baris aktif terbaru
    var active = rows.filter(function (r) {
      return normalizeNia_(r.nia_target) === nia && String(r.status) === 'aktif';
    }).sort(function (a, b) { return String(b.waktu_kirim).localeCompare(String(a.waktu_kirim)); })[0];

    if (!active) return { ok: false, msg: 'Tidak ada OTP aktif. Minta kode baru.', code: 'OTP_NONE' };
    if (new Date() > new Date(active.waktu_kedaluwarsa)) {
      updateRow_('otp_log', active.__row, { status: 'kedaluwarsa' });
      return { ok: false, msg: 'OTP kedaluwarsa. Minta kode baru.', code: 'OTP_EXPIRED' };
    }
    if (String(active.kode_otp_hash) !== hashOtp_(nia, kode)) {
      return { ok: false, msg: 'Kode OTP salah.', code: 'OTP_WRONG' };
    }
    updateRow_('otp_log', active.__row, { status: 'terpakai' });
    return { ok: true };
  });

  if (res.ok) CacheService.getScriptCache().remove(tryKey);
  return res;
}

/* ============================================================================
 * INTERNAL — perangkat dikenal
 * ========================================================================== */

function _deviceHash_(nia, deviceId) {
  return sha256Hex_(nia + '|dev|' + String(deviceId || '') + '|' + _pinPepper_()).substring(0, 24);
}

function _isKnownDevice_(nia, deviceId) {
  if (!deviceId) return false;
  var raw = scriptProps_().getProperty('dev_' + nia) || '';
  return raw.split(',').indexOf(_deviceHash_(nia, deviceId)) !== -1;
}

function _rememberDevice_(nia, deviceId) {
  if (!deviceId) return;
  var h = _deviceHash_(nia, deviceId);
  var raw = scriptProps_().getProperty('dev_' + nia) || '';
  var list = raw.split(',').filter(String);
  if (list.indexOf(h) === -1) list.unshift(h);
  list = list.slice(0, 5); // simpan maksimal 5 perangkat
  scriptProps_().setProperty('dev_' + nia, list.join(','));
}

/* ============================================================================
 * INTERNAL — util
 * ========================================================================== */

function _maskEmail_(email) {
  if (!email || email.indexOf('@') === -1) return '(email belum terdaftar)';
  var parts = email.split('@');
  var u = parts[0];
  var masked = u.length <= 2 ? u[0] + '*' : u.substring(0, 2) + '***' + u.substring(u.length - 1);
  return masked + '@' + parts[1];
}

// _audit_() dipindah ke 01_Utils.gs (helper fondasi) supaya modul lain
// (Period/Interview/Notification/Triggers) tidak bergantung pada file Auth.
