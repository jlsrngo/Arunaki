/**
 * Menu keyboard and screen-reader support, shared by every top-level menu.
 *
 * The menus were built from plain buttons in a plain div: no role, no aria, no arrow keys. A menu
 * is the place a user goes looking for a command they cannot see a button for, so it is the one
 * place that most needs to be reachable without a mouse. Escape already worked - TopMenuBar
 * listens for it globally - so only within-menu movement is handled here.
 */

const ITEMS = '[role="menuitem"]:not([disabled])'

export function menuTriggerProps(isOpen: boolean) {
  return {
    "aria-haspopup": "menu" as const,
    "aria-expanded": isOpen,
  }
}

export function menuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"]
  if (!keys.includes(event.key)) return

  const container = event.currentTarget
  const items = Array.from(container.querySelectorAll<HTMLElement>(ITEMS))
  if (items.length === 0) return

  event.preventDefault()
  const current = items.indexOf(document.activeElement as HTMLElement)

  if (event.key === "Home") {
    items[0]?.focus()
    return
  }
  if (event.key === "End") {
    items[items.length - 1]?.focus()
    return
  }

  const delta = event.key === "ArrowDown" ? 1 : -1
  // Wraps, and starts at the far end when focus was not inside the menu yet.
  const next = current < 0 ? (delta === 1 ? 0 : items.length - 1) : (current + delta + items.length) % items.length
  items[next]?.focus()
}

/** Focus the first item as soon as the menu opens, so a keyboard user lands on it. */
export function menuAutoFocus(container: HTMLElement | null): void {
  if (!container) return
  container.querySelector<HTMLElement>(ITEMS)?.focus()
}