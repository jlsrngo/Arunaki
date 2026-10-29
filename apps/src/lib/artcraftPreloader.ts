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

/**
 * Installs a comprehensive Native Desktop Browser-Behavior Disabler on a Window object
 * (both the main Tauri WebView2 window and any same-origin ArtCraft WASM iframes).
 *
 * Completely disables all default browser menus, Print dialogs (Ctrl+P / Ctrl+Shift+P / window.print),
 * browser Find bars (Ctrl+F / F3 / Ctrl+G), browser Reload (F5 / Ctrl+R), DevTools / View Source (F12 / Ctrl+U),
 * History / Downloads / Bookmarks / New Window (Ctrl+H / Ctrl+J / Ctrl+D / Ctrl+T / Ctrl+N / Ctrl+W),
 * Caret Browsing / Help (F1 / F7), Mouse X1/X2 Back/Forward navigation, Ctrl+Wheel zoom, and file-drop navigation.
 */
export function disableDefaultWebBehaviors(targetWindow: Window, isChildIframe = false) {
  if (!targetWindow) return;
  try {
    // 1. Disable native right-click browser context menu
    targetWindow.addEventListener(
      "contextmenu",
      (e) => {
        e.preventDefault();
      },
      { capture: true }
    );

    // 2. Override window.print() and window.find()
    targetWindow.print = () => {
      window.top?.dispatchEvent(new CustomEvent("arunaki-quick-open-file"));
    };
    try {
      (targetWindow as any).find = () => false;
    } catch {}

    // 3. Intercept and block all browser-native keyboard shortcuts in capture phase
    targetWindow.addEventListener(
      "keydown",
      (e) => {
        const key = e.key.toLowerCase();
        const isMod = e.ctrlKey || e.metaKey;

        // Ctrl+P / Ctrl+Shift+P -> Never open browser Print; open Arunaki Quick Open instead
        if (isMod && key === "p") {
          e.preventDefault();
          if (isChildIframe) {
            e.stopPropagation();
            window.top?.dispatchEvent(new CustomEvent("arunaki-quick-open-file"));
          }
          return;
        }

        // Ctrl+Shift+F -> Never trigger browser find/sidebar; open Arunaki Workspace Search
        if (isMod && e.shiftKey && key === "f") {
          e.preventDefault();
          if (isChildIframe) {
            e.stopPropagation();
            window.top?.dispatchEvent(new CustomEvent("arunaki-workspace-search"));
          }
          return;
        }

        // Escape inside child iframe -> forward to top window to close any open menus/modals
        if (isChildIframe && e.key === "Escape") {
          window.top?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        }

        // Block Function Keys that trigger browser UI:
        // F1 (Edge Help), F3 (Browser Find Next), F5 (Reload), F6 (Address bar focus), F7 (Caret Browsing), F10 (Menu bar), F12 (DevTools)
        if (
          e.key === "F1" ||
          e.key === "F3" ||
          e.key === "F5" ||
          e.key === "F6" ||
          e.key === "F7" ||
          e.key === "F10" ||
          e.key === "F12"
        ) {
          e.preventDefault();
          return;
        }

        // Block Dedicated Browser Multimedia/Navigation Keys
        if (
          e.key === "BrowserBack" ||
          e.key === "BrowserForward" ||
          e.key === "BrowserRefresh" ||
          e.key === "BrowserStop" ||
          e.key === "BrowserSearch" ||
          e.key === "BrowserFavorites" ||
          e.key === "BrowserHome"
        ) {
          e.preventDefault();
          return;
        }

        // Alt+Left / Alt+Right / Alt+Home / Alt+D (Browser History Back/Forward/Home/Address Bar)
        if (
          e.altKey &&
          !isMod &&
          (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || key === "d")
        ) {
          e.preventDefault();
          return;
        }

        // Block Ctrl/Cmd Browser Shortcuts:
        // Ctrl+R (Reload), Ctrl+G (Find next), Ctrl+F (Browser Find bar), Ctrl+H (History),
        // Ctrl+J (Downloads), Ctrl+D (Bookmark), Ctrl+U (View Source), Ctrl+T (New Tab),
        // Ctrl+N (New Window), Ctrl+W (Close Window), Ctrl+L (Address bar), Ctrl+K / Ctrl+E (Search bar),
        // Ctrl+M (Mute tab), Ctrl+Shift+I / J / C (DevTools), Ctrl+Shift+O (Favorites),
        // Ctrl+Shift+U (Read Aloud), Ctrl+Shift+Y (Collections), Ctrl+Shift+E (Sidebar)
        if (isMod) {
          const blockedCtrlKeys = new Set([
            "r",
            "g",
            "f",
            "h",
            "j",
            "d",
            "u",
            "t",
            "n",
            "w",
            "l",
            "k",
            "e",
            "m",
            "o",
            "y",
          ]);
          if (blockedCtrlKeys.has(key)) {
            e.preventDefault();
            return;
          }
          if (e.shiftKey && (key === "i" || key === "c" || key === "delete")) {
            e.preventDefault();
            return;
          }
        }
      },
      { capture: true }
    );

    // 4. Disable Mouse Back/Forward buttons (button 3 & 4) and middle-click link navigation
    const blockBrowserMouseButtons = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      } else if (e.button === 1) {
        const target = e.target as HTMLElement | null;
        if (target && target.closest?.("a")) {
          e.preventDefault();
        }
      }
    };
    targetWindow.addEventListener("mousedown", blockBrowserMouseButtons, { capture: true });
    targetWindow.addEventListener("mouseup", blockBrowserMouseButtons, { capture: true });
    targetWindow.addEventListener("auxclick", blockBrowserMouseButtons, { capture: true });

    // 5. Disable Ctrl + Mouse Wheel browser zoom on the main shell
    if (!isChildIframe) {
      targetWindow.addEventListener(
        "wheel",
        (e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
          }
        },
        { capture: true, passive: false }
      );
    }

    // 6. Disable native browser ghost dragging of images & anchor links
    targetWindow.addEventListener(
      "dragstart",
      (e) => {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "IMG" || target.tagName === "A") &&
          target.getAttribute("draggable") !== "true"
        ) {
          e.preventDefault();
        }
      },
      { capture: true }
    );

    // 7. Prevent dropping external files onto the window from navigating the WebView away
    targetWindow.addEventListener("dragover", (e) => e.preventDefault(), { capture: false });
    targetWindow.addEventListener("drop", (e) => e.preventDefault(), { capture: false });
  } catch {}
}

export function bindArtCraftIframeGuards(iframe: HTMLIFrameElement | null) {
  if (!iframe || !iframe.contentWindow) return;
  disableDefaultWebBehaviors(iframe.contentWindow, true);
}
