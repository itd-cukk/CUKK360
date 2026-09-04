/**
 * Harness kecil untuk menguji fungsi murni dari file .gs di Node/Jest.
 *
 * File .gs Apps Script tidak punya module.exports — seluruh fungsi bersifat global.
 * Helper ini meng-eval satu/lebih file .gs di dalam sebuah konteks `vm` dengan
 * layanan Google (SpreadsheetApp, CacheService, dst.) di-stub seperlunya, lalu
 * mengembalikan objek konteks sehingga tiap fungsi global bisa dipanggil & di-override.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', '..', 'gas');

function makeStubs(overrides = {}) {
  const store = {};
  const cache = {};
  const base = {
    console,
    Logger: { log: () => {} },
    Utilities: {
      getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
      computeDigest: (_algo, str) => {
        // hash sederhana deterministik utk uji (bukan kripto nyata)
        let h = 0;
        const s = String(str);
        for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
        const bytes = [];
        for (let i = 0; i < 32; i++) bytes.push(((h >> (i % 24)) & 0xff) - 128);
        return bytes;
      },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      formatDate: (d) => new Date(d).toISOString(),
      newBlob: () => ({ getAs: () => ({ getBytes: () => [] }) })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        setProperties: (obj) => { Object.assign(store, obj); },
        deleteProperty: (k) => { delete store[k]; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = v; },
        remove: (k) => { delete cache[k]; }
      }),
      getUserCache: () => ({
        get: (k) => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = v; },
        remove: (k) => { delete cache[k]; }
      })
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: {
      openById: () => { throw new Error('SpreadsheetApp di-stub — fungsi ini butuh Sheets nyata, uji manual.'); }
    },
    MailApp: { sendEmail: () => {} },
    ScriptApp: { getService: () => ({ getUrl: () => '' }), getProjectTriggers: () => [] }
  };
  return Object.assign(base, overrides);
}

/**
 * @param {string[]} files nama file .gs relatif ke src/
 * @param {object} overrides stub tambahan
 * @returns {vm.Context} context berisi fungsi-fungsi global
 */
function loadGs(files, overrides = {}) {
  const ctx = vm.createContext(makeStubs(overrides));
  for (const f of files) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx;
}

module.exports = { loadGs };
