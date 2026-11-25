//! Validasi struktur bank soal. Padanan Rust dari `data.js` (validateQuestionBank).
#![allow(dead_code)]
use crate::json::{self, Json};
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct Question {
    pub nomor: String,
    pub gambar: Option<String>,
    pub jawaban: usize,
    pub pilihan: usize,
}

#[derive(Debug, Clone)]
pub struct Subject {
    pub kode: String,
    pub judul: String,
    pub passing_grade: f64,
    pub soal: Vec<Question>,
}

#[derive(Debug, Clone)]
pub struct Bank {
    pub subjects: Vec<Subject>,
}

impl Bank {
    pub fn total_questions(&self) -> usize {
        self.subjects.iter().map(|s| s.soal.len()).sum()
    }
}

/// Nomor soal sebagai kunci teks (sama seperti `String(nomor)` di JS).
fn number_key(j: &Json) -> Option<String> {
    match j {
        Json::Num(n) if n.fract() == 0.0 && n.abs() < 1e15 => Some(format!("{}", *n as i64)),
        Json::Num(n) => Some(n.to_string()),
        Json::Str(s) => Some(s.clone()),
        _ => None,
    }
}

fn is_non_empty_str(j: Option<&Json>) -> Option<String> {
    match j.and_then(Json::as_str) {
        Some(s) if !s.trim().is_empty() => Some(s.to_string()),
        _ => None,
    }
}

pub fn validate(src: &str) -> Result<Bank, String> {
    let root = json::parse(src).map_err(|e| format!("JSON tidak valid: {e}"))?;
    let subjects = match root.get("subjects").and_then(Json::as_arr) {
        Some(a) => a,
        None => {
            return Err("Format database tidak valid: properti subjects harus berupa array.".to_string())
        }
    };

    let mut errors: Vec<String> = Vec::new();
    if subjects.is_empty() {
        errors.push("Database tidak memiliki mata kuliah.".to_string());
    }

    let mut bank = Bank { subjects: Vec::new() };
    let mut codes: HashSet<String> = HashSet::new();

    for (si, subject) in subjects.iter().enumerate() {
        let label = format!("Mata kuliah ke-{}", si + 1);
        if !matches!(subject, Json::Obj(_)) {
            errors.push(format!("{label} tidak valid."));
            continue;
        }

        let kode = is_non_empty_str(subject.get("kode"));
        if kode.is_none() {
            errors.push(format!("{label}: kode tidak tersedia."));
        }
        let judul = is_non_empty_str(subject.get("judul"));
        if judul.is_none() {
            errors.push(format!("{label}: judul tidak tersedia."));
        }
        let passing = subject.get("passing_grade").and_then(Json::as_f64);
        match passing {
            Some(p) if (0.0..=100.0).contains(&p) => {}
            _ => errors.push(format!("{label}: passing grade harus 0–100.")),
        }
        if let Some(k) = &kode {
            if !codes.insert(k.clone()) {
                errors.push(format!("{label}: kode mata kuliah duplikat ({k})."));
            }
        }

        let soal = match subject.get("soal").and_then(Json::as_arr) {
            Some(a) if !a.is_empty() => a,
            _ => {
                errors.push(format!("{label}: daftar soal kosong atau tidak valid."));
                continue;
            }
        };

        let mut numbers: HashSet<String> = HashSet::new();
        let mut questions: Vec<Question> = Vec::with_capacity(soal.len());

        for (qi, q) in soal.iter().enumerate() {
            let ql = format!("{label}, soal ke-{}", qi + 1);
            if !matches!(q, Json::Obj(_)) {
                errors.push(format!("{ql} tidak valid."));
                continue;
            }

            let nomor = q.get("nomor").and_then(number_key).filter(|s| !s.trim().is_empty());
            match &nomor {
                None => errors.push(format!("{ql}: nomor soal tidak tersedia.")),
                Some(n) => {
                    if !numbers.insert(n.clone()) {
                        errors.push(format!("{ql}: nomor soal duplikat ({n})."));
                    }
                }
            }

            if is_non_empty_str(q.get("pertanyaan")).is_none() {
                errors.push(format!("{ql}: pertanyaan kosong."));
            }

            let gambar = match q.get("gambar") {
                None | Some(Json::Null) => None,
                Some(Json::Str(g)) if g.starts_with("assets/") && !g.split('/').any(|p| p == "..") => {
                    Some(g.clone())
                }
                Some(_) => {
                    errors.push(format!("{ql}: referensi gambar harus berupa path lokal di folder assets."));
                    None
                }
            };

            let pilihan_len = match q.get("pilihan").and_then(Json::as_arr) {
                Some(a) => {
                    if a.len() < 2 || a.len() > 5 {
                        errors.push(format!("{ql}: pilihan harus berjumlah 2–5."));
                    }
                    if a.iter().any(|o| o.as_str().is_none()) {
                        errors.push(format!("{ql}: setiap pilihan harus berupa teks."));
                    }
                    Some(a.len())
                }
                None => {
                    errors.push(format!("{ql}: pilihan harus berjumlah 2–5."));
                    None
                }
            };

            let jawaban = match (q.get("jawaban").and_then(Json::as_f64), pilihan_len) {
                (Some(n), Some(len)) if n.fract() == 0.0 && n >= 0.0 && (n as usize) < len => Some(n as usize),
                _ => {
                    errors.push(format!("{ql}: indeks kunci jawaban tidak valid."));
                    None
                }
            };

            if let (Some(nomor), Some(jawaban), Some(pilihan)) = (nomor, jawaban, pilihan_len) {
                questions.push(Question { nomor, gambar, jawaban, pilihan });
            }
        }

        if let (Some(kode), Some(judul), Some(passing_grade)) = (kode, judul, passing) {
            bank.subjects.push(Subject { kode, judul, passing_grade, soal: questions });
        }
    }

    if !errors.is_empty() {
        let shown: Vec<&str> = errors.iter().take(12).map(|s| s.as_str()).collect();
        let mut msg = format!("Validasi database gagal:\n- {}", shown.join("\n- "));
        if errors.len() > 12 {
            msg.push_str(&format!("\n- dan {} masalah lainnya", errors.len() - 12));
        }
        return Err(msg);
    }
    Ok(bank)
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL: &str = include_str!("../web/questions.json");

    fn real_json() -> String {
        REAL.to_string()
    }

    #[test]
    fn real_bank_is_valid() {
        let bank = validate(&real_json()).expect("bank asli harus valid");
        assert_eq!(bank.subjects.len(), 12);
        assert_eq!(bank.total_questions(), 1380);
    }

    #[test]
    fn every_referenced_image_is_embedded() {
        let bank = validate(&real_json()).unwrap();
        let mut count = 0;
        for s in &bank.subjects {
            for q in &s.soal {
                if let Some(g) = &q.gambar {
                    count += 1;
                    assert!(crate::server::embedded(g).is_some(), "gambar tidak tersemat: {g}");
                }
            }
        }
        assert_eq!(count, 75);
    }

    #[test]
    fn rejects_answer_out_of_range() {
        let src = r#"{"subjects":[{"kode":"A","judul":"A","passing_grade":75,"soal":[
            {"nomor":1,"pertanyaan":"q","pilihan":["a","b"],"jawaban":99}]}]}"#;
        let err = validate(src).unwrap_err();
        assert!(err.contains("indeks kunci jawaban tidak valid"), "{err}");
    }

    #[test]
    fn rejects_duplicate_question_number() {
        let src = r#"{"subjects":[{"kode":"A","judul":"A","passing_grade":75,"soal":[
            {"nomor":1,"pertanyaan":"q","pilihan":["a","b"],"jawaban":0},
            {"nomor":1,"pertanyaan":"r","pilihan":["a","b"],"jawaban":1}]}]}"#;
        assert!(validate(src).unwrap_err().contains("nomor soal duplikat"));
    }

    #[test]
    fn rejects_bad_image_path() {
        let src = r#"{"subjects":[{"kode":"A","judul":"A","passing_grade":75,"soal":[
            {"nomor":1,"pertanyaan":"q","gambar":"../x.png","pilihan":["a","b"],"jawaban":0}]}]}"#;
        assert!(validate(src).unwrap_err().contains("referensi gambar"));
    }

    #[test]
    fn rejects_missing_subjects() {
        assert!(validate("{}").unwrap_err().contains("subjects"));
        assert!(validate("[").unwrap_err().contains("JSON tidak valid"));
    }
}
