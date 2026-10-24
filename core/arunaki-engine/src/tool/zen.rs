//! ArunakiZen Integration Tools
//!
//! Provides OpenAI-compatible function tools to interact with local ArunakiZen engine:
//! - `arunakizen_search_product`: Catalog search by barcode, item code, or name
//! - `arunakizen_create_sale_order`: Atomic cashier retail sales order (R43 invoice)
//! - `arunakizen_get_shift_summary`: Cash register shift drawer turnover and cash balance
//! - `arunakizen_print_receipt`: Thermal receipt printing and optional drawer kick
//! - `arunakizen_open_drawer`: Standalone cash drawer kick pulse
//! - `arunakizen_adjust_stock`: Correct stock inventory balance
//! - `arunakizen_void_sale_order`: Void / cancel and rollback cashier sales invoice
//!
//! Conforms to `E:\JS\Arunaki-POS\doc\PANDUAN_KONEKSI_ARUNAKI_AGENT_KE_ARUNAKIZEN.md`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

use crate::paths::arunaki_dot_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZenConfig {
    pub host_url: String,
    pub api_key: String,
    pub username: String,
    pub password: Option<String>,
}

pub type PosConfig = ZenConfig;

impl Default for ZenConfig {
    fn default() -> Self {
        Self {
            host_url: "http://127.0.0.1:5000".to_string(),
            api_key: String::new(),
            username: String::new(),
            password: None,
        }
    }
}

fn detect_active_pos_port() -> Option<u16> {
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;

    for port in 5000..=5010 {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        if TcpStream::connect_timeout(&addr, Duration::from_millis(30)).is_ok() {
            return Some(port);
        }
    }
    None
}

pub fn load_zen_config() -> ZenConfig {
    load_pos_config()
}

pub fn load_pos_config() -> ZenConfig {
    let mut cfg = PosConfig::default();

    // 1. Try reading user custom config from ~/.arunaki/pos-config.json
    let p = arunaki_dot_dir().join("pos-config.json");
    if let Ok(raw) = std::fs::read_to_string(&p) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            if let Some(u) = val.get("hostUrl").or_else(|| val.get("host_url")).and_then(|v| v.as_str()) {
                if !u.trim().is_empty() {
                    cfg.host_url = u.trim_end_matches('/').to_string();
                }
            }
            if let Some(k) = val.get("apiKey").or_else(|| val.get("api_key")).and_then(|v| v.as_str()) {
                if !k.trim().is_empty() {
                    cfg.api_key = k.trim().to_string();
                }
            }
            if let Some(un) = val.get("username").and_then(|v| v.as_str()) {
                if !un.trim().is_empty() {
                    cfg.username = un.trim().to_string();
                }
            }
            if let Some(pw) = val.get("password").and_then(|v| v.as_str()) {
                cfg.password = Some(pw.to_string());
            }
        }
    }

    // 2. Production & Development auto-discovery from active ArunakiZen runtime configuration
    let mut runtime_candidates = vec![
        std::path::PathBuf::from("pos-runtime.json"),
        arunaki_dot_dir().join("pos-runtime.json"),
    ];

    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        runtime_candidates.push(std::path::PathBuf::from(&local_appdata).join("Programs/ArunakiZen/pos-runtime.json"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        runtime_candidates.push(std::path::PathBuf::from(&appdata).join("ArunakiZen/pos-runtime.json"));
    }
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        runtime_candidates.push(std::path::PathBuf::from(&userprofile).join(".arunakizen/pos-runtime.json"));
    }

    // Dev workspace fallback candidates
    runtime_candidates.extend(vec![
        std::path::PathBuf::from("E:/JS/Arunaki-POS/target/debug/pos-runtime.json"),
        std::path::PathBuf::from("E:/JS/Arunaki-POS/pos-runtime.json"),
        std::path::PathBuf::from("../Arunaki-POS/target/debug/pos-runtime.json"),
        std::path::PathBuf::from("../Arunaki-POS/pos-runtime.json"),
    ]);

    for rp in &runtime_candidates {
        if let Ok(raw) = std::fs::read_to_string(rp) {
            if let Ok(val) = serde_json::from_str::<Value>(&raw) {
                if let Some(u) = val.get("url").and_then(|v| v.as_str()) {
                    if !u.trim().is_empty() {
                        cfg.host_url = u.trim_end_matches('/').to_string();
                    }
                }
                if let Some(k) = val.get("apiKey").and_then(|v| v.as_str()) {
                    if !k.trim().is_empty() {
                        cfg.api_key = k.trim().to_string();
                    }
                }
                break;
            }
        }
    }

    // 3. Dynamic Localhost Port Hunting (5000-5100):
    // If running on localhost and the target port is not open or on default,
    // automatically detect the live port where ArunakiZen is listening.
    if cfg.host_url.starts_with("http://127.0.0.1") || cfg.host_url.starts_with("http://localhost") {
        if let Some(active_port) = detect_active_pos_port() {
            cfg.host_url = format!("http://127.0.0.1:{}", active_port);
        }
    }

    cfg
}

pub fn zen_tool_definitions() -> Vec<Value> {
    pos_tool_definitions()
}

pub fn pos_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "arunakizen_search_product",
                "description": include_str!("prompt/zen_search.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Single search keyword (product name, item code, or scanned barcode)."
                        },
                        "queries": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "BATCH SEARCH: Array of product names/queries to search multiple items simultaneously in ONE call (e.g. ['KPM POLO BLACK L', 'NSA LONGSLEEVE MAROON XL']). Always use this when user provides multiple items to avoid looping!"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of items to return per query (default: 5).",
                            "default": 5
                        }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "arunakizen_create_sale_order",
                "description": include_str!("prompt/zen_order.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "customer": {
                            "type": "string",
                            "description": "Customer or member code (use 'UMUM' for regular walk-in customers).",
                            "default": "UMUM"
                        },
                        "payment_method": {
                            "type": "string",
                            "enum": ["CASH", "TRANSFER", "QRIS", "PIUTANG"],
                            "description": "Payment method selected by the customer.",
                            "default": "CASH"
                        },
                        "amount_paid": {
                            "type": "number",
                            "description": "Amount of cash/money tendered by the customer."
                        },
                        "items": {
                            "type": "array",
                            "description": "List of purchased items.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "item_code": { "type": "string", "description": "Unique SKU or barcode of the product." },
                                    "qty": { "type": "number", "description": "Quantity purchased." },
                                    "price": { "type": "number", "description": "Unit selling price." },
                                    "discount_percent": { "type": "number", "description": "Item discount percentage (default: 0).", "default": 0 }
                                },
                                "required": ["item_code", "qty", "price"]
                            }
                        },
                        "notes": {
                            "type": "string",
                            "description": "STRICT: Leave empty (\"\") unless the user explicitly gave a specific custom note to record (e.g. 'catatan: titip satpam'). Never auto-generate notes or summaries!"
                        }
                    },
                    "required": ["payment_method", "amount_paid", "items"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "arunakizen_get_shift_summary",
                "description": include_str!("prompt/zen_shift.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "arunakizen_print_receipt",
                "description": include_str!("prompt/zen_receipt.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "invoice": {
                            "type": "string",
                            "description": "Sales invoice number (e.g. 'R43-231026001')."
                        },
                        "open_drawer": {
                            "type": "boolean",
                            "description": "Kick open the physical cash drawer after printing receipt (default: true).",
                            "default": true
                        },
                        "printer": {
                            "type": "string",
                            "description": "Target thermal printer name (empty to use the system default printer)."
                        },
                        "kasir": {
                            "type": "string",
                            "description": "Cashier operator name to display on receipt (optional, defaults to active user e.g. 'Candana')."
                        }
                    },
                    "required": ["invoice"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "arunakizen_open_drawer",
                "description": include_str!("prompt/zen_drawer.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "printer": {
                            "type": "string",
                            "description": "Target thermal printer name (optional, defaults to system default printer)."
                        }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "arunakizen_adjust_stock",
                "description": include_str!("prompt/zen_adjust_stock.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "item_code": {
                            "type": "string",
                            "description": "Unique SKU, barcode, or item code of the product."
                        },
                        "actual_stock": {
                            "type": "number",
                            "description": "New physical stock quantity (must be >= 0)."
                        },
                        "location": {
                            "type": "string",
                            "enum": ["toko", "gudang"],
                            "description": "Target stock location: 'toko' (default) or 'gudang'.",
                            "default": "toko"
                        },
                        "reason": {
                            "type": "string",
                            "description": "Optional reason for the adjustment (e.g. 'Opname fisik', 'Barang rusak').",
                            "default": "Penyesuaian stok via Arunaki Agent"
                        }
                    },
                    "required": ["item_code", "actual_stock"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "arunakizen_void_sale_order",
                "description": include_str!("prompt/zen_void.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "invoice": {
                            "type": "string",
                            "description": "Sales invoice number to void (e.g. 'R43-241026007')."
                        },
                        "reason": {
                            "type": "string",
                            "description": "Reason for cancellation or revision (e.g. 'Revisi pesanan / koreksi item salah').",
                            "default": "Pembatalan / revisi transaksi via Arunaki Agent"
                        },
                        "operator": {
                            "type": "string",
                            "description": "Cashier or operator name (optional, defaults to active user)."
                        }
                    },
                    "required": ["invoice"]
                }
            }
        }),
    ]
}

fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let (m, n) = (a_chars.len(), b_chars.len());

    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }

    let mut dp = vec![vec![0; n + 1]; m + 1];

    for i in 0..=m {
        dp[i][0] = i;
    }
    for j in 0..=n {
        dp[0][j] = j;
    }

    for i in 1..=m {
        for j in 1..=n {
            let cost = if a_chars[i - 1].to_ascii_lowercase() == b_chars[j - 1].to_ascii_lowercase() {
                0
            } else {
                1
            };
            dp[i][j] = (dp[i - 1][j] + 1)
                .min(dp[i][j - 1] + 1)
                .min(dp[i - 1][j - 1] + cost);
        }
    }

    dp[m][n]
}

async fn try_fuzzy_suggest_products(
    client: &reqwest::Client,
    cfg: &PosConfig,
    query: &str,
    limit: u64,
) -> Option<Value> {
    let q_upper = query.to_uppercase();
    let words: Vec<&str> = q_upper.split_whitespace().collect();
    if words.is_empty() {
        return None;
    }

    let sizes = [
        "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "XXL", "XXXL", "ALLSIZE", "KIDS",
    ];
    let detected_size = words.iter().find(|w| sizes.contains(w)).copied();

    // Significant content words (non-size, >= 3 chars)
    let content_words: Vec<&str> = words
        .iter()
        .filter(|w| !sizes.contains(w) && w.len() >= 3)
        .copied()
        .collect();
    if content_words.is_empty() {
        return None;
    }

    // Query candidate products from POS by searching content word prefixes (3 chars) or full word
    let mut candidate_items: Vec<Value> = Vec::new();
    let mut seen_codes = std::collections::HashSet::new();

    for w in &content_words {
        let prefix_len = if w.len() >= 4 { 3 } else { w.len() };
        let prefix = &w[..prefix_len];
        let ep = format!("{}/api/products?q={}&limit=60", cfg.host_url, prefix);
        let mut req = client.get(&ep);
        if !cfg.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
        }
        if let Ok(res) = req.send().await {
            if res.status().is_success() {
                if let Ok(json_res) = res.json::<Value>().await {
                    if let Some(arr) = json_res.get("data").and_then(|d| d.as_array()) {
                        for item in arr {
                            let kode = item.get("kode").and_then(|v| v.as_str()).unwrap_or("");
                            if !kode.is_empty() && seen_codes.insert(kode.to_string()) {
                                candidate_items.push(item.clone());
                            }
                        }
                    }
                }
            }
        }
    }

    if candidate_items.is_empty() {
        return None;
    }

    // Score candidates against the query words
    struct Scored {
        item: Value,
        score: i32,
        matched_name: String,
    }

    let mut scored_list: Vec<Scored> = Vec::new();

    for item in candidate_items {
        let nama = item
            .get("nama")
            .or_else(|| item.get("namabarang"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let item_words: Vec<&str> = nama.split_whitespace().collect();

        let mut item_score = 0;
        let mut has_typo_match = false;

        // Check size match bonus
        if let Some(target_sz) = detected_size {
            if item_words.iter().any(|iw| iw.eq_ignore_ascii_case(target_sz)) {
                item_score += 15;
            }
        }

        // Check word similarity
        for qw in &content_words {
            let mut min_dist = 999;
            for iw in &item_words {
                let d = levenshtein_distance(qw, iw);
                if d < min_dist {
                    min_dist = d;
                }
            }
            if min_dist == 0 {
                item_score += 30; // Exact word match
            } else if min_dist <= 2 && qw.len() >= 4 {
                item_score += 20 - (min_dist as i32 * 5); // Fuzzy typo match!
                has_typo_match = true;
            }
        }

        if has_typo_match || item_score >= 25 {
            scored_list.push(Scored {
                item,
                score: item_score,
                matched_name: nama,
            });
        }
    }

    scored_list.sort_by(|a, b| b.score.cmp(&a.score));

    if scored_list.is_empty() {
        return None;
    }

    let suggestions: Vec<Value> = scored_list
        .iter()
        .take(limit as usize)
        .map(|s| {
            let it = &s.item;
            json!({
                "kode": it.get("kode").and_then(|v| v.as_str()).unwrap_or(""),
                "nama": s.matched_name,
                "harga": it.get("hargajual").and_then(|v| v.as_f64()).unwrap_or(0.0),
                "stok": it.get("stok").and_then(|v| v.as_i64()).unwrap_or(0),
                "similarity_score": s.score,
            })
        })
        .collect();

    let top_suggestion = suggestions.first()?;
    let top_nama = top_suggestion
        .get("nama")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let top_kode = top_suggestion
        .get("kode")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let top_harga = top_suggestion
        .get("harga")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let msg = format!(
        "Produk '{}' tidak ditemukan di katalog ArunakiZen. Ditemukan saran produk serupa (kemungkinan typo): '{}' (Kode: {}, Rp {:.0}). DILARANG keras mensubstitusi barang secara sepihak! Tanyakan kepada user dengan memanggil tool 'question' untuk mengonfirmasi pilihan sebelum mencatat pesanan.",
        query, top_nama, top_kode, top_harga
    );

    Some(json!({
        "count": 0,
        "data": [],
        "is_typo_suggestion": true,
        "query": query,
        "suggested_product": top_nama,
        "suggestions": suggestions,
        "message": msg
    }))
}

async fn search_single_query(
    client: &reqwest::Client,
    cfg: &PosConfig,
    query: &str,
    limit: u64,
) -> Value {
    let endpoints = [
        format!("{}/api/products?q={}&limit={}", cfg.host_url, query, limit),
        format!("{}/products?q={}&limit={}", cfg.host_url, query, limit),
        format!("{}/api/barang?q={}&limit={}", cfg.host_url, query, limit),
    ];

    for ep in &endpoints {
        let mut req = client.get(ep);
        if !cfg.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
        }
        if let Ok(res) = req.send().await {
            if res.status().is_success() {
                if let Ok(json_val) = res.json::<Value>().await {
                    let has_data = json_val
                        .get("data")
                        .and_then(|d| d.as_array())
                        .map(|arr| !arr.is_empty())
                        .unwrap_or(false);
                    if has_data {
                        return json_val;
                    }

                    // Query returned 0 results: try intelligent fuzzy typo detection!
                    if let Some(fuzzy_res) =
                        try_fuzzy_suggest_products(client, cfg, query, limit).await
                    {
                        return fuzzy_res;
                    }

                    return json_val;
                }
            }
        }
    }

    json!({
        "error": format!("Failed to search products in ArunakiZen ({}) — ensure ArunakiZen server is running.", cfg.host_url),
        "query": query
    })
}

pub async fn execute_search_product(args: &Value) -> Value {
    let cfg = load_pos_config();

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client initialization failed: {}", e) }),
    };

    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(5);

    // Extract queries: either batch array 'queries' or single 'query'
    let mut queries_list: Vec<String> = Vec::new();
    if let Some(arr) = args.get("queries").and_then(|v| v.as_array()) {
        for it in arr {
            if let Some(s) = it.as_str() {
                let trimmed = s.trim();
                if !trimmed.is_empty() {
                    queries_list.push(trimmed.to_string());
                }
            }
        }
    }
    if queries_list.is_empty() {
        let single = args
            .get("query")
            .or_else(|| args.get("q"))
            .or_else(|| args.get("search"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if !single.is_empty() {
            queries_list.push(single.to_string());
        }
    }

    if queries_list.is_empty() {
        return json!({ "error": "Search parameter 'query' or 'queries' array is required." });
    }

    // Single query mode (backward compatible output format)
    if queries_list.len() == 1 && args.get("queries").is_none() {
        return search_single_query(&client, &cfg, &queries_list[0], limit).await;
    }

    // Batch query mode: execute all queries concurrently in parallel!
    use futures_util::future::join_all;
    let futures: Vec<_> = queries_list
        .iter()
        .map(|q| {
            let client = client.clone();
            let cfg = cfg.clone();
            let q = q.clone();
            async move {
                let res = search_single_query(&client, &cfg, &q, limit).await;
                let is_typo = res.get("is_typo_suggestion") == Some(&json!(true));
                let data_arr = res.get("data").and_then(|d| d.as_array());
                let has_data = data_arr.map(|a| !a.is_empty()).unwrap_or(false);

                let top_item = if has_data {
                    data_arr.and_then(|a| a.first()).cloned()
                } else {
                    None
                };

                json!({
                    "query": q,
                    "matched": has_data,
                    "top_item": top_item,
                    "is_typo_suggestion": is_typo,
                    "suggestion": res.get("suggested_product").cloned().unwrap_or(Value::Null),
                    "suggestions": res.get("suggestions").cloned().unwrap_or(json!([])),
                    "message": res.get("message").cloned().unwrap_or(Value::Null),
                    "raw": res
                })
            }
        })
        .collect();

    let results = join_all(futures).await;
    let all_matched = results
        .iter()
        .all(|r| r.get("matched") == Some(&json!(true)));
    let has_unmatched_or_typo = results
        .iter()
        .any(|r| r.get("matched") != Some(&json!(true)));

    json!({
        "is_batch": true,
        "total_queries": queries_list.len(),
        "all_matched": all_matched,
        "has_unmatched_or_typo": has_unmatched_or_typo,
        "results": results
    })
}

pub fn sanitize_transaction_notes(raw_notes: &str) -> &str {
    let t = raw_notes.trim();
    if t.eq_ignore_ascii_case("none")
        || t.eq_ignore_ascii_case("null")
        || t.eq_ignore_ascii_case("-")
        || t.starts_with("Pesanan ")
        || t.starts_with("Order ")
        || t.starts_with("Transaksi ")
        || t.starts_with("Pembelian ")
        || t.starts_with("Penjualan ")
    {
        ""
    } else {
        t
    }
}

pub async fn execute_create_sale_order(args: &Value) -> Value {
    let cfg = load_pos_config();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client initialization failed: {}", e) }),
    };

    // Normalize parameters for ArunakiZen backend
    let customer = args
        .get("customer")
        .or_else(|| args.get("pelanggan"))
        .and_then(|v| v.as_str())
        .unwrap_or("UMUM");

    let payment_method = args
        .get("payment_method")
        .or_else(|| args.get("pembayaran"))
        .and_then(|v| v.as_str())
        .unwrap_or("CASH");

    let amount_paid = args
        .get("amount_paid")
        .or_else(|| args.get("jumlah_bayar"))
        .or_else(|| args.get("bayar"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let raw_notes = args
        .get("notes")
        .or_else(|| args.get("catatan"))
        .or_else(|| args.get("keterangan"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let notes = sanitize_transaction_notes(raw_notes);

    let mut raw_items: Vec<Value> = Vec::new();
    if let Some(items_arr) = args.get("items").and_then(|v| v.as_array()) {
        for it in items_arr {
            let code = it
                .get("item_code")
                .or_else(|| it.get("kode_barang"))
                .or_else(|| it.get("kode"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if code.is_empty() {
                continue;
            }
            let qty = it.get("qty").and_then(|v| v.as_f64()).unwrap_or(1.0);
            let price = it
                .get("price")
                .or_else(|| it.get("harga"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let disc = it
                .get("discount_percent")
                .or_else(|| it.get("diskon_persen"))
                .or_else(|| it.get("diskon"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);

            raw_items.push(json!({
                "kode": code,
                "qty": qty,
                "harga": price,
                "diskon": disc
            }));
        }
    }

    // Merge duplicate rows with identical (kode, harga, diskon) to comply with POS standard:
    // Identical items must combine their quantity into 1 row, unless price/discount differs.
    let mut merged_items: Vec<Value> = Vec::new();
    for it in raw_items {
        let code = it.get("kode").and_then(|v| v.as_str()).unwrap_or("");
        let price = it.get("harga").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let disc = it.get("diskon").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let qty = it.get("qty").and_then(|v| v.as_f64()).unwrap_or(1.0);

        if let Some(existing) = merged_items.iter_mut().find(|m| {
            m.get("kode").and_then(|v| v.as_str()).unwrap_or("") == code
                && (m.get("harga").and_then(|v| v.as_f64()).unwrap_or(0.0) - price).abs() < 0.01
                && (m.get("diskon").and_then(|v| v.as_f64()).unwrap_or(0.0) - disc).abs() < 0.01
        }) {
            let cur_qty = existing.get("qty").and_then(|v| v.as_f64()).unwrap_or(0.0);
            existing["qty"] = json!(cur_qty + qty);
        } else {
            merged_items.push(it);
        }
    }

    let payload = json!({
        "pelanggan": customer,
        "pembayaran": payment_method,
        "bayar": amount_paid,
        "keterangan": notes,
        "items": merged_items,
        "user": cfg.username,
        "operator": {
            "username": cfg.username,
            "password": cfg.password.unwrap_or_default(),
            "api_key": cfg.api_key
        }
    });

    let endpoints = [
        format!("{}/api/orders", cfg.host_url),
        format!("{}/orders", cfg.host_url),
        format!("{}/api/sales", cfg.host_url),
        format!("{}/api/penjualan", cfg.host_url),
    ];

    for ep in &endpoints {
        let mut req = client.post(ep);
        if !cfg.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
        }
        if let Ok(res) = req.json(&payload).send().await {
            let status_code = res.status();
            if let Ok(json_val) = res.json::<Value>().await {
                if status_code.is_success() || json_val.get("success") == Some(&json!(true)) {
                    return json_val;
                }
                return json!({
                    "error": format!("ArunakiZen rejected invoice: {}", json_val.get("error").or_else(|| json_val.get("message")).unwrap_or(&json!("Unknown error"))),
                    "details": json_val
                });
            }
        }
    }

    json!({
        "error": format!("Failed to submit sales order to ArunakiZen ({})", cfg.host_url)
    })
}

pub async fn execute_get_shift_summary(args: &Value) -> Value {
    let cfg = load_pos_config();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client initialization failed: {}", e) }),
    };

    let op = args
        .get("operator")
        .and_then(|v| v.as_str())
        .unwrap_or(&cfg.username);

    let endpoints = [
        format!("{}/api/shift/status?operator={}", cfg.host_url, op),
        format!("{}/shift/status?operator={}", cfg.host_url, op),
    ];

    for ep in &endpoints {
        let mut req = client.get(ep);
        if !cfg.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
        }
        if let Ok(res) = req.send().await {
            if res.status().is_success() {
                if let Ok(json_val) = res.json::<Value>().await {
                    return json_val;
                }
            }
        }
    }

    json!({
        "error": format!("Failed to retrieve cashier shift summary from ArunakiZen ({})", cfg.host_url)
    })
}

pub async fn execute_print_receipt(args: &Value) -> Value {
    let cfg = load_pos_config();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client initialization failed: {}", e) }),
    };

    let invoice = args
        .get("invoice")
        .or_else(|| args.get("faktur"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if invoice.is_empty() {
        return json!({ "error": "Parameter 'invoice' (or 'faktur') is required to print receipt." });
    }

    let open_drawer = args
        .get("open_drawer")
        .or_else(|| args.get("buka_laci"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let cashier = args
        .get("kasir")
        .or_else(|| args.get("operator"))
        .or_else(|| args.get("cashier"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&cfg.username);

    let mut payload = json!({
        "faktur": invoice,
        "kode": invoice,
        "print": true,
        "drawer": open_drawer,
        "printer": args.get("printer").and_then(|v| v.as_str())
    });

    if !cashier.is_empty() {
        payload["kasir"] = json!(cashier);
    }

    let endpoints = [
        format!("{}/api/printer/receipt", cfg.host_url),
        format!("{}/printer/receipt", cfg.host_url),
    ];

    for ep in &endpoints {
        let mut req = client.post(ep);
        if !cfg.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
        }
        if let Ok(res) = req.json(&payload).send().await {
            if res.status().is_success() {
                if let Ok(json_val) = res.json::<Value>().await {
                    return json_val;
                }
            }
        }
    }

    json!({
        "error": format!("Failed to send print receipt command to ArunakiZen printer ({})", cfg.host_url),
        "invoice": invoice
    })
}

pub async fn execute_open_drawer(args: &Value) -> Value {
    let cfg = load_pos_config();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client initialization failed: {}", e) }),
    };

    let payload = json!({
        "printer": args.get("printer").and_then(|v| v.as_str())
    });

    let endpoints = [
        format!("{}/api/printer/drawer", cfg.host_url),
        format!("{}/printer/drawer", cfg.host_url),
    ];

    for ep in &endpoints {
        let mut req = client.post(ep);
        if !cfg.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
        }
        if let Ok(res) = req.json(&payload).send().await {
            if res.status().is_success() {
                if let Ok(json_val) = res.json::<Value>().await {
                    return json_val;
                }
            }
        }
    }

    json!({
        "error": format!("Failed to send cash drawer kick signal to ArunakiZen printer ({})", cfg.host_url)
    })
}

pub async fn execute_adjust_stock(args: &Value) -> Value {
    let cfg = load_pos_config();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client initialization failed: {}", e) }),
    };

    let item_code = args
        .get("item_code")
        .or_else(|| args.get("kode_barang"))
        .or_else(|| args.get("kode"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if item_code.is_empty() {
        return json!({ "error": "Parameter 'item_code' (or 'kode') is required." });
    }

    let actual_stock = args
        .get("actual_stock")
        .or_else(|| args.get("stok"))
        .or_else(|| args.get("stok_kini"))
        .or_else(|| args.get("qty"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    if actual_stock < 0.0 {
        return json!({ "error": "Parameter 'actual_stock' must be >= 0." });
    }

    let location = args
        .get("location")
        .or_else(|| args.get("lokasi"))
        .or_else(|| args.get("lokasistok"))
        .and_then(|v| v.as_str())
        .unwrap_or("toko");

    let reason = args
        .get("reason")
        .or_else(|| args.get("alasan"))
        .or_else(|| args.get("keterangan"))
        .and_then(|v| v.as_str())
        .unwrap_or("Penyesuaian stok via Arunaki Agent");

    let payload = json!({
        "items": [
            {
                "kode": item_code,
                "stok_kini": actual_stock,
                "alasan": reason
            }
        ],
        "lokasistok": location,
        "jenis": "KOREKSI STOK",
        "user": cfg.username,
        "operator": cfg.username,
        "level": "KS"
    });

    let endpoints = [
        format!("{}/api/stock-adjustments", cfg.host_url),
        format!("{}/stock-adjustments", cfg.host_url),
        format!("{}/api/penyesuaian-stok", cfg.host_url),
    ];

    for ep in &endpoints {
        let mut req = client.post(ep);
        if !cfg.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
        }
        if let Ok(res) = req.json(&payload).send().await {
            let status_code = res.status();
            if let Ok(json_val) = res.json::<Value>().await {
                if status_code.is_success() || json_val.get("success") == Some(&json!(true)) {
                    return json_val;
                }
                return json!({
                    "error": format!("ArunakiZen rejected stock adjustment: {}", json_val.get("error").or_else(|| json_val.get("message")).unwrap_or(&json!("Unknown error"))),
                    "details": json_val
                });
            }
        }
    }

    json!({
        "error": format!("Failed to submit stock adjustment to ArunakiZen ({})", cfg.host_url)
    })
}

pub async fn execute_void_sale_order(args: &Value) -> Value {
    let cfg = load_pos_config();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client initialization failed: {}", e) }),
    };

    let invoice = args
        .get("invoice")
        .or_else(|| args.get("faktur"))
        .or_else(|| args.get("nomor_faktur"))
        .or_else(|| args.get("kode"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if invoice.is_empty() {
        return json!({ "error": "Parameter 'invoice' (or 'faktur') is required to void sales order." });
    }

    let reason = args
        .get("reason")
        .or_else(|| args.get("alasan"))
        .or_else(|| args.get("keterangan"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("Pembatalan / revisi transaksi via Arunaki Agent");

    let operator = args
        .get("operator")
        .or_else(|| args.get("kasir"))
        .or_else(|| args.get("user"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&cfg.username);

    let payload = json!({
        "faktur": invoice,
        "alasan": reason,
        "operator": operator
    });

    let endpoints = [
        format!("{}/api/sales/void", cfg.host_url),
        format!("{}/api/penjualan/void", cfg.host_url),
        format!("{}/sales/void", cfg.host_url),
        format!("{}/penjualan/void", cfg.host_url),
    ];

    for ep in &endpoints {
        let mut req = client.post(ep);
        if !cfg.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", cfg.api_key));
        }
        if let Ok(res) = req.json(&payload).send().await {
            let status = res.status();
            if let Ok(json_val) = res.json::<Value>().await {
                if status.is_success() || json_val.get("success") == Some(&json!(true)) {
                    return json_val;
                }
                return json!({
                    "error": format!("ArunakiZen rejected void request: {}", json_val.get("error").or_else(|| json_val.get("message")).unwrap_or(&json!("Unknown error"))),
                    "details": json_val
                });
            }
        }
    }

    json!({
        "error": format!("Failed to send void request to ArunakiZen ({})", cfg.host_url),
        "invoice": invoice
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_levenshtein_distance() {
        assert_eq!(levenshtein_distance("CARLONE", "CAROLINE"), 2);
        assert_eq!(levenshtein_distance("LONGSLEVE", "LONGSLEEVE"), 1);
        assert_eq!(levenshtein_distance("POLO", "POLO"), 0);
        assert_eq!(levenshtein_distance("BLACK", "WHITE"), 5);
    }

    #[test]
    fn test_merge_duplicate_order_items() {
        let raw_items = vec![
            json!({ "kode": "70394", "qty": 1.0, "harga": 86000.0, "diskon": 0.0 }),
            json!({ "kode": "70370", "qty": 1.0, "harga": 86000.0, "diskon": 0.0 }),
            json!({ "kode": "70394", "qty": 1.0, "harga": 86000.0, "diskon": 0.0 }), // duplicate of 70394
            json!({ "kode": "70394", "qty": 1.0, "harga": 70000.0, "diskon": 0.0 }), // different price, should stay separate
        ];

        let mut merged_items: Vec<Value> = Vec::new();
        for it in raw_items {
            let code = it.get("kode").and_then(|v| v.as_str()).unwrap_or("");
            let price = it.get("harga").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let disc = it.get("diskon").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let qty = it.get("qty").and_then(|v| v.as_f64()).unwrap_or(1.0);

            if let Some(existing) = merged_items.iter_mut().find(|m| {
                m.get("kode").and_then(|v| v.as_str()).unwrap_or("") == code
                    && (m.get("harga").and_then(|v| v.as_f64()).unwrap_or(0.0) - price).abs() < 0.01
                    && (m.get("diskon").and_then(|v| v.as_f64()).unwrap_or(0.0) - disc).abs() < 0.01
            }) {
                let cur_qty = existing.get("qty").and_then(|v| v.as_f64()).unwrap_or(0.0);
                existing["qty"] = json!(cur_qty + qty);
            } else {
                merged_items.push(it);
            }
        }

        assert_eq!(merged_items.len(), 3);
        // The first 70394 with price 86000 should now have qty 2.0
        let item_86k = merged_items.iter().find(|m| m["kode"] == "70394" && m["harga"] == 86000.0).unwrap();
        assert_eq!(item_86k["qty"], 2.0);

        // The second 70394 with price 70000 should remain separate with qty 1.0
        let item_70k = merged_items.iter().find(|m| m["kode"] == "70394" && m["harga"] == 70000.0).unwrap();
        assert_eq!(item_70k["qty"], 1.0);
    }

    #[test]
    fn test_batch_search_args_extraction() {
        let batch_args = json!({
            "queries": [
                "KPM POLO BLACK L",
                "KPM POLO MAROON XL",
                "CARLONE XL"
            ]
        });

        let mut queries_list: Vec<String> = Vec::new();
        if let Some(arr) = batch_args.get("queries").and_then(|v| v.as_array()) {
            for it in arr {
                if let Some(s) = it.as_str() {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        queries_list.push(trimmed.to_string());
                    }
                }
            }
        }

        assert_eq!(queries_list.len(), 3);
        assert_eq!(queries_list[0], "KPM POLO BLACK L");
        assert_eq!(queries_list[1], "KPM POLO MAROON XL");
        assert_eq!(queries_list[2], "CARLONE XL");
    }

    #[test]
    fn test_notes_sanitization() {
        // Unsolicited auto-generated notes are sanitized to empty
        assert_eq!(sanitize_transaction_notes("Pesanan KPM POLO dan NSA"), "");
        assert_eq!(sanitize_transaction_notes("Order 6 items baju"), "");
        assert_eq!(sanitize_transaction_notes("Transaksi kasir"), "");
        assert_eq!(sanitize_transaction_notes("none"), "");
        assert_eq!(sanitize_transaction_notes("-"), "");

        // Specific explicit user notes are preserved
        assert_eq!(sanitize_transaction_notes("titip satpam"), "titip satpam");
        assert_eq!(sanitize_transaction_notes("dropship Pak Budi"), "dropship Pak Budi");
        assert_eq!(sanitize_transaction_notes("kirim via JNE YES"), "kirim via JNE YES");
    }

    #[test]
    fn test_void_args_extraction() {
        let args = json!({
            "invoice": "R43-241026007",
            "reason": "Revisi order pelanggan"
        });

        let inv = args
            .get("invoice")
            .or_else(|| args.get("faktur"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let rsn = args
            .get("reason")
            .or_else(|| args.get("alasan"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        assert_eq!(inv, "R43-241026007");
        assert_eq!(rsn, "Revisi order pelanggan");

        // Test fallback to 'faktur'
        let args_id = json!({
            "faktur": "R43-241026009",
            "alasan": "Batal transaksi"
        });
        let inv2 = args_id
            .get("invoice")
            .or_else(|| args_id.get("faktur"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        assert_eq!(inv2, "R43-241026009");
    }
}
