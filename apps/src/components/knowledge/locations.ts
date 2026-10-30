/**
 * Lightweight hybrid location catalog & autocomplete powered by Rust `engine::knowledge::locations`.
 *
 * 1. Instant zero-latency local catalog covering all 38 Indonesian provinces, major Indonesian
 *    cities/regencies, and major global business hubs.
 * 2. Native Rust hybrid lookup (`GET /api/knowledge/locations?q=...&limit=...`) that ranks
 *    prefix matches first and queries Open-Meteo Geocoding API in Rust when needed.
 */

import { apiFetch } from "../../lib/api";

export const LOCAL_LOCATIONS: readonly string[] = [
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

/**
 * Fast synchronous filter against the built-in province & city list.
 * Prefix matches are ranked first, followed by substring matches.
 */
export function filterLocalLocations(query: string, limit = 7): string[] {
  const clean = query.trim().toLowerCase();
  if (clean.length < 2) return [];

  const prefixMatches: string[] = [];
  const substringMatches: string[] = [];

  for (const loc of LOCAL_LOCATIONS) {
    const lower = loc.toLowerCase();
    if (lower.startsWith(clean)) {
      prefixMatches.push(loc);
      if (prefixMatches.length >= limit) break;
    } else if (lower.includes(clean)) {
      substringMatches.push(loc);
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit);
}

/**
 * Queries the native Rust `engine::knowledge::locations` endpoint (`GET /api/knowledge/locations`)
 * which performs prefix + substring ranking and Open-Meteo Geocoding fallback in Rust.
 */
export async function searchRemoteLocations(
  query: string,
  limit = 7,
  signal?: AbortSignal
): Promise<string[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];

  try {
    const res = await apiFetch(
      `/api/knowledge/locations?q=${encodeURIComponent(clean)}&limit=${limit}`,
      { signal }
    );
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data) && json.data.length > 0) {
        return json.data;
      }
    }
  } catch {
    // Fallback to local filter when offline or aborted
  }

  return filterLocalLocations(clean, limit);
}
