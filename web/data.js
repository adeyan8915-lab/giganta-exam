/** Data access and structural validation for the local question bank. */
export function validateQuestionBank(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || !Array.isArray(data.subjects)) {
    throw new Error('Format database tidak valid: properti subjects harus berupa array.');
  }
  if (data.subjects.length === 0) errors.push('Database tidak memiliki mata kuliah.');

  const subjectCodes = new Set();
  for (const [subjectIndex, subject] of data.subjects.entries()) {
    const label = `Mata kuliah ke-${subjectIndex + 1}`;
    if (!subject || typeof subject !== 'object') { errors.push(`${label} tidak valid.`); continue; }
    if (typeof subject.kode !== 'string' || !subject.kode.trim()) errors.push(`${label}: kode tidak tersedia.`);
    if (typeof subject.judul !== 'string' || !subject.judul.trim()) errors.push(`${label}: judul tidak tersedia.`);
    if (!Number.isFinite(Number(subject.passing_grade)) || Number(subject.passing_grade) < 0 || Number(subject.passing_grade) > 100) errors.push(`${label}: passing grade harus 0–100.`);
    if (subject.kode && subjectCodes.has(subject.kode)) errors.push(`${label}: kode mata kuliah duplikat (${subject.kode}).`);
    if (subject.kode) subjectCodes.add(subject.kode);
    if (!Array.isArray(subject.soal) || subject.soal.length === 0) { errors.push(`${label}: daftar soal kosong atau tidak valid.`); continue; }

    const questionNumbers = new Set();
    for (const [questionIndex, question] of subject.soal.entries()) {
      const qLabel = `${label}, soal ke-${questionIndex + 1}`;
      if (!question || typeof question !== 'object') { errors.push(`${qLabel} tidak valid.`); continue; }
      if (question.nomor === undefined || question.nomor === null || String(question.nomor).trim() === '') errors.push(`${qLabel}: nomor soal tidak tersedia.`);
      else if (questionNumbers.has(String(question.nomor))) errors.push(`${qLabel}: nomor soal duplikat (${question.nomor}).`);
      else questionNumbers.add(String(question.nomor));
      if (typeof question.pertanyaan !== 'string' || !question.pertanyaan.trim()) errors.push(`${qLabel}: pertanyaan kosong.`);
      if (question.gambar !== undefined && question.gambar !== null && (typeof question.gambar !== 'string' || !question.gambar.startsWith('assets/') || question.gambar.split('/').includes('..'))) errors.push(`${qLabel}: referensi gambar harus berupa path lokal di folder assets.`);
      if (!Array.isArray(question.pilihan) || question.pilihan.length < 2 || question.pilihan.length > 5) errors.push(`${qLabel}: pilihan harus berjumlah 2–5.`);
      if (Array.isArray(question.pilihan) && question.pilihan.some(option => typeof option !== 'string')) errors.push(`${qLabel}: setiap pilihan harus berupa teks.`);
      if (!Number.isInteger(question.jawaban) || !Array.isArray(question.pilihan) || question.jawaban < 0 || question.jawaban >= question.pilihan.length) errors.push(`${qLabel}: indeks kunci jawaban tidak valid.`);
    }
  }
  if (errors.length) throw new Error(`Validasi database gagal:\n- ${errors.slice(0, 12).join('\n- ')}${errors.length > 12 ? `\n- dan ${errors.length - 12} masalah lainnya` : ''}`);
  return data;
}

export async function loadData(url = './questions.json') {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Gagal mengambil database soal (HTTP ${response.status}).`);
  return validateQuestionBank(await response.json());
}
