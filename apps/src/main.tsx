import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, getStoredTheme } from './lib/theme'
import { initDesktopBridge } from './lib/desktopBridge'
import { initArtCraftPreloader, disableDefaultWebBehaviors } from './lib/artcraftPreloader'

// Initial desktop bridge, theme, & ArtCraft WASM suite preloader on boot
initDesktopBridge();
applyTheme(getStoredTheme());
initArtCraftPreloader();

// Disable all default web browser behaviors (context menu, Print, Find bar, Reload, DevTools, Zoom, History)
disableDefaultWebBehaviors(window, false);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
