//! Native Rust Location Catalog & Hybrid Geocoding Search (`engine::knowledge::locations`).
//!
//! Provides zero-latency prefix/substring matching against all 38 Indonesian provinces,
//! major Indonesian cities/regencies, and global business hubs, with an optional
//! non-blocking fallback to Open-Meteo Geocoding API in Rust.

use axum::{
    extract::Query,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::time::Duration;

pub const LOCAL_LOCATIONS: &[&str] = &[
    // 38 Provinsi di Indonesia
    "Aceh",
    "Sumatera Utara",
    "Sumatera Barat",
    "Riau",
    "Kepulauan Riau",
    "Jambi",
    "Sumatera Selatan",
    "Bengkulu",
    "Lampung",
    "Kepulauan Bangka Belitung",
    "DKI Jakarta",
    "Jawa Barat",
    "Banten",
    "Jawa Tengah",
    "DI Yogyakarta",
    "Jawa Timur",
    "Bali",
    "Nusa Tenggara Barat",
    "Nusa Tenggara Timur",
    "Kalimantan Barat",
    "Kalimantan Tengah",
    "Kalimantan Selatan",
    "Kalimantan Timur",
    "Kalimantan Utara",
    "Sulawesi Utara",
    "Gorontalo",
    "Sulawesi Tengah",
    "Sulawesi Barat",
    "Sulawesi Selatan",
    "Sulawesi Tenggara",
    "Maluku",
    "Maluku Utara",
    "Papua",
    "Papua Barat",
    "Papua Selatan",
    "Papua Tengah",
    "Papua Pegunungan",
    "Papua Barat Daya",
    // Kota & Kabupaten Utama di Indonesia
    "Jakarta",
    "Jakarta Pusat",
    "Jakarta Selatan",
    "Jakarta Barat",
    "Jakarta Timur",
    "Jakarta Utara",
    "Surabaya",
    "Bandung",
    "Medan",
    "Semarang",
    "Makassar",
    "Palembang",
    "Tangerang",
    "Tangerang Selatan",
    "Depok",
    "Bekasi",
    "Bogor",
    "Malang",
    "Yogyakarta",
    "Denpasar",
    "Batam",
    "Pekanbaru",
    "Bandar Lampung",
    "Padang",
    "Samarinda",
    "Balikpapan",
    "Banjarmasin",
    "Pontianak",
    "Manado",
    "Mataram",
    "Kupang",
    "Jayapura",
    "Ambon",
    "Palu",
    "Kendari",
    "Banda Aceh",
    "Pangkalpinang",
    "Tanjungpinang",
    "Serang",
    "Cilegon",
    "Cirebon",
    "Sukabumi",
    "Tasikmalaya",
    "Cimahi",
    "Karawang",
    "Cikarang",
    "Surakarta (Solo)",
    "Magelang",
    "Salatiga",
    "Pekalongan",
    "Tegal",
    "Purwokerto",
    "Cilacap",
    "Kudus",
    "Jepara",
    "Kediri",
    "Madiun",
    "Blitar",
    "Mojokerto",
    "Pasuruan",
    "Probolinggo",
    "Batu",
    "Sidoarjo",
    "Gresik",
    "Banyuwangi",
    "Jember",
    "Sleman",
    "Bantul",
    "Badung",
    "Gianyar",
    "Singaraja",
    "Lombok",
    "Labuan Bajo",
    "Tarakan",
    "Bontang",
    "Banjarbaru",
    "Palangka Raya",
    "Singkawang",
    "Bitung",
    "Tomohon",
    "Parepare",
    "Palopo",
    "Baubau",
    "Ternate",
    "Tidore",
    "Sorong",
    "Manokwari",
    "Merauke",
    "Timika",
    "Pematangsiantar",
    "Binjai",
    "Tebing Tinggi",
    "Sibolga",
    "Bukittinggi",
    "Payakumbuh",
    "Dumai",
    "Lubuklinggau",
    "Prabumulih",
    "Metro",
    // Kota Utama Dunia (Regional & Global)
    "Singapore",
    "Kuala Lumpur",
    "Penang",
    "Johor Bahru",
    "Bangkok",
    "Manila",
    "Ho Chi Minh City",
    "Hanoi",
    "Tokyo",
    "Osaka",
    "Seoul",
    "Hong Kong",
    "Taipei",
    "Shanghai",
    "Beijing",
    "Shenzhen",
    "Guangzhou",
    "Sydney",
    "Melbourne",
    "Perth",
    "Dubai",
    "Riyadh",
    "Doha",
    "London",
    "Amsterdam",
    "Frankfurt",
    "Paris",
    "Berlin",
    "Zurich",
    "New York",
    "San Francisco",
    "Los Angeles",
    "Chicago",
    "Seattle",
    "Austin",
    "Toronto",
    "Vancouver",
];

#[derive(Debug, Deserialize)]
pub struct LocationQuery {
    #[serde(default)]
    pub q: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub remote: Option<bool>,
}

fn default_limit() -> usize {
    7
}

/// Fast synchronous prefix + substring filter against the compiled-in `LOCAL_LOCATIONS` slice.
pub fn filter_local_locations(query: &str, limit: usize) -> Vec<String> {
    let clean = query.trim().to_lowercase();
    if clean.chars().count() < 2 || limit == 0 {
        return Vec::new();
    }

    let mut prefix_matches = Vec::with_capacity(limit);
    let mut substring_matches = Vec::new();

    for &loc in LOCAL_LOCATIONS {
        let lower = loc.to_lowercase();
        if lower.starts_with(&clean) {
            prefix_matches.push(loc.to_string());
            if prefix_matches.len() >= limit {
                return prefix_matches;
            }
        } else if lower.contains(&clean) {
            substring_matches.push(loc.to_string());
        }
    }

    prefix_matches.extend(
        substring_matches
            .into_iter()
            .take(limit.saturating_sub(prefix_matches.len())),
    );
    prefix_matches
}

/// Hybrid search: combines `filter_local_locations` with Open-Meteo Geocoding API if fewer than `limit` local matches exist.
pub async fn search_hybrid_locations(query: &str, limit: usize, allow_remote: bool) -> Vec<String> {
    let limit = limit.clamp(1, 20);
    let mut merged = filter_local_locations(query, limit);
    if merged.len() >= limit || !allow_remote {
        return merged;
    }

    let clean = query.trim();
    if clean.chars().count() < 2 {
        return merged;
    }

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(1800))
        .build()
    {
        Ok(c) => c,
        Err(_) => return merged,
    };

    let url = format!(
        "https://geocoding-api.open-meteo.com/v1/search?name={}&count={}&language=id&format=json",
        urlencoding_encode(clean),
        limit
    );

    if let Ok(resp) = client.get(&url).send().await {
        if resp.status().is_success() {
            if let Ok(json_body) = resp.json::<Value>().await {
                if let Some(results) = json_body.get("results").and_then(|v| v.as_array()) {
                    let mut seen: HashSet<String> =
                        merged.iter().map(|s| s.to_lowercase()).collect();

                    for item in results {
                        let Some(name) = item.get("name").and_then(|v| v.as_str()) else {
                            continue;
                        };
                        let admin1 = item.get("admin1").and_then(|v| v.as_str()).unwrap_or("");
                        let label = if !admin1.is_empty()
                            && !admin1.eq_ignore_ascii_case(name)
                        {
                            format!("{}, {}", name, admin1)
                        } else {
                            name.to_string()
                        };

                        let key = label.to_lowercase();
                        let name_key = name.to_lowercase();
                        if !seen.contains(&key) && !seen.contains(&name_key) {
                            seen.insert(key);
                            merged.push(label);
                            if merged.len() >= limit {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    merged
}

fn urlencoding_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            b' ' => out.push_str("%20"),
            other => out.push_str(&format!("%{:02X}", other)),
        }
    }
    out
}

/// `GET /api/knowledge/locations?q=...&limit=7`
pub async fn handle_search_locations(Query(params): Query<LocationQuery>) -> Response {
    let allow_remote = params.remote.unwrap_or(true);
    let results = search_hybrid_locations(&params.q, params.limit, allow_remote).await;
    Json(json!({
        "ok": true,
        "data": results,
    }))
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_prefix_matches_before_substring_matches() {
        let res = filter_local_locations("jak", 7);
        assert!(!res.is_empty());
        // "Jakarta" starts with "jak" whereas "DKI Jakarta" contains "jak"
        assert_eq!(res[0], "Jakarta");
        assert!(res.contains(&"DKI Jakarta".to_string()));
    }

    #[test]
    fn ignores_single_char_queries() {
        assert!(filter_local_locations("j", 7).is_empty());
        assert!(filter_local_locations("   ", 7).is_empty());
    }
}

