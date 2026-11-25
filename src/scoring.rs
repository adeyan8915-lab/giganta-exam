//! Perhitungan skor murni. Padanan Rust dari `scoring.js`.
//! UI web tetap memakai `scoring.js`; modul ini adalah referensi teruji.
#![allow(dead_code)]
use crate::bank::Subject;
use std::collections::HashMap;

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub struct Counts {
    pub correct: usize,
    pub wrong: usize,
    pub empty: usize,
    pub total: usize,
}

pub fn get_counts(subject: &Subject, answers: &HashMap<String, usize>) -> Counts {
    let (mut correct, mut wrong) = (0, 0);
    for q in &subject.soal {
        match answers.get(&q.nomor) {
            None => {}
            Some(&a) if a == q.jawaban => correct += 1,
            Some(_) => wrong += 1,
        }
    }
    let total = subject.soal.len();
    Counts { correct, wrong, empty: total - correct - wrong, total }
}

/// Skor 0–100 dibulatkan satu desimal.
pub fn calculate_score(subject: &Subject, answers: &HashMap<String, usize>) -> (Counts, f64) {
    let c = get_counts(subject, answers);
    let score = if c.total == 0 {
        0.0
    } else {
        ((c.correct as f64 / c.total as f64) * 1000.0).round() / 10.0
    };
    (c, score)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bank::Question;

    fn q(n: &str, j: usize) -> Question {
        Question { nomor: n.to_string(), gambar: None, jawaban: j, pilihan: 4 }
    }

    #[test]
    fn counts_and_score_match_js_reference() {
        let subject = Subject {
            kode: "X".into(),
            judul: "X".into(),
            passing_grade: 75.0,
            soal: vec![q("1", 0), q("2", 1), q("3", 2), q("4", 0)],
        };
        let mut answers = HashMap::new();
        answers.insert("1".to_string(), 0);
        answers.insert("2".to_string(), 0);
        answers.insert("3".to_string(), 2);
        let (c, score) = calculate_score(&subject, &answers);
        assert_eq!(c, Counts { correct: 2, wrong: 1, empty: 1, total: 4 });
        assert_eq!(score, 50.0);
    }

    #[test]
    fn empty_subject_scores_zero() {
        let subject = Subject { kode: "X".into(), judul: "X".into(), passing_grade: 75.0, soal: vec![] };
        assert_eq!(calculate_score(&subject, &HashMap::new()).1, 0.0);
    }

    #[test]
    fn rounds_to_one_decimal() {
        let subject = Subject {
            kode: "X".into(),
            judul: "X".into(),
            passing_grade: 75.0,
            soal: vec![q("1", 0), q("2", 0), q("3", 0)],
        };
        let mut a = HashMap::new();
        a.insert("1".to_string(), 0);
        assert_eq!(calculate_score(&subject, &a).1, 33.3);
    }
}
