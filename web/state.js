/** Central application state and session persistence. */
const HOME_GROUP_KEY = 'giganta-home-group';

function readHomeGroup() {
  try {
    const saved = sessionStorage.getItem(HOME_GROUP_KEY);
    if (['all', '20262', 'reguler'].includes(saved)) return saved;
  } catch (error) {
    // Ignore storage restriction
  }
  return 'all';
}

export const state = {
  data: null,
  subject: null,
  answers: {},
  flags: {},
  current: 0,
  screen: 'home',
  finished: false,
  filter: 'all',
  homeGroup: readHomeGroup(),
};

const SAVE_KEY = 'kuis-sesi-v2';
const LEGACY_SAVE_KEY = 'kuis-sesi';

export function saveState() {
  try {
    sessionStorage.setItem(HOME_GROUP_KEY, state.homeGroup || 'all');
    if (!state.subject) {
      sessionStorage.removeItem(SAVE_KEY);
      sessionStorage.removeItem(LEGACY_SAVE_KEY);
      return;
    }
    const subject = state.data.subjects.indexOf(state.subject);
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({
      subject, answers: state.answers, flags: state.flags, current: state.current,
      screen: state.screen, finished: state.finished, filter: state.filter,
      homeGroup: state.homeGroup,
    }));
  } catch (error) {
    console.warn('Progres sesi tidak dapat disimpan:', error);
  }
}

export function restoreState() {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY) || sessionStorage.getItem(LEGACY_SAVE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && ['all', '20262', 'reguler'].includes(saved.homeGroup)) {
      state.homeGroup = saved.homeGroup;
    }
    const subject = saved && state.data.subjects[saved.subject];
    if (!subject || !Number.isInteger(saved.current) || saved.current < 0 || saved.current >= subject.soal.length) return;

    const validAnswers = {};
    for (const [number, answer] of Object.entries(saved.answers || {})) {
      const question = subject.soal.find(item => String(item.nomor) === String(number));
      if (question && Number.isInteger(answer) && answer >= 0 && answer < question.pilihan.length) validAnswers[number] = answer;
    }
    const validFlags = {};
    for (const [number, flagged] of Object.entries(saved.flags || {})) {
      if (subject.soal.some(item => String(item.nomor) === String(number)) && flagged === true) validFlags[number] = true;
    }
    Object.assign(state, {
      subject, answers: validAnswers, flags: validFlags, current: saved.current,
      screen: ['exam', 'list', 'result'].includes(saved.screen) ? saved.screen : 'exam',
      finished: Boolean(saved.finished),
      filter: ['all', 'wrong', 'empty'].includes(saved.filter) ? saved.filter : 'all',
    });
    if (!state.finished && state.screen === 'result') state.screen = 'exam';
    if (state.finished) state.screen = 'result';
  } catch (error) {
    console.warn('Progres sesi sebelumnya tidak dapat dipulihkan:', error);
  }
}
