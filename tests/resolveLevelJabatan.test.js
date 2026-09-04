const { loadGs } = require('./helpers/loadGs');

/**
 * Uji resolveLevelJabatan_ (FR-09 / Lampiran F).
 * _getLevelRefCached_ dioverride agar tidak menyentuh Sheets/cache nyata.
 */
function ctxWithRef() {
  const ctx = loadGs(['01_Utils.gs', '03_MasterData.gs']);
  ctx._getLevelRefCached_ = () =>
    ctx.DEFAULT_LEVEL_REF.map((r, i) => ({
      id: 'lvl_' + (i + 1),
      pola_kata_kunci: r.pola,
      level: r.level,
      is_trigger_teknis: r.trigger
    }));
  return ctx;
}

describe('resolveLevelJabatan_', () => {
  const ctx = ctxWithRef();

  test.each([
    ['CEO', 'Pimpinan Puncak', true],
    ['General Manager KKU', 'Pimpinan Puncak', true],
    ['Head of Accounting & Financial Department', 'Pimpinan Menengah', true],
    ['Area Manager Sekadau', 'Pimpinan Menengah', true],
    ['Branch Manager', 'Pimpinan Menengah', true],
    ['Manager Divi Ritek & Service', 'Pimpinan Menengah', true],
    ['Plt Branch Manager', 'Pimpinan Menengah (Pratama)', true],
    ['Junior Branch Manager', 'Pimpinan Menengah (Pratama)', true],
    ['Asisten AM Bidang Keuangan & Analisis', 'Pimpinan Menengah (Pratama)', true],
    ['Kepala Toko KK Mart Baning', 'Pimpinan Menengah', true]
  ])('jabatan pimpinan: "%s" -> %s (teknis=%s)', (teks, level, trig) => {
    const r = ctx.resolveLevelJabatan_(teks);
    expect(r.level).toBe(level);
    expect(r.isTriggerTeknis).toBe(trig);
  });

  test.each([
    'Field Officer',
    'Cashier',
    'Credit Admin',
    'Accountant',
    'Security',
    'Staf Area Penagihan',
    'Junior Accountant',
    'Customer Service',
    'Driver dan Pemeliharaan Mobil'
  ])('jabatan staf: "%s" -> Staf Pelaksana, tanpa trigger teknis', (teks) => {
    const r = ctx.resolveLevelJabatan_(teks);
    expect(r.level).toBe('Staf Pelaksana');
    expect(r.isTriggerTeknis).toBe(false);
  });

  test('"Plt Accountant" ikut pola Plt -> Pimpinan Menengah (Pratama) (batasan pola awal, perlu ditinjau Admin)', () => {
    // Mendokumentasikan perilaku pola default: kata "Plt" memicu level pratama.
    const r = ctx.resolveLevelJabatan_('Plt Accountant');
    expect(r.level).toBe('Pimpinan Menengah (Pratama)');
  });

  test('teks kosong -> PERLU_DIPETAKAN + needsReview', () => {
    const r = ctx.resolveLevelJabatan_('');
    expect(r.level).toBe('PERLU_DIPETAKAN');
    expect(r.needsReview).toBe(true);
  });

  test('jabatan tak dikenal -> Staf Pelaksana + needsReview true', () => {
    const r = ctx.resolveLevelJabatan_('Koordinator Hidroponik Eksperimental');
    expect(r.level).toBe('Staf Pelaksana');
    expect(r.needsReview).toBe(true);
  });

  test('isLevelPimpinan_ konsisten', () => {
    expect(ctx.isLevelPimpinan_('Pimpinan Puncak')).toBe(true);
    expect(ctx.isLevelPimpinan_('Pimpinan Menengah (Pratama)')).toBe(true);
    expect(ctx.isLevelPimpinan_('Staf Pelaksana')).toBe(false);
  });
});
