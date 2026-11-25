//! Parser JSON minimal (tanpa dependensi) untuk membaca `questions.json`.

#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Obj(items) => items.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s.as_str()),
            _ => None,
        }
    }
    pub fn as_arr(&self) -> Option<&[Json]> {
        match self {
            Json::Arr(a) => Some(a.as_slice()),
            _ => None,
        }
    }
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Json::Num(n) => Some(*n),
            _ => None,
        }
    }
}

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}

pub fn parse(src: &str) -> Result<Json, String> {
    let src = src.strip_prefix('\u{feff}').unwrap_or(src);
    let mut p = Parser { b: src.as_bytes(), i: 0 };
    p.ws();
    let v = p.value(0)?;
    p.ws();
    if p.i != p.b.len() {
        return Err(p.at("data berlebih setelah nilai JSON"));
    }
    Ok(v)
}

impl<'a> Parser<'a> {
    fn at(&self, msg: &str) -> String {
        format!("{msg} (posisi byte {})", self.i)
    }
    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }
    fn ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.i += 1;
        }
    }
    fn expect(&mut self, c: u8) -> Result<(), String> {
        if self.peek() == Some(c) {
            self.i += 1;
            Ok(())
        } else {
            Err(self.at(&format!("diharapkan '{}'", c as char)))
        }
    }
    fn literal(&mut self, word: &str, v: Json) -> Result<Json, String> {
        if self.b[self.i..].starts_with(word.as_bytes()) {
            self.i += word.len();
            Ok(v)
        } else {
            Err(self.at("literal tidak dikenal"))
        }
    }

    fn value(&mut self, depth: usize) -> Result<Json, String> {
        if depth > 128 {
            return Err(self.at("struktur terlalu dalam"));
        }
        match self.peek() {
            Some(b'{') => self.object(depth),
            Some(b'[') => self.array(depth),
            Some(b'"') => Ok(Json::Str(self.string()?)),
            Some(b't') => self.literal("true", Json::Bool(true)),
            Some(b'f') => self.literal("false", Json::Bool(false)),
            Some(b'n') => self.literal("null", Json::Null),
            Some(b'-' | b'0'..=b'9') => self.number(),
            _ => Err(self.at("nilai JSON tidak valid")),
        }
    }

    fn number(&mut self) -> Result<Json, String> {
        let start = self.i;
        while matches!(self.peek(), Some(b'+' | b'-' | b'.' | b'e' | b'E' | b'0'..=b'9')) {
            self.i += 1;
        }
        let text = std::str::from_utf8(&self.b[start..self.i]).map_err(|_| self.at("angka rusak"))?;
        text.parse::<f64>()
            .map(Json::Num)
            .map_err(|_| self.at("angka tidak valid"))
    }

    fn hex4(&mut self) -> Result<u32, String> {
        let slice = self
            .b
            .get(self.i..self.i + 4)
            .ok_or_else(|| self.at("escape \\u terpotong"))?;
        let text = std::str::from_utf8(slice).map_err(|_| self.at("escape \\u tidak valid"))?;
        let v = u32::from_str_radix(text, 16).map_err(|_| self.at("escape \\u tidak valid"))?;
        self.i += 4;
        Ok(v)
    }

    fn string(&mut self) -> Result<String, String> {
        self.i += 1; // tanda kutip pembuka
        let mut out: Vec<u8> = Vec::new();
        loop {
            let c = self
                .peek()
                .ok_or_else(|| self.at("string tidak ditutup"))?;
            self.i += 1;
            match c {
                b'"' => break,
                b'\\' => {
                    let e = self
                        .peek()
                        .ok_or_else(|| self.at("escape terpotong"))?;
                    self.i += 1;
                    match e {
                        b'"' => out.push(b'"'),
                        b'\\' => out.push(b'\\'),
                        b'/' => out.push(b'/'),
                        b'b' => out.push(8),
                        b'f' => out.push(12),
                        b'n' => out.push(b'\n'),
                        b'r' => out.push(b'\r'),
                        b't' => out.push(b'\t'),
                        b'u' => {
                            let cp = self.hex4()?;
                            let ch = if (0xD800..0xDC00).contains(&cp) {
                                if self.b.get(self.i) == Some(&b'\\') && self.b.get(self.i + 1) == Some(&b'u') {
                                    self.i += 2;
                                    let lo = self.hex4()?;
                                    if (0xDC00..0xE000).contains(&lo) {
                                        char::from_u32(0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00))
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            } else {
                                char::from_u32(cp)
                            };
                            let ch = ch.ok_or_else(|| self.at("karakter unicode tidak valid"))?;
                            let mut tmp = [0u8; 4];
                            out.extend_from_slice(ch.encode_utf8(&mut tmp).as_bytes());
                        }
                        _ => return Err(self.at("escape tidak dikenal")),
                    }
                }
                _ => out.push(c),
            }
        }
        String::from_utf8(out).map_err(|_| self.at("UTF-8 tidak valid"))
    }

    fn array(&mut self, depth: usize) -> Result<Json, String> {
        self.i += 1;
        let mut items = Vec::new();
        self.ws();
        if self.peek() == Some(b']') {
            self.i += 1;
            return Ok(Json::Arr(items));
        }
        loop {
            self.ws();
            items.push(self.value(depth + 1)?);
            self.ws();
            match self.peek() {
                Some(b',') => self.i += 1,
                Some(b']') => {
                    self.i += 1;
                    break;
                }
                _ => return Err(self.at("diharapkan ',' atau ']'")),
            }
        }
        Ok(Json::Arr(items))
    }

    fn object(&mut self, depth: usize) -> Result<Json, String> {
        self.i += 1;
        let mut items = Vec::new();
        self.ws();
        if self.peek() == Some(b'}') {
            self.i += 1;
            return Ok(Json::Obj(items));
        }
        loop {
            self.ws();
            if self.peek() != Some(b'"') {
                return Err(self.at("kunci objek harus berupa string"));
            }
            let key = self.string()?;
            self.ws();
            self.expect(b':')?;
            self.ws();
            let val = self.value(depth + 1)?;
            items.push((key, val));
            self.ws();
            match self.peek() {
                Some(b',') => self.i += 1,
                Some(b'}') => {
                    self.i += 1;
                    break;
                }
                _ => return Err(self.at("diharapkan ',' atau '}'")),
            }
        }
        Ok(Json::Obj(items))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_values() {
        let v = parse(r#"{"a":[1,-2.5,true,null],"b":"x"}"#).unwrap();
        assert_eq!(v.get("b").and_then(Json::as_str), Some("x"));
        let arr = v.get("a").and_then(Json::as_arr).unwrap();
        assert_eq!(arr[0], Json::Num(1.0));
        assert_eq!(arr[1], Json::Num(-2.5));
        assert_eq!(arr[2], Json::Bool(true));
        assert_eq!(arr[3], Json::Null);
    }

    #[test]
    fn parses_escapes_and_unicode() {
        let v = parse(r#""a\n\"b\" \u00e9 \ud83d\ude00 é""#).unwrap();
        assert_eq!(v.as_str(), Some("a\n\"b\" é 😀 é"));
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse("{").is_err());
        assert!(parse("[1,]").is_err());
        assert!(parse("{} x").is_err());
        assert!(parse(r#""\ud800""#).is_err());
    }

    #[test]
    fn tolerates_bom() {
        assert!(parse("\u{feff}[]").is_ok());
    }
}
