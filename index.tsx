import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StoreProvider } from './context/StoreContext';
import { BackupProvider } from './context/BackupContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No se encontró el elemento #root donde montar la aplicación.');
}

// En la web publicada, las imágenes de las cartas se guardan en el navegador (ver public/sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Sin service worker la app funciona igual; solo se pierde la caché de imágenes.
  });
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <BackupProvider>
          <App />
        </BackupProvider>
      </StoreProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
