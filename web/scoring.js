/** Pure score calculations, shared by the application and automated tests. */
export function getCounts(subject, answers = {}) {
  const questions = subject?.soal || [];
  let correct = 0;
  let wrong = 0;
  for (const question of questions) {
    const answer = answers[question.nomor];
    if (answer === undefined) continue;
    if (answer === question.jawaban) correct += 1;
    else wrong += 1;
  }
  return { correct, wrong, empty: questions.length - correct - wrong, total: questions.length };
}

export function calculateScore(subject, answers = {}) {
  const counts = getCounts(subject, answers);
  return { ...counts, score: counts.total ? Math.round((counts.correct / counts.total) * 1000) / 10 : 0 };
}
