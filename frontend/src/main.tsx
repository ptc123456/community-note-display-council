import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { WalletProvider } from './wallet/WalletContext';
import './styles/app.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </React.StrictMode>
);
