//! ArunakiZen POS Integration Tools
//!
//! Provides OpenAI-compatible function tools to interact with local ArunakiZen POS engine:
//! - `arunakizen_search_product`: Catalog search by barcode, item code, or name
//! - `arunakizen_create_sale_order`: Atomic cashier retail sales order (R43 invoice)
//! - `arunakizen_get_shift_summary`: Cash register shift drawer turnover and cash balance
//!
//! Conforms to `E:\JS\Arunaki-POS\doc\PANDUAN_KONEKSI_ARUNAKI_AGENT_KE_ARUNAKIZEN.md`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

use crate::paths::arunaki_dot_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PosConfig {
    pub host_url: String,
    pub api_key: String,
    pub username: String,
    pub password: Option<String>,
}

impl Default for PosConfig {
    fn default() -> Self {
        Self {
            host_url: "http://127.0.0.1:5000".to_string(),
            api_key: String::new(),
            username: String::new(),
            password: None,
        }
    }
}

pub fn load_pos_config() -> PosConfig {
    let p = arunaki_dot_dir().join("pos-config.json");
    if let Ok(raw) = std::fs::read_to_string(&p) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            let host_url = val
                .get("hostUrl")
                .or_else(|| val.get("host_url"))
                .and_then(|v| v.as_str())
                .unwrap_or("http://127.0.0.1:5000")
                .trim_end_matches('/')
                .to_string();
            let api_key = val
                .get("apiKey")
                .or_else(|| val.get("api_key"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let username = val
                .get("username")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let password = val
                .get("password")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            return PosConfig {
                host_url,
                api_key,
                username,
                password,
            };
        }
    }
    PosConfig::default()
}

pub fn pos_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "arunakizen_search_product",
            "description": "Mencari data produk barang di ArunakiZen berdasarkan barcode, kode barang, atau nama produk.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Kata kunci pencarian (nama barang, kode, atau scan barcode)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Jumlah maksimal barang yang ditampilkan (default: 10)",
                        "default": 10
                    }
                },
                "required": ["query"]
            }
        }),
        json!({
            "name": "arunakizen_create_sale_order",
            "description": "Mengeksekusi transaksi kasir penjualan ritel (faktur R43) di ArunakiZen. Otomatis memotong stok, mencatat kas masuk, dan menghasilkan nomor nota resmi.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pelanggan": {
                        "type": "string",
                        "description": "Kode pelanggan/member (gunakan 'UMUM' jika pembeli reguler/non-member)",
                        "default": "UMUM"
                    },
                    "pembayaran": {
                        "type": "string",
                        "enum": ["CASH", "TRANSFER", "QRIS", "PIUTANG"],
                        "description": "Metode pembayaran yang dipilih pembeli",
                        "default": "CASH"
                    },
                    "jumlah_bayar": {
                        "type": "number",
                        "description": "Nominal uang yang diserahkan/dibayarkan pembeli"
                    },
                    "items": {
                        "type": "array",
                        "description": "Daftar barang yang dibeli",
                        "items": {
                            "type": "object",
                            "properties": {
                                "kode_barang": { "type": "string", "description": "Kode unik barang" },
                                "qty": { "type": "number", "description": "Kuantitas barang" },
                                "harga": { "type": "number", "description": "Harga satuan jual" },
                                "diskon_persen": { "type": "number", "description": "Diskon item (%)", "default": 0 }
                            },
                            "required": ["kode_barang", "qty", "harga"]
                        }
                    },
                    "catatan": {
                        "type": "string",
                        "description": "Catatan faktur tambahan (opsional)"
                    }
                },
                "required": ["pembayaran", "jumlah_bayar", "items"]
            }
        }),
        json!({
            "name": "arunakizen_get_shift_summary",
            "description": "Mendapatkan ringkasan kasir shift berjalan: kas modal awal, total omset tunai, jumlah transaksi, dan saldo kas seharusnya di laci kasir.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }),
    ]
}

pub async fn execute_search_product(args: &Value) -> Value {
    let cfg = load_pos_config();
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if query.is_empty() {
        return json!({ "error": "Parameter 'query' wajib diisi" });
    }
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client init failed: {}", e) }),
    };

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
                    return json_val;
                }
            }
        }
    }

    json!({
        "error": format!("Gagal mencari produk di ArunakiZen ({}) — pastikan server kasir aktif", cfg.host_url),
        "query": query
    })
}

pub async fn execute_create_sale_order(args: &Value) -> Value {
    let cfg = load_pos_config();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client init failed: {}", e) }),
    };

    let mut payload = args.clone();
    if let Some(obj) = payload.as_object_mut() {
        obj.insert(
            "operator".to_string(),
            json!({
                "username": cfg.username,
                "password": cfg.password.unwrap_or_default(),
                "api_key": cfg.api_key
            }),
        );
    }

    let endpoints = [
        format!("{}/api/orders", cfg.host_url),
        format!("{}/orders", cfg.host_url),
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
                    "error": format!("ArunakiZen menolak faktur: {}", json_val.get("error").or_else(|| json_val.get("message")).unwrap_or(&json!("Unknown error"))),
                    "details": json_val
                });
            }
        }
    }

    json!({
        "error": format!("Gagal mengirim transaksi penjualan ke ArunakiZen ({})", cfg.host_url)
    })
}

pub async fn execute_get_shift_summary(_args: &Value) -> Value {
    let cfg = load_pos_config();
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client init failed: {}", e) }),
    };

    let endpoints = [
        format!("{}/api/shift/status", cfg.host_url),
        format!("{}/shift/status", cfg.host_url),
        format!("{}/api/kas/shift", cfg.host_url),
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
        "error": format!("Gagal mendapatkan ringkasan shift kasir dari ArunakiZen ({})", cfg.host_url)
    })
}
