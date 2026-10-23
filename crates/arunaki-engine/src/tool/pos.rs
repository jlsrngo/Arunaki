//! ArunakiZen POS Integration Tools
//!
//! Provides OpenAI-compatible function tools to interact with local ArunakiZen POS engine:
//! - `arunakizen_search_product`: Catalog search by barcode, item code, or name
//! - `arunakizen_create_sale_order`: Atomic cashier retail sales order (R43 invoice)
//! - `arunakizen_get_shift_summary`: Cash register shift drawer turnover and cash balance
//! - `arunakizen_print_receipt`: Thermal receipt printing and optional drawer kick
//! - `arunakizen_open_drawer`: Standalone cash drawer kick pulse
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
            api_key: "arunaki_sec_2026".to_string(),
            username: "Candana".to_string(),
            password: None,
        }
    }
}

pub fn load_pos_config() -> PosConfig {
    let mut cfg = PosConfig::default();

    // 1. Try reading user pos-config.json
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

    // 2. Fallback auto-discovery from ArunakiZen's dynamic pos-runtime.json
    let runtime_candidates = [
        std::path::PathBuf::from("E:/JS/Arunaki-POS/pos-runtime.json"),
        std::path::PathBuf::from("../Arunaki-POS/pos-runtime.json"),
        std::path::PathBuf::from("pos-runtime.json"),
    ];
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

    cfg
}

pub fn pos_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "arunakizen_search_product",
                "description": "Search for products in the ArunakiZen POS catalog by barcode, SKU item code, or product name.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search keyword (product name, item code, or scanned barcode)."
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of items to return (default: 10).",
                            "default": 10
                        }
                    },
                    "required": ["query"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "arunakizen_create_sale_order",
                "description": "Execute a retail cashier sales order (R43 official invoice) in ArunakiZen POS. Automatically adjusts stock inventory, records cash drawer receipts, and returns the assigned receipt number.",
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
                            "description": "Optional additional invoice notes."
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
                "description": "Retrieve current cashier shift summary: opening cash float, total cash turnover, transaction count, and expected cash drawer balance.",
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
                "description": "Print transaction receipt to POS thermal printer (58mm / 80mm paper) and optionally kick open the physical cash drawer.",
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
                "description": "Send ESC/POS kick pulse (1B 70 00 19 FA) to open physical cash drawer without printing a receipt.",
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
    ]
}

pub async fn execute_search_product(args: &Value) -> Value {
    let cfg = load_pos_config();
    let query = args
        .get("query")
        .or_else(|| args.get("q"))
        .or_else(|| args.get("search"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if query.is_empty() {
        return json!({ "error": "Search parameter 'query' is required." });
    }
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("HTTP client initialization failed: {}", e) }),
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
        "error": format!("Failed to search products in ArunakiZen ({}) — ensure POS server is running.", cfg.host_url),
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

    let notes = args
        .get("notes")
        .or_else(|| args.get("catatan"))
        .or_else(|| args.get("keterangan"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let mut raw_items: Vec<Value> = Vec::new();
    if let Some(items_arr) = args.get("items").and_then(|v| v.as_array()) {
        for it in items_arr {
            let code = it
                .get("item_code")
                .or_else(|| it.get("kode_barang"))
                .or_else(|| it.get("kode"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
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

    let payload = json!({
        "pelanggan": customer,
        "pembayaran": payment_method,
        "bayar": amount_paid,
        "keterangan": notes,
        "items": raw_items,
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
                    "error": format!("ArunakiZen POS rejected invoice: {}", json_val.get("error").or_else(|| json_val.get("message")).unwrap_or(&json!("Unknown error"))),
                    "details": json_val
                });
            }
        }
    }

    json!({
        "error": format!("Failed to submit sales order to ArunakiZen POS ({})", cfg.host_url)
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
        .unwrap_or(if !cfg.username.is_empty() { &cfg.username } else { "Candana" });

    let endpoints = [
        format!("{}/api/shift/status?operator={}", cfg.host_url, op),
        format!("{}/shift/status?operator={}", cfg.host_url, op),
        format!("{}/api/shift/status?operator=Candana", cfg.host_url),
        format!("{}/api/shift/status?operator=admin", cfg.host_url),
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
        "error": format!("Failed to retrieve cashier shift summary from ArunakiZen POS ({})", cfg.host_url)
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

    let payload = json!({
        "faktur": invoice,
        "kode": invoice,
        "print": true,
        "drawer": open_drawer,
        "printer": args.get("printer").and_then(|v| v.as_str())
    });

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
            if let Ok(json_val) = res.json::<Value>().await {
                return json_val;
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
            if let Ok(json_val) = res.json::<Value>().await {
                return json_val;
            }
        }
    }

    json!({
        "error": format!("Failed to send cash drawer kick signal to ArunakiZen printer ({})", cfg.host_url)
    })
}
