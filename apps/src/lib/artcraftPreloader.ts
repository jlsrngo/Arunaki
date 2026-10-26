/**
 * ArtCraft Document Suite Startup Preloader & Warm Cache Engine
 *
 * Pre-fetches, caches, and warms ArtCraft Pure-Rust WebAssembly runtimes
 * (GridCraft, WordCraft, PdfCraft, DeckCraft) directly at Arunaki startup
 * so that opening and switching document tabs is instant with zero loading lag.
 */

const CACHE_NAME = "artcraft-wasm-cache-v1";

const ARTCRAFT_RESOURCES = [
  // GridCraft (.xlsx, .csv)
  "/artcraft/gridcraft/index.html",
  "/artcraft/gridcraft/gridcraft-web-f3f8c58ab634d6ba.js",
  "/artcraft/gridcraft/gridcraft-web-f3f8c58ab634d6ba_bg.wasm",
  // WordCraft (.docx, reports)
  "/artcraft/wordcraft/index.html",
  "/artcraft/wordcraft/wordcraft-web-9e321acdac2ac7dc.js",
  "/artcraft/wordcraft/wordcraft-web-9e321acdac2ac7dc_bg.wasm",
  // PdfCraft (.pdf)
  "/artcraft/pdfcraft/index.html",
  "/artcraft/pdfcraft/pdfcraft-web-81b252c29472c32d.js",
  "/artcraft/pdfcraft/pdfcraft-web-81b252c29472c32d_bg.wasm",
  // DeckCraft (.pptx)
  "/artcraft/deckcraft/index.html",
  "/artcraft/deckcraft/deckcraft-web-fab210fd8f1d65cb.js",
  "/artcraft/deckcraft/deckcraft-web-fab210fd8f1d65cb_bg.wasm",
];

let preloaded = false;

export function initArtCraftPreloader() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;

  // Use requestIdleCallback or brief timeout so initial UI render finishes first
  const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 600));

  scheduleIdle(async () => {
    try {
      // 1. Preload via CacheStorage API if available
      if ("caches" in window) {
        const cache = await caches.open(CACHE_NAME);
        for (const url of ARTCRAFT_RESOURCES) {
          const match = await cache.match(url);
          if (!match) {
            fetch(url, { cache: "force-cache" })
              .then((res) => {
                if (res.ok) {
                  cache.put(url, res.clone());
                }
              })
              .catch(() => {});
          }
        }
      } else {
        // Fallback: standard force-cache fetch
        for (const url of ARTCRAFT_RESOURCES) {
          fetch(url, { cache: "force-cache" }).catch(() => {});
        }
      }

      // 2. Pre-warm GridCraft background iframe to compile WASM in V8 JIT code cache
      warmGridCraftInstance();
    } catch (err) {
      console.warn("[ArtCraft Preloader] Background cache warning:", err);
    }
  });
}

function warmGridCraftInstance() {
  if (typeof document === "undefined") return;
  const WARM_CONTAINER_ID = "artcraft-warm-preloader";
  if (document.getElementById(WARM_CONTAINER_ID)) return;

  const container = document.createElement("div");
  container.id = WARM_CONTAINER_ID;
  container.style.position = "absolute";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.overflow = "hidden";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
  container.style.top = "-9999px";
  container.style.left = "-9999px";

  const warmIframe = document.createElement("iframe");
  warmIframe.src = "/artcraft/gridcraft/index.html?warm=1";
  warmIframe.tabIndex = -1;
  warmIframe.setAttribute("aria-hidden", "true");

  container.appendChild(warmIframe);
  document.body.appendChild(container);
}
