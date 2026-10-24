# Design — Arunaki

A locked design system for Arunaki AI Assistant & Workspace Agent.
Every page redesign reads this file before emitting code.

## Genre
atmospheric — dark-first, generative AI tool, code-focused workspace

## Macrostructure family
- App pages: Hybrid Chat + Content Studio (Sidebar + main content area)
  - ChatPage: single-view chat interface
  - WorkspacePage: grid listing
  - WorkspaceDetailPage: triple-panel (Sources + Chat + Studio)
  - SettingsPage: tabbed sidebar + content
  - HistoryPage: timeline list

## Theme — Studio
- `--color-paper`      oklch(14% 0.01 260)
- `--color-paper-2`    oklch(18% 0.012 260)
- `--color-paper-3`    oklch(22% 0.015 260)
- `--color-ink`        oklch(95% 0.005 260)
- `--color-ink-2`      oklch(75% 0.01 260)
- `--color-ink-muted`  oklch(55% 0.01 260)
- `--color-rule`       oklch(25% 0.012 260)
- `--color-accent`     oklch(62% 0.19 155)
- `--color-accent-dim` oklch(50% 0.12 155)
- `--color-focus`      oklch(65% 0.17 260)
- `--color-primary`    oklch(62% 0.19 260)
- `--color-primary-dim` oklch(50% 0.12 260)

## Typography
- Display: Inter, weight 600, style normal
- Body:    Inter, weight 400
- Mono:    JetBrains Mono, weight 400
- Display tracking: -0.02em
- Body tracking: 0
- Type scale: 14px base, 13px small, 12px caption

## Spacing
4-point named scale:
- `--space-2xs`: 0.25rem (4px)
- `--space-xs`:  0.5rem (8px)
- `--space-sm`:  0.75rem (12px)
- `--space-md`:  1rem (16px)
- `--space-lg`:  1.5rem (24px)
- `--space-xl`:  2rem (32px)
- `--space-2xl`: 3rem (48px)

## Motion
- Easings: cubic-bezier(0.16, 1, 0.3, 1) — `--ease-out`
- Reveal: fade only, no slide
- Durations: 150ms (short), 200ms (medium)
- Reduced-motion: opacity-only, ≤ 150ms

## Microinteractions stance
- Silent success — no celebratory toasts
- Hover delay: 0ms
- Focus delay: 0ms
- Button press: scale(0.98) at 100ms

## CTA voice
- Primary: filled, bg accent, radius 8px, 12px 20px padding
- Secondary: outline, 1px rule, radius 8px, 10px 18px padding

## Per-page allowances
- App pages MUST NOT use enrichment — function carries the page
- All surfaces dark, no white backgrounds
- Sidebar always dark (paper-2 or darker)

## What pages MUST share
- The wordmark / logotype (Sparkles icon + "Arunaki")
- The accent colour (green ~155° hue, ≤ 5% per viewport)
- The display + body fonts (Inter pair)
- The CTA voice (button shape, border-radius, padding rhythm)
- Dark surfaces everywhere, no white (#fff)

## What pages MAY differ on
- Layout structure within the Hybrid Chat + Studio family
- Panel count (single, dual, triple)
- Content density

## Exports

### tokens.css
```css
:root {
  --color-paper:      oklch(14% 0.01 260);
  --color-paper-2:    oklch(18% 0.012 260);
  --color-paper-3:    oklch(22% 0.015 260);
  --color-ink:        oklch(95% 0.005 260);
  --color-ink-2:      oklch(75% 0.01 260);
  --color-ink-muted:  oklch(55% 0.01 260);
  --color-rule:       oklch(25% 0.012 260);
  --color-accent:     oklch(62% 0.19 155);
  --color-accent-dim: oklch(50% 0.12 155);
  --color-focus:      oklch(65% 0.17 260);
  --color-primary:    oklch(62% 0.19 260);
  --color-primary-dim: oklch(50% 0.12 260);

  --font-display: "Inter", system-ui, sans-serif;
  --font-body:    "Inter", system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;

  --space-2xs: 0.25rem; --space-xs: 0.5rem; --space-sm: 0.75rem;
  --space-md:  1rem;    --space-lg: 1.5rem; --space-xl: 2rem;
  --space-2xl: 3rem;

  --text-xs: 0.75rem; --text-sm: 0.8125rem; --text-base: 0.875rem;
  --text-lg: 1rem;    --text-xl: 1.25rem;   --text-2xl: 1.5rem;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-short: 150ms;
  --dur-medium: 200ms;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
}
```

### Tailwind v4 @theme
```css
@theme {
  --color-paper:   oklch(14% 0.01 260);
  --color-paper-2: oklch(18% 0.012 260);
  --color-paper-3: oklch(22% 0.015 260);
  --color-ink:     oklch(95% 0.005 260);
  --color-ink-2:   oklch(75% 0.01 260);
  --color-ink-muted: oklch(55% 0.01 260);
  --color-rule:    oklch(25% 0.012 260);
  --color-accent:  oklch(62% 0.19 155);
  --color-accent-dim: oklch(50% 0.12 155);
  --color-focus:   oklch(65% 0.17 260);
  --color-primary: oklch(62% 0.19 260);
  --color-primary-dim: oklch(50% 0.12 260);
  --font-display:  "Inter", system-ui, sans-serif;
  --font-body:     "Inter", system-ui, sans-serif;
  --font-mono:     "JetBrains Mono", ui-monospace, monospace;
  --spacing-md:    1rem;
  --text-base:     0.875rem;
  --ease-out:      cubic-bezier(0.16, 1, 0.3, 1);
}
```
