/* Giganta CBT — Exam Simulator (Vanilla JS, no framework) */

import { state, saveState, restoreState } from './state.js';
import { loadData } from './data.js';
import { LETTERS, renderRichText, escapeHtml, kodeShort, moduleRef, sourceBlock, subjectParts, subjectPeriod, subjectPeriodLabel, subjectHue, ICONS } from './helpers.js';
import { getCounts, calculateScore } from './scoring.js';
import { applyTheme, toggleTheme, getTheme } from './theme.js';

const app = document.getElementById("app");
const dlg = document.getElementById("dlg");
const printArea = document.getElementById("print-area");

/* ===================== Layout ===================== */
function topbar(title, sub, action) {
  return `
  <div class="topbar">
    <div class="brand">
      <div class="brand-badge">G</div>
      <div class="brand-text">
        <div class="t1">Giganta Exam</div>
        <div class="t2">${title}${sub ? " &middot; " + sub : ""}</div>
      </div>
    </div>
    <div class="topbar-actions">
      ${action || ""}
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="${getTheme() === "dark" ? "Aktifkan tema terang" : "Aktifkan tema gelap"}" title="Ganti tema">${getTheme() === "dark" ? ICONS.sun : ICONS.moon}</button>
    </div>
  </div>`;
}

// Saat sesi berlangsung, navigasi hanya berisi Soal Ujian dan Daftar Soal.
function bottomnav() {
  if (!inSession()) return "";
  const items = [
    ["exam", "Soal Ujian"],
    ["list", "Daftar Soal"],
  ];
  return `<nav class="bottomnav" aria-label="Navigasi ujian">${items
    .map(
      ([key, label]) => `
    <button class="navbtn ${state.screen === key ? "active" : ""}" data-nav="${key}" ${state.screen === key ? 'aria-current="page"' : ""}>
      <span class="ico">${ICONS[key]}</span>${label}
    </button>`
    )
    .join("")}</nav>`;
}

const inSession = () => !!state.subject && !state.finished && (state.screen === "exam" || state.screen === "list");

function render() {
  if (!state.subject && state.screen !== "home") state.screen = "home";
  let body = "";
  if (state.screen === "home") body = renderHome();
  else if (state.screen === "exam") body = renderExam();
  else if (state.screen === "list") body = renderList();
  else if (state.screen === "result") body = renderResult();

  app.innerHTML = `<div class="shell ${inSession() ? "has-nav" : ""}">${body}${bottomnav()}</div>`;
  bindEvents();
  saveState();
}

/* ===================== HOME ===================== */
function renderSubjectCard(s, originalIndex) {
  const parts = subjectParts(s);
  const is20262 = parts.period === "20262";
  return `
  <article class="subject-card" style="--hue:${subjectHue(s)}">
    <div class="subject-accent" aria-hidden="true"></div>
    <div class="subject-main">
      <div>
        <div class="subject-code-row">
          <span class="subject-code">${escapeHtml(kodeShort(s))}</span>
          <span class="period-pill ${is20262 ? "is-20262" : "is-reguler"}">${is20262 ? "20262" : "Reguler"}</span>
        </div>
        <div class="subject-title">${escapeHtml(parts.name)}</div>
        <div class="subject-meta">${s.soal.length} soal &middot; Batas lulus ${s.passing_grade}%</div>
      </div>
      <div class="subject-actions">
        <button class="btn-access" type="button" data-open-subject="${originalIndex}" aria-label="Mulai simulasi ${escapeHtml(parts.name)} (${subjectPeriodLabel(s)})">Mulai ${ICONS.next}</button>
        <button class="btn-print" type="button" data-print-subject="${originalIndex}" aria-label="Cetak PDF soal dan kunci ${escapeHtml(parts.name)} (${subjectPeriodLabel(s)})" title="Cetak PDF soal dan kunci">${ICONS.print}</button>
      </div>
    </div>
  </article>`;
}

function renderSubjectGroup(title, subtitle, items) {
  if (!items.length) return "";
  return `
  <section class="group-section" aria-label="${escapeHtml(title)}">
    <div class="group-head">
      <div>
        <h2 class="group-title">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="group-sub">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      <span class="group-count">${items.length} mata kuliah</span>
    </div>
    <div class="subject-grid">
      ${items.map(({ subject, index }) => renderSubjectCard(subject, index)).join("")}
    </div>
  </section>`;
}

function renderHome() {
  const subs = state.data.subjects;
  const indexed = subs.map((subject, index) => ({ subject, index, period: subjectPeriod(subject) }));
  const group20262 = indexed.filter((item) => item.period === "20262");
  const groupReguler = indexed.filter((item) => item.period === "reguler");
  const activeGroup = ["all", "20262", "reguler"].includes(state.homeGroup) ? state.homeGroup : "all";

  let sectionsHtml = "";
  if (activeGroup === "20262") {
    sectionsHtml = renderSubjectGroup("Periode 20262", "Bank soal pembaruan semester 20262", group20262);
  } else if (activeGroup === "reguler") {
    sectionsHtml = renderSubjectGroup("Bank Soal Reguler", "Paket mata kuliah utama", groupReguler);
  } else {
    sectionsHtml = [
      renderSubjectGroup("Periode 20262", "Bank soal pembaruan semester 20262", group20262),
      renderSubjectGroup("Bank Soal Reguler", "Paket mata kuliah utama", groupReguler),
    ].join("");
  }

  return `
  ${topbar("Dashboard")}
  <div class="view">
    <header class="page-head">
      <h1 class="headline">Pilih mata kuliah</h1>
      <p class="muted">Simulasi ujian pilihan ganda &middot; ${subs.length} mata kuliah tersedia</p>
    </header>

    <div class="group-tabs" role="group" aria-label="Filter kelompok periode kuis">
      ${[
        ["all", `Semua (${subs.length})`],
        ["20262", `Periode 20262 (${group20262.length})`],
        ["reguler", `Reguler (${groupReguler.length})`],
      ]
        .map(
          ([key, label]) => `
        <button type="button" class="group-tab ${activeGroup === key ? "active" : ""}" data-home-group="${key}" aria-pressed="${activeGroup === key}">${label}</button>`
        )
        .join("")}
    </div>

    ${sectionsHtml}
  </div>`;
}

/* ===================== EXAM ===================== */
function currentQuestion() {
  return state.subject.soal[state.current];
}

/* Render pertanyaan, kode sumber, dan tabel sebagai elemen HTML terstruktur. */
function tableFromUnicode(source) {
  const match = source.match(/(?:^|\n)([ \t]*┌[─┬┐]+[^\n]*\n[\s\S]*?^[ \t]*└[─┴┘]+[^\n]*)(?=\n|$)/m);
  if (!match) return null;
  const rows = match[1].split('\n')
    .filter(line => line.includes('│') && !line.includes('├'))
    .map(line => line.split('│').slice(1, -1).map(cell => cell.trim()));
  if (!rows.length) return null;
  const [headers, ...body] = rows;
  const caption = '';
  return {
    source: match[1],
    html: `<div class="question-table-wrap" role="region" aria-label="Tabel dalam soal" tabindex="0"><table class="question-data-table">${caption}<thead><tr>${headers.map(cell => `<th scope="col">${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${headers.map((_, i) => `<td>${escapeHtml(row[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  };
}

function renderQuestionContent(q) {
  let question = String(q.pertanyaan ?? '').replace(/\r\n?/g, '\n');
  const hasStructuredTable = q.tabel && Array.isArray(q.tabel.kolom) && Array.isArray(q.tabel.baris);
  let tableHtml = '';

  if (hasStructuredTable) {
    tableHtml = `
      <div class="question-table-wrap" role="region" aria-label="${escapeHtml(q.tabel.judul || 'Tabel soal')}" tabindex="0">
        <table class="question-data-table">
          ${q.tabel.judul ? `<caption>${escapeHtml(q.tabel.judul)}</caption>` : ''}
          <thead><tr>${q.tabel.kolom.map(col => `<th scope="col">${escapeHtml(col)}</th>`).join('')}</tr></thead>
          <tbody>${q.tabel.baris.map(row => `<tr>${q.tabel.kolom.map((_, i) => `<td>${escapeHtml(row?.[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
    const unicode = tableFromUnicode(question);
    if (unicode) question = question.replace(unicode.source, '__QUESTION_TABLE_CONTENT__');
    else if (/<table\b[^>]*>[\s\S]*?<\/table>/i.test(question)) question = question.replace(/<table\b[^>]*>[\s\S]*?<\/table>/i, '__QUESTION_TABLE_CONTENT__');
    else question = `${question}\n__QUESTION_TABLE_CONTENT__`;
  } else {
    const unicode = tableFromUnicode(question);
    if (unicode) {
      tableHtml = unicode.html;
      question = question.replace(unicode.source, '__QUESTION_TABLE_CONTENT__');
    }
  }
  return renderRichText(question, { tableHtml });
}

function feedbackBlock(q, picked) {
  const ok = picked === q.jawaban;
  return `
  <div class="feedback ${ok ? "correct" : "wrong"}" role="status" aria-live="polite" id="feedback">
    <div class="fb-title">
      <span class="fb-symbol" aria-hidden="true">${ok ? ICONS.ok : ICONS.no}</span>
      <span class="fb-head">Jawaban Anda ${ok ? "benar" : "salah"}</span>
    </div>
    <div class="fb-key"><span>Jawaban benar: <b>${LETTERS[q.jawaban]}.</b></span><div class="fb-answer-content">${renderRichText(q.pilihan[q.jawaban])}</div></div>
    ${!ok ? `<div class="fb-picked"><span>Jawaban Anda: <b>${LETTERS[picked]}.</b></span><div class="fb-answer-content">${renderRichText(q.pilihan[picked])}</div></div>` : ""}
    ${q.penjelasan ? `<div class="fb-explain">${renderRichText(q.penjelasan)}</div>` : ""}
    ${sourceBlock(q)}
  </div>`;
}

function renderExam() {
  const soal = state.subject.soal;
  const q = currentQuestion();
  const total = soal.length;
  const answeredCount = Object.keys(state.answers).length;
  const pct = Math.round((answeredCount / total) * 100);
  const picked = state.answers[q.nomor];
  const locked = picked !== undefined;
  const flagged = !!state.flags[q.nomor];
  const periodTag = subjectPeriod(state.subject) === "20262" ? " · 20262" : "";

  let statusChip = '<span class="q-status-chip">Belum dijawab</span>';
  if (locked) {
    statusChip = picked === q.jawaban
      ? '<span class="q-status-chip is-correct">Benar</span>'
      : '<span class="q-status-chip is-wrong">Salah</span>';
  } else if (flagged) {
    statusChip = '<span class="q-status-chip is-flag">Ragu-ragu</span>';
  }

  return `
  ${topbar("Ujian", kodeShort(state.subject) + periodTag, `<button class="btn-ghost" type="button" data-exit>Keluar</button>`)}
  <div class="view">
    <div class="progress">
      <div class="progress-row">
        <span>Soal ${state.current + 1} dari ${total}</span>
        <span>${answeredCount} terjawab &middot; ${pct}%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>

    <article class="question-card" aria-label="Pertanyaan nomor ${q.nomor}">
      <div class="question-card-head">
        <span class="q-number">Pertanyaan No. ${q.nomor}</span>
        ${statusChip}
      </div>
      <div class="question-text">${renderQuestionContent(q)}${q.gambar ? `<img src="${q.gambar}" alt="Ilustrasi soal ${q.nomor}" loading="lazy" decoding="async">` : ""}</div>
    </article>

    <div class="options" role="group" aria-label="Pilihan jawaban">
      ${q.pilihan
        .map((opt, idx) => {
          const optHtml = renderRichText(opt, { inlineBlocks: true });
          const hasCodeBlock = optHtml.includes('code-block-inline');
          let cls = "option" + (hasCodeBlock ? " has-code-block" : "");
          let mark = "";
          if (locked) {
            cls += " locked";
            if (idx === q.jawaban) {
              cls += " is-correct";
              mark = '<span class="option-mark">Benar</span>';
            } else if (idx === picked) {
              cls += " is-wrong";
              mark = '<span class="option-mark">Pilihanmu</span>';
            }
          }
          return `
        <button type="button" class="${cls}" data-select="${idx}" ${locked ? "disabled" : ""}>
          <span class="option-key">${LETTERS[idx]}</span>
          <span class="option-text">${optHtml}</span>
          ${mark}
        </button>`;
        })
        .join("")}
    </div>

    ${locked ? feedbackBlock(q, picked) : ""}

    <div class="dock dock-sticky">
      <button class="dock-btn flag ${flagged ? "active" : ""}" type="button" data-flag aria-label="Tandai ragu-ragu" aria-pressed="${flagged}">${ICONS.flag}</button>
      <button class="dock-btn secondary" type="button" data-prev aria-label="Soal sebelumnya" ${state.current === 0 ? "disabled" : ""}>${ICONS.prev}<span class="lbl">Sebelumnya</span></button>
      <button class="dock-btn ${locked ? "primary" : "secondary"}" type="button" data-next ${state.current === total - 1 ? "disabled" : ""}>Selanjutnya ${ICONS.next}</button>
    </div>
    <button class="btn-finish" type="button" data-finish>Selesaikan ujian sekarang</button>
  </div>`;
}

/* ===================== DAFTAR SOAL ===================== */
function counts() {
  return getCounts(state.subject, state.answers);
}

function renderList() {
  const soal = state.subject.soal;
  const c = counts();
  const flaggedN = Object.keys(state.flags).filter((k) => state.flags[k]).length;
  const periodTag = subjectPeriod(state.subject) === "20262" ? " · 20262" : "";

  return `
  ${topbar("Daftar Soal", kodeShort(state.subject) + periodTag, `<button class="btn-ghost" type="button" data-exit>Keluar</button>`)}
  <div class="view">
    <div class="stat-row">
      <div class="stat-box"><div class="num">${c.correct}</div><div class="label-caps">Benar</div></div>
      <div class="stat-box"><div class="num">${c.wrong}</div><div class="label-caps">Salah</div></div>
      <div class="stat-box"><div class="num">${c.empty}</div><div class="label-caps">Belum</div></div>
      <div class="stat-box"><div class="num">${flaggedN}</div><div class="label-caps">Ragu</div></div>
    </div>

    <div class="panel">
      <div class="label-caps">Semua soal &middot; ketuk nomor untuk melompat</div>
      <div class="grid-cells">
        ${soal
          .map((q, i) => {
            const a = state.answers[q.nomor];
            let cls = "cell";
            if (a !== undefined) cls += a === q.jawaban ? " correct" : " wrong";
            if (state.flags[q.nomor]) cls += " flagged";
            if (i === state.current) cls += " current";
            return `<button type="button" class="${cls}" data-goto="${i}" aria-label="Soal ${q.nomor}">${q.nomor}</button>`;
          })
          .join("")}
      </div>
      <div class="legend">
        <span><i class="sw correct"></i>Benar</span>
        <span><i class="sw wrong"></i>Salah</span>
        <span><i class="sw"></i>Belum dijawab</span>
        <span><i class="sw flag"></i>Ragu-ragu</span>
      </div>
    </div>

    <button class="dock-btn primary" type="button" data-finish>Selesaikan ujian</button>
  </div>`;
}

/* ===================== HASIL ===================== */
function computeScore() {
  return calculateScore(state.subject, state.answers);
}

// Lingkaran progres skor: radius 54, keliling ~339.3, ditarik lewat stroke-dasharray.
function scoreRing(score, pass) {
  const r = 54;
  const c = Math.round(2 * Math.PI * r * 1000) / 1000;
  const offset = Math.round(c * (1 - Math.min(100, Math.max(0, score)) / 100) * 1000) / 1000;
  return `
  <div class="score-ring" role="img" aria-label="Skor akhir ${score} persen">
    <svg viewBox="0 0 120 120" width="148" height="148" aria-hidden="true">
      <circle class="ring-track" cx="60" cy="60" r="${r}" />
      <circle class="ring-fill ${pass ? "pass" : "fail"}" cx="60" cy="60" r="${r}"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 60 60)" />
    </svg>
    <div class="score-num">${score}%</div>
  </div>`;
}

function renderResult() {
  const r = computeScore();
  const pass = r.score >= state.subject.passing_grade;
  const periodTag = subjectPeriod(state.subject) === "20262" ? " · 20262" : "";
  const list = state.subject.soal.filter((q) => {
    const a = state.answers[q.nomor];
    if (state.filter === "wrong") return a !== undefined && a !== q.jawaban;
    if (state.filter === "empty") return a === undefined;
    return true;
  });

  return `
  ${topbar("Hasil", kodeShort(state.subject) + periodTag, `<button class="btn-ghost" type="button" data-home>Beranda</button>`)}
  <div class="view">
    <div class="score-hero">
      <div class="label-caps">Skor akhir</div>
      ${scoreRing(r.score, pass)}
      <div class="muted">${r.correct} dari ${r.total} soal benar</div>
      <div class="score-status ${pass ? "pass" : "fail"}">${pass ? "Lulus" : "Belum lulus"} &middot; Batas lulus ${state.subject.passing_grade}%</div>
    </div>

    <div class="stat-row">
      <div class="stat-box"><div class="num">${r.correct}</div><div class="label-caps">Benar</div></div>
      <div class="stat-box"><div class="num">${r.wrong}</div><div class="label-caps">Salah</div></div>
      <div class="stat-box"><div class="num">${r.empty}</div><div class="label-caps">Tidak dijawab</div></div>
    </div>

    <div class="dock">
      <button class="dock-btn secondary" type="button" data-print-current>${ICONS.print} Cetak PDF</button>
      <button class="dock-btn primary" type="button" data-retry>Ulangi ujian</button>
    </div>

    <h1 class="headline">Pembahasan soal</h1>
    <div class="filters" role="group" aria-label="Filter pembahasan">
      ${[
        ["all", `Semua (${r.total})`],
        ["wrong", `Salah (${r.wrong})`],
        ["empty", `Tidak dijawab (${r.empty})`],
      ]
        .map(([k, l]) => `<button type="button" class="filter ${state.filter === k ? "active" : ""}" data-filter="${k}">${l}</button>`)
        .join("")}
    </div>
    ${list.length ? "" : '<p class="empty-state">Tidak ada soal pada kategori ini.</p>'}
    ${list
      .map((q) => {
        const picked = state.answers[q.nomor];
        const status = picked === undefined ? "empty" : picked === q.jawaban ? "correct" : "wrong";
        const label = { empty: "Tidak dijawab", correct: "Jawaban benar", wrong: "Jawaban salah" }[status];
        return `
      <div class="review-item">
        <div class="verdict ${status}">${{ correct: ICONS.ok, wrong: ICONS.no, empty: ICONS.empty }[status]}Soal ${q.nomor} &middot; ${label}</div>
        <div class="question-text">${renderQuestionContent(q)}${q.gambar ? `<img src="${q.gambar}" alt="Ilustrasi soal ${q.nomor}" loading="lazy">` : ""}</div>
        <div class="answer-row"><span>Jawabanmu:</span><div class="answer-content">${picked === undefined ? "&mdash;" : `<b>${LETTERS[picked]}.</b> ${renderRichText(q.pilihan[picked])}`}</div></div>
        <div class="answer-row"><span>Kunci jawaban:</span><div class="answer-content"><b>${LETTERS[q.jawaban]}.</b> ${renderRichText(q.pilihan[q.jawaban])}</div></div>
        ${q.penjelasan ? `<div class="explain">${renderRichText(q.penjelasan)}</div>` : ""}
        ${sourceBlock(q)}
      </div>`;
      })
      .join("")}
  </div>`;
}

/* ===================== Dialog konfirmasi (native <dialog>) ===================== */
function confirmDialog({ title, body, confirmLabel, cancelLabel = "Kembali" }) {
  return new Promise((resolve) => {
    dlg.innerHTML = `
      <form method="dialog">
        <h2 id="dlg-title">${title}</h2>
        <div class="dlg-body">${body}</div>
        <div class="dlg-actions">
          <button value="cancel" class="dock-btn secondary" autofocus>${cancelLabel}</button>
          <button value="ok" class="dock-btn primary">${confirmLabel}</button>
        </div>
      </form>`;
    dlg.addEventListener(
      "close",
      () => {
        const ok = dlg.returnValue === "ok";
        dlg.returnValue = ""; // Esc tidak mengisi returnValue; hindari nilai basi
        resolve(ok);
      },
      { once: true }
    );
    dlg.showModal();
  });
}

async function finishExam() {
  const c = counts();
  const body =
    c.empty > 0
      ? `<p>Masih ada <b>${c.empty} soal</b> yang belum dijawab. Soal tersebut dihitung tidak dijawab (nilai 0).</p>`
      : `<p>Semua soal sudah dijawab.</p>`;
  const ok = await confirmDialog({
    title: "Selesaikan ujian?",
    body: `${body}<p class="muted">Terjawab ${c.total - c.empty} dari ${c.total} soal. Jawaban tidak dapat diubah setelah ujian selesai.</p>`,
    confirmLabel: "Selesaikan",
    cancelLabel: "Lanjut mengerjakan",
  });
  if (!ok) return;
  state.finished = true;
  state.filter = "all";
  state.screen = "result";
  window.scrollTo(0, 0);
  render();
}

async function exitSession() {
  const ok = await confirmDialog({
    title: "Keluar dari ujian?",
    body: `<p>Progres sesi ini akan hilang. Untuk mengakhiri dan melihat skor, pilih <b>Selesaikan ujian</b>.</p>`,
    confirmLabel: "Keluar",
    cancelLabel: "Tetap di ujian",
  });
  if (ok) goHome();
}

function goHome() {
  state.subject = null;
  state.answers = {};
  state.flags = {};
  state.current = 0;
  state.finished = false;
  state.screen = "home";
  window.scrollTo(0, 0);
  render();
}

function startSession(subjectIndex) {
  state.subject = state.data.subjects[subjectIndex];
  state.answers = {};
  state.flags = {};
  state.current = 0;
  state.finished = false;
  state.screen = "exam";
  window.scrollTo(0, 0);
  render();
}

/* ===================== Cetak PDF ===================== */
function buildPrintHtml(s) {
  const tanggal = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const parts = subjectParts(s);
  const periodLabel = subjectPeriodLabel(s);
  return `
  <table class="p-sheet" role="presentation">
    <thead class="p-margin-top"><tr><td></td></tr></thead>
    <tbody>
      <tr>
        <td class="p-sheet-cell">
          <header class="p-head">
            <h1>${escapeHtml(kodeShort(s))} &mdash; ${escapeHtml(parts.name)} (${escapeHtml(periodLabel)})</h1>
            <p>${s.soal.length} Soal</p>
          </header>
          <main class="p-body">
          ${s.soal
            .map((q) => {
              const ref = moduleRef(q);
              return `
            <article class="pq">
              <div class="pq-question">
                <span class="pq-num">${q.nomor}.</span>
                <div class="pq-text">${renderQuestionContent(q)}${q.gambar ? `<img src="${q.gambar}" alt="Ilustrasi soal ${q.nomor}">` : ""}</div>
              </div>
              <ol class="pq-opts">
                ${q.pilihan
                  .map(
                    (o, i) => `
                  <li><span class="k">${LETTERS[i]}.</span><div class="pq-option-content">${renderRichText(o, { inlineBlocks: true })}</div></li>`
                  )
                  .join("")}
              </ol>
              <div class="pq-ans">
                <div class="pq-key-line"><strong>Kunci Jawaban :</strong> <strong>${LETTERS[q.jawaban]}.</strong> <span class="pq-key-val">${renderRichText(q.pilihan[q.jawaban], { inlineBlocks: true })}</span></div>
                <div class="pq-discuss">
                  <div class="pq-discuss-title"><strong>Pembahasan:</strong></div>
                  <div class="pq-discuss-body">${q.penjelasan ? renderRichText(q.penjelasan) : "&mdash;"}</div>
                </div>
                <div class="pq-src"><strong>Sumber :</strong> ${ref ? `${escapeHtml(ref)} &middot; ` : ""}${escapeHtml(q.sumber)}</div>
              </div>
            </article>`;
            })
            .join("")}
          </main>
        </td>
      </tr>
    </tbody>
    <tfoot class="p-margin-bottom"><tr><td></td></tr></tfoot>
  </table>
  <footer class="p-footer">
    <div class="p-footer-accent" aria-hidden="true"></div>
    <div class="p-footer-inner">
      <div class="p-footer-brand">
        <span class="p-footer-badge">G</span>
        <span>Sumber unduhan: <strong>Giganta Exam Simulator</strong></span>
      </div>
      <span class="p-footer-meta">${escapeHtml(kodeShort(s))} (${escapeHtml(periodLabel)}) &middot; ${tanggal}</span>
    </div>
  </footer>`;
}

async function printSubject(s) {
  printArea.innerHTML = buildPrintHtml(s);
  // Tunggu semua gambar siap sebelum dialog cetak dibuka.
  await Promise.all(
    [...printArea.querySelectorAll("img")].map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()))
  );
  const oldTitle = document.title;
  document.title = `Soal_${kodeShort(s)}_${s.kode.split("_").slice(1).join("_")}`; // nama file PDF default
  const restore = () => {
    document.title = oldTitle;
    printArea.innerHTML = "";
  };
  window.addEventListener("afterprint", restore, { once: true });
  window.print();
}

/* ===================== Events ===================== */
function go(i) {
  state.current = i;
  window.scrollTo(0, 0);
  render();
}

function bindEvents() {
  const $$ = (sel, fn) => app.querySelectorAll(sel).forEach(fn);
  const themeButton = app.querySelector('[data-theme-toggle]');
  if (themeButton) themeButton.addEventListener('click', () => {
    const nextTheme = toggleTheme();
    themeButton.innerHTML = nextTheme === 'dark' ? ICONS.sun : ICONS.moon;
    themeButton.setAttribute('aria-label', nextTheme === 'dark' ? 'Aktifkan tema terang' : 'Aktifkan tema gelap');
  });

  $$("[data-home-group]", (el) =>
    el.addEventListener("click", () => {
      const group = el.getAttribute("data-home-group");
      if (["all", "20262", "reguler"].includes(group)) {
        state.homeGroup = group;
        render();
      }
    })
  );

  $$("[data-nav]", (el) =>
    el.addEventListener("click", () => {
      state.screen = el.getAttribute("data-nav");
      window.scrollTo(0, 0);
      render();
    })
  );
  $$('[data-open-subject]', el => el.addEventListener('click', () => {
    const index = Number.parseInt(el.getAttribute('data-open-subject'), 10);
    if (Number.isInteger(index) && state.data.subjects[index]) startSession(index);
  }));

  $$("[data-print-subject]", (el) =>
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = Number.parseInt(el.getAttribute("data-print-subject"), 10);
      if (Number.isInteger(index) && state.data.subjects[index]) printSubject(state.data.subjects[index]);
    })
  );

  const pc = app.querySelector("[data-print-current]");
  if (pc) pc.addEventListener("click", () => printSubject(state.subject));

  // Jawab: langsung terkunci dan memunculkan umpan balik.
  $$("[data-select]", (el) =>
    el.addEventListener("click", () => {
      const q = currentQuestion();
      if (state.answers[q.nomor] !== undefined) return;
      state.answers[q.nomor] = parseInt(el.getAttribute("data-select"), 10);
      render();
      const fb = document.getElementById("feedback");
      if (fb) fb.scrollIntoView({ block: "nearest", behavior: "smooth" });
    })
  );

  const flagBtn = app.querySelector("[data-flag]");
  if (flagBtn)
    flagBtn.addEventListener("click", () => {
      const q = currentQuestion();
      state.flags[q.nomor] = !state.flags[q.nomor];
      render();
    });

  const prevBtn = app.querySelector("[data-prev]");
  if (prevBtn) prevBtn.addEventListener("click", () => state.current > 0 && go(state.current - 1));

  const nextBtn = app.querySelector("[data-next]");
  if (nextBtn)
    nextBtn.addEventListener("click", () => state.current < state.subject.soal.length - 1 && go(state.current + 1));

  $$("[data-goto]", (el) =>
    el.addEventListener("click", () => {
      state.screen = "exam";
      go(parseInt(el.getAttribute("data-goto"), 10));
    })
  );

  $$("[data-finish]", (el) => el.addEventListener("click", finishExam));
  $$("[data-exit]", (el) => el.addEventListener("click", exitSession));
  $$("[data-home]", (el) => el.addEventListener("click", goHome));

  const retry = app.querySelector("[data-retry]");
  if (retry) retry.addEventListener("click", () => startSession(state.data.subjects.indexOf(state.subject)));

  $$("[data-filter]", (el) =>
    el.addEventListener("click", () => {
      state.filter = el.getAttribute("data-filter");
      render();
    })
  );
}

function skeletonHome() {
  return `<div class="shell"><div class="view">
    <header class="page-head"><div class="skel skel-title"></div><div class="skel skel-sub"></div></header>
    ${Array.from({ length: 4 }).map(() => `
    <article class="subject-card skel-card" aria-hidden="true">
      <div class="subject-accent skel"></div>
      <div class="subject-main">
        <div class="skel skel-line" style="width:40%"></div>
        <div class="skel skel-line" style="width:75%;height:1.0625rem;margin-top:.375rem"></div>
        <div class="skel skel-line" style="width:55%;margin-top:.375rem"></div>
      </div>
    </article>`).join("")}
    <p class="loading-note"><span class="spinner" aria-hidden="true"></span>Memuat bank soal&hellip;</p>
  </div></div>`;
}

(async function init() {
  app.innerHTML = skeletonHome();
  try {
    applyTheme(getTheme());
    state.data = await loadData();
    restoreState();
    render();
  } catch (e) {
    app.innerHTML = `<div class="shell"><div class="view"><p class="empty-state">${escapeHtml(e.message || 'Terjadi kesalahan saat memuat database soal.')} Pastikan aplikasi dijalankan melalui local server (mis. Live Server).</p></div></div>`;
    console.error(e);
  }
})();
