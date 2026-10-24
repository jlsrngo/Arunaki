/**
 * Lightweight hybrid location catalog & autocomplete (replaces the 8.7 MB `country-state-city` package).
 *
 * 1. Instant zero-latency local catalog covering all 38 Indonesian provinces, major Indonesian
 *    cities/regencies, and major global business hubs (~4 KB vs 8,716 KB).
 * 2. On-demand fallback to Open-Meteo Geocoding API (free, no API key required) when the user
 *    types a location with fewer than 5 local matches.
 */

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
  "Jambi",
  "Bengkulu",
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
 * Hybrid search: returns local matches immediately, and if fewer than `limit` matches are found,
 * queries Open-Meteo Geocoding API (free, keyless) for worldwide cities/provinces.
 */
export async function searchRemoteLocations(
  query: string,
  limit = 7,
  signal?: AbortSignal
): Promise<string[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];

  const local = filterLocalLocations(clean, limit);
  if (local.length >= limit) return local;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return local;
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      clean
    )}&count=${limit}&language=id&format=json`;
    const res = await fetch(url, { signal });
    if (!res.ok) return local;

    const data = await res.json();
    const results: Array<{ name?: string; admin1?: string; country?: string }> =
      data?.results || [];

    const merged = [...local];
    const seen = new Set(local.map((item) => item.toLowerCase()));

    for (const item of results) {
      if (!item?.name) continue;
      const label =
        item.admin1 && item.admin1.toLowerCase() !== item.name.toLowerCase()
          ? `${item.name}, ${item.admin1}`
          : item.name;
      const key = label.toLowerCase();
      if (!seen.has(key) && !seen.has(item.name.toLowerCase())) {
        seen.add(key);
        merged.push(label);
        if (merged.length >= limit) break;
      }
    }

    return merged;
  } catch {
    return local;
  }
}
