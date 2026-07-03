import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safe global Date monkey-patch to handle Firestore Timestamp object format in offline/cached mode
if (typeof window !== 'undefined') {
  const OriginalDate = window.Date;
  const SafeDate = function (this: any, ...args: any[]) {
    if (!(this instanceof SafeDate)) {
      // Called as a function without "new"
      // @ts-ignore
      return OriginalDate();
    }
    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      const val = args[0];
      const secs = val.seconds !== undefined ? val.seconds : (val._seconds !== undefined ? val._seconds : null);
      if (typeof secs === 'number') {
        return new OriginalDate(secs * 1000);
      }
    }
    return Reflect.construct(OriginalDate, args, SafeDate);
  };

  SafeDate.prototype = OriginalDate.prototype;

  // Bulletproof Date.prototype.toISOString protection to prevent RangeError system-wide
  const originalToISOString = OriginalDate.prototype.toISOString;
  OriginalDate.prototype.toISOString = function (this: Date) {
    if (isNaN(this.getTime())) {
      console.warn("[SafeDate] Recovered from invalid date in toISOString()");
      return new OriginalDate().toISOString(); // Safe fallback to current time
    }
    return originalToISOString.call(this);
  };
  
  // Copy static properties / methods
  Object.getOwnPropertyNames(OriginalDate).forEach(key => {
    if (key !== 'prototype' && key !== 'name' && key !== 'length') {
      try {
        // @ts-ignore
        SafeDate[key] = OriginalDate[key];
      } catch (e) {}
    }
  });

  (window as any).Date = SafeDate as any;
}

// Safely filter out known benign Recharts warnings during page transition / iframe load
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (args[0] && typeof args[0] === 'string' && (args[0].includes('width(-1)') || args[0].includes('height(-1)') || args[0].includes('should be greater than 0'))) {
      return;
    }
    originalWarn(...args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Detect if we are in development, preview, or inside an iframe
const isDevOrIframe = typeof window !== 'undefined' && (
  window.location.hostname.includes('localhost') ||
  window.location.hostname.includes('run.app') ||
  window.location.hostname.includes('aistudio') ||
  window.self !== window.top
);

if (isDevOrIframe) {
  console.log('[PWA] Development or iframe environment detected. Disabling service worker & clearing cache to prevent stale previews.');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) console.log('[PWA] Unregistered stale service worker:', registration.scope);
        });
      }
    });
  }
  if (typeof window !== 'undefined' && 'caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        caches.delete(key).then(() => {
          console.log('[PWA] Cleared stale cache:', key);
        });
      });
    });
  }
} else {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[Service Worker] Registered and active with scope:', registration.scope);
        })
        .catch((error) => {
          console.warn('[Service Worker] Registration failed:', error);
        });
    });
  }
}

// Global PWA prompt installer tracker
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the default browser mini-infobar prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    (window as any).deferredPrompt = e;
    console.log('[PWA] beforeinstallprompt event captured and stored.');
    // Dispatch custom event to notify components
    window.dispatchEvent(new CustomEvent('sabush-pwa-installable', { detail: true }));
  });
}
