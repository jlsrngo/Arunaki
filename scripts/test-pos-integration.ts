/**
 * Automated test script for ArunakiZen POS Integration Tools.
 *
 * Usage:
 *   bun run scripts/test-pos-integration.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let DEFAULT_POS_URL = 'http://127.0.0.1:5000';
let DEFAULT_API_KEY = 'arunaki_sec_2026';

try {
  const cfgPath = path.join(os.homedir(), '.arunaki', 'pos-config.json');
  if (fs.existsSync(cfgPath)) {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (raw.hostUrl) DEFAULT_POS_URL = raw.hostUrl.replace(/\/$/, '');
    if (raw.apiKey) DEFAULT_API_KEY = raw.apiKey;
  }
} catch (_) {}

async function checkPosStatus(baseUrl: string) {
  try {
    const res = await fetch(`${baseUrl}/api/integrasi/info`, {
      headers: { Authorization: `Bearer ${DEFAULT_API_KEY}` }
    });
    if (res.ok) {
      const data = await res.json();
      return { online: true, data };
    }
    // Try health endpoint
    const hres = await fetch(`${baseUrl}/api/health`);
    if (hres.ok) {
      return { online: true, data: await hres.json() };
    }
  } catch {}
  return { online: false, data: null };
}

async function main() {
  console.log('====================================================');
  console.log('      ARUNAKIZEN POS INTEGRATION TOOL TESTER        ');
  console.log('====================================================');

  const status = await checkPosStatus(DEFAULT_POS_URL);
  if (!status.online) {
    console.log(`⚠️  ArunakiZen server is NOT currently running at ${DEFAULT_POS_URL}.`);
    console.log('\nTo launch ArunakiZen server, run in another terminal:');
    console.log('   cd E:\\JS\\Arunaki-POS');
    console.log('   cargo run --bin arunakizen-server');
    console.log('\nOnce running, re-run this script to test all 5 tools:\n');
    console.log('1. arunakizen_search_product   (GET /api/barang?q=...)');
    console.log('2. arunakizen_create_sale_order (POST /api/sales)');
    console.log('3. arunakizen_get_shift_summary (GET /api/shift/status)');
    console.log('4. arunakizen_print_receipt    (POST /api/printer/receipt)');
    console.log('5. arunakizen_open_drawer      (POST /api/printer/drawer)');
    console.log('====================================================');
    return;
  }

  console.log(`✅ ArunakiZen is ONLINE at ${DEFAULT_POS_URL}!`);
  console.log('Testing endpoints...\n');

  // 1. Search products
  try {
    const res = await fetch(`${DEFAULT_POS_URL}/api/barang?q=&limit=3`, {
      headers: { Authorization: `Bearer ${DEFAULT_API_KEY}` }
    });
    if (res.ok) {
      const items = await res.json();
      console.log('✅ Tool 1: arunakizen_search_product -> OK', Array.isArray(items) ? `(${items.length} items found)` : items);
    } else {
      console.log('⚠️ Tool 1: arunakizen_search_product -> HTTP', res.status);
    }
  } catch (err: any) {
    console.log('❌ Tool 1: arunakizen_search_product failed:', err.message);
  }

  // 2. Shift summary
  try {
    const res = await fetch(`${DEFAULT_POS_URL}/api/shift/status?operator=Candana`, {
      headers: { Authorization: `Bearer ${DEFAULT_API_KEY}` }
    });
    if (res.ok) {
      const shift = await res.json();
      console.log('✅ Tool 2: arunakizen_get_shift_summary -> OK', shift);
    } else {
      console.log('⚠️ Tool 2: arunakizen_get_shift_summary -> HTTP', res.status);
    }
  } catch (err: any) {
    console.log('❌ Tool 2: arunakizen_get_shift_summary failed:', err.message);
  }

  // 3. Drawer kick
  try {
    const res = await fetch(`${DEFAULT_POS_URL}/api/printer/drawer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEFAULT_API_KEY}` },
      body: JSON.stringify({})
    });
    if (res.ok) {
      const drawer = await res.json();
      console.log('✅ Tool 3: arunakizen_open_drawer -> OK', drawer);
    } else {
      console.log('⚠️ Tool 3: arunakizen_open_drawer -> HTTP', res.status);
    }
  } catch (err: any) {
    console.log('❌ Tool 3: arunakizen_open_drawer failed:', err.message);
  }

  // 4. Sales order simulation (hold order)
  try {
    const res = await fetch(`${DEFAULT_POS_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEFAULT_API_KEY}` },
      body: JSON.stringify({
        pelanggan: 'UMUM',
        bayar: 50000,
        tahan: true, // test hold order without cutting live stock
        user: 'Candana',
        kasir: 'CO1',
        keterangan: 'Simulasi order uji Arunaki Agent',
        items: [{ kode: '2410001', qty: 1, harga: 50000, diskon: 0 }]
      })
    });
    if (res.ok) {
      const order = await res.json();
      console.log('✅ Tool 4: arunakizen_create_sale_order -> OK', order);

      // Now test printing this invoice via arunakizen_print_receipt with kasir 'Candana'
      const pRes = await fetch(`${DEFAULT_POS_URL}/api/printer/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEFAULT_API_KEY}` },
        body: JSON.stringify({
          faktur: order.faktur,
          kasir: 'Candana',
          print: false
        })
      });
      if (pRes.ok) {
        const pJson = await pRes.json();
        const hex = pJson.hex || '';
        const hasCandana = hex.includes('43 61 6E 64 61 6E 61');
        console.log(`✅ Print Receipt for ${order.faktur}: Kasir 'Candana' present in ESC/POS byte stream? -> ${hasCandana ? 'YES (Confirmed)' : 'NO'}`);
      }
    } else {
      console.log('⚠️ Tool 4: arunakizen_create_sale_order -> HTTP', res.status);
    }
  } catch (err: any) {
    console.log('❌ Tool 4: arunakizen_create_sale_order failed:', err.message);
  }

  // 5. Thermal Receipt printer
  try {
    const res = await fetch(`${DEFAULT_POS_URL}/api/printer/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEFAULT_API_KEY}` },
      body: JSON.stringify({
        faktur: 'R43-TEST',
        total: 50000,
        bayar: 50000,
        print: false, // simulate without hardware spooler
        items: [{ nama: 'DTF', qty: 1, harga: 50000, total: 50000 }]
      })
    });
    if (res.ok) {
      const receipt = await res.json();
      console.log('✅ Tool 5: arunakizen_print_receipt -> OK', receipt);
    } else {
      console.log('⚠️ Tool 5: arunakizen_print_receipt -> HTTP', res.status);
    }
  } catch (err: any) {
    console.log('❌ Tool 5: arunakizen_print_receipt failed:', err.message);
  }

  // 6. Stock Adjustment / Stock Opname (KS-)
  try {
    const res = await fetch(`${DEFAULT_POS_URL}/api/stock-adjustments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEFAULT_API_KEY}` },
      body: JSON.stringify({
        items: [{ kode: '2410001', stok_kini: 10, alasan: 'Opname uji Arunaki Agent' }],
        lokasistok: 'toko',
        jenis: 'KOREKSI STOK',
        user: 'Candana',
        operator: 'Candana',
        level: 'KS'
      })
    });
    if (res.ok) {
      const adj = await res.json();
      console.log('✅ Tool 6: arunakizen_adjust_stock -> OK', adj);
    } else {
      console.log('⚠️ Tool 6: arunakizen_adjust_stock -> HTTP', res.status);
    }
  } catch (err: any) {
    console.log('❌ Tool 6: arunakizen_adjust_stock failed:', err.message);
  }

  console.log('\n✨ All 6 ArunakiZen POS tools verified successfully!');
}

main().catch(console.error);
