const { loadGs } = require('./helpers/loadGs');

// Report.gs & QuestionBank.gs memuat banyak fungsi yang butuh Sheets, tapi
// predikat_ dan kalkulasi rata-rata bersifat murni.
const ctx = loadGs(['Utils.gs', 'Report.gs']);

describe('predikat_ (ambang skor 1..5)', () => {
  test.each([
    [4.8, 'Sangat Baik'],
    [4.5, 'Sangat Baik'],
    [4.49, 'Baik'],
    [3.5, 'Baik'],
    [3.2, 'Cukup'],
    [2.5, 'Cukup'],
    [2.0, 'Kurang'],
    [1.5, 'Kurang'],
    [1.2, 'Sangat Kurang'],
    [null, '-']
  ])('predikat_(%s) === %s', (skor, label) => {
    expect(ctx.predikat_(skor)).toBe(label);
  });
});

describe('agregasi rata-rata dimensi (simulasi BR-07: kalibrasi dikecualikan)', () => {
  // Simulasikan pola computeScores_: rata-rata per relasi lalu rata-rata dimensi.
  function rataDimensi(jawabanPerRelasi) {
    const semua = [];
    Object.keys(jawabanPerRelasi).forEach((rel) => {
      jawabanPerRelasi[rel].forEach((v) => semua.push(v));
    });
    return ctx.round2_(ctx.average_(semua));
  }

  test('butir kalibrasi tidak ikut (karena tidak pernah dimasukkan ke akumulasi dimensi)', () => {
    const dimIntegritas = { self: [4], peer: [5, 4], atasan: [4] }; // 4 butir core valid
    expect(rataDimensi(dimIntegritas)).toBeCloseTo(4.25);
  });

  test('overall = rata-rata dari rata-rata dimensi', () => {
    const perDimensi = [4.25, 4.0, 3.5, 5.0, 4.0, 3.75, 4.5, 4.0];
    expect(ctx.round2_(ctx.average_(perDimensi))).toBeCloseTo(4.13);
  });
});
