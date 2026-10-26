import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, getStoredTheme } from './lib/theme'
import { initDesktopBridge } from './lib/desktopBridge'

// Initial desktop bridge & theme application on boot
initDesktopBridge();
applyTheme(getStoredTheme());

// Disable default browser context menu (Back, Forward, Reload, Save as, Print, Inspect)
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
}, { capture: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
