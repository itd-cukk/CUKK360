const { loadGs } = require('./helpers/loadGs');

const ctx = loadGs(['01_Utils.gs']);

describe('normalizeNia_ / isValidNiaFormat_', () => {
  test('NIA angka murni valid & dinormalisasi', () => {
    expect(ctx.normalizeNia_(' 010921100266 ')).toBe('010921100266');
    expect(ctx.isValidNiaFormat_('010921100266')).toBe(true);
  });
  test('NIA alfanumerik riil valid (huruf diperlakukan sebagai teks)', () => {
    expect(ctx.normalizeNia_('01sk11700901')).toBe('01SK11700901');
    expect(ctx.isValidNiaFormat_('01SK11700901')).toBe(true);
  });
  test('NIA numerik yang 0-di-depannya terpotong Google Sheets → di-pad ke 12', () => {
    expect(ctx.normalizeNia_('10921100264')).toBe('010921100264');
    expect(ctx.normalizeNia_(10921100264)).toBe('010921100264');
    expect(ctx.normalizeNia_('12345')).toBe('000000012345');
    expect(ctx.isValidNiaFormat_('10921100264')).toBe(true);
  });
  test('NIA mengandung simbol / kosong ditolak', () => {
    expect(ctx.isValidNiaFormat_('01-SK-117')).toBe(false);
    expect(ctx.isValidNiaFormat_('')).toBe(false);
  });
});

describe('average_ / round2_ (dasar perhitungan skor dimensi, BR-07)', () => {
  test('rata-rata mengabaikan nilai non-numerik', () => {
    expect(ctx.average_([4, 5, 3])).toBeCloseTo(4);
    expect(ctx.average_([4, null, '', 2])).toBeCloseTo(3);
  });
  test('array kosong -> null', () => {
    expect(ctx.average_([])).toBeNull();
  });
  test('round2_ membulatkan ke 2 desimal', () => {
    expect(ctx.round2_(4.126)).toBe(4.13);
    expect(ctx.round2_(null)).toBeNull();
  });
});

describe('cleanText_ (jabatan bebas dari roster)', () => {
  test('newline & spasi ganda dirapikan', () => {
    expect(ctx.cleanText_('Staf Area Manager Bidang \nPendidikan Area Kapuas Hulu'))
      .toBe('Staf Area Manager Bidang Pendidikan Area Kapuas Hulu');
  });
});

describe('shuffle_ (pengacakan opsi jawaban, FR-18)', () => {
  test('mempertahankan seluruh elemen, tidak mengubah array asal', () => {
    const src = [1, 2, 3, 4, 5];
    const out = ctx.shuffle_(src);
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('toBool_', () => {
  test.each([
    ['TRUE', true], ['true', true], ['1', true], ['ya', true],
    ['FALSE', false], ['', false], [null, false], ['0', false]
  ])('toBool_(%s) === %s', (input, expected) => {
    expect(ctx.toBool_(input)).toBe(expected);
  });
});
