# Dev Log — Top Menu Bar & Dropdowns Clean Decomposition

**Date & Time:** 2026-10-15 09:12:00 WIB  
**Author:** Antigravity (Advanced Agentic AI)

## What
Mendekomposisi dan merefaktor seluruh sistem **Menu Bar Atas** (`TopMenuBar.tsx`, `FileMenu.tsx`, `EditMenu.tsx`, `ViewMenu.tsx`, `HelpMenu.tsx`) menjadi arsitektur modular yang ramping dan bersih. Mengeliminasi duplikasi kode eksekusi shortcut keyboard dan `document.execCommand`, mengekstrak command bus terpusat `useAppCommands`, global shortcut listener `useGlobalShortcuts`, komponen atomik `MenuItem`/`MenuSeparator`, serta sub-menu mandiri `ThemeSubmenu` dan `LanguageSubmenu`.

## Files Created & Changed
- `apps/web/src/components/layout/menu/hooks/useAppCommands.ts` — Command bus terpusat untuk semua operasi (Undo, Redo, Cut, Copy, Paste, Select All, Save, New Session, Search, Toggle Explorer/Chat/WordWrap, Fullscreen, Reset Zoom, Backup, Exit, Settings, Knowledge).
- `apps/web/src/components/layout/menu/hooks/useGlobalShortcuts.ts` — Hook listener keyboard `window` global yang mengeksekusi aksi dari `useAppCommands`.
- `apps/web/src/components/layout/menu/items/MenuItem.tsx` — Komponen atomik menu button dengan dukungan ikon, label, shortcut badge, checkmark aktif, dan a11y.
- `apps/web/src/components/layout/menu/items/MenuSeparator.tsx` — Komponen atomik pembatas menu.
- `apps/web/src/components/layout/menu/submenus/ThemeSubmenu.tsx` — Sub-menu khusus pemilihan tema (Light / Dark / System Theme).
- `apps/web/src/components/layout/menu/submenus/LanguageSubmenu.tsx` — Sub-menu khusus pemilihan bahasa (English / Bahasa Indonesia).
- `apps/web/src/components/layout/menu/FileMenu.tsx` — Direfaktor menjadi deklaratif murni (turun dari 227 baris ke 125 baris).
- `apps/web/src/components/layout/menu/EditMenu.tsx` — Direfaktor menjadi deklaratif murni tanpa duplikasi clipboard/execCommand (turun dari 253 baris ke 130 baris).
- `apps/web/src/components/layout/menu/ViewMenu.tsx` — Direfaktor dengan submenus terpisah (turun dari 276 baris ke 125 baris).
- `apps/web/src/components/layout/menu/HelpMenu.tsx` — Direfaktor menjadi deklaratif murni (turun dari 160 baris ke 110 baris).
- `apps/web/src/components/layout/TopMenuBar.tsx` — Direfaktor menjadi orchestrator murni 130 baris tanpa event listener raksasa (turun dari 209 baris).
- `apps/web/src/components/layout/menu/shortcutsConfig.test.ts` — Unit test suite untuk normalisasi shortcut dan mock event matcher.
- `apps/web/src/components/layout/menu/index.ts` — Re-export bersih sub-komponen layout menu.
- `WORKFLOW.md` — Mencatat penyelesaian Phase 114.

## Tests Run
1. `npm run build -w apps/web` — ✅ 0 TypeScript errors (Vite production bundle dibangun dalam 20s, bundle size turun ke 1.34 MB).
2. `npx vitest run --reporter=verbose` — ✅ 27 tests passed across 4 test suites (`shortcutsConfig`, `types.test.ts`, `attachmentUtils`, `panels`).

## Notes
- Tidak ada regresi fungsional: seluruh 25+ shortcut keyboard (Undo/Redo, Cut/Copy/Paste, Save, Fullscreen F11, Reset Zoom Ctrl+0, Toggle Explorer Ctrl+B, Toggle Chat Ctrl+J, Toggle Word Wrap Alt+Z, New Session Ctrl+N), menu klik, dialog konfirmasi, dan pergantian tema/bahasa bekerja 100% seperti semula.
