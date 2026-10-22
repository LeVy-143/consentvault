import React from 'react';
import { createRoot } from 'react-dom/client';
import { TideCloakContextProvider } from '@tidecloak/react';
import App from './App.jsx';
import './style.css';
const root = createRoot(document.getElementById('root'));
root.render(<div className="startup">Opening ConsentVault…</div>);
async function bootstrap() { try {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Service unavailable');
  const setup = await response.json();
  root.render(setup.configured
    ? <TideCloakContextProvider config={setup.config}><App setup={setup}/></TideCloakContextProvider>
    : <App setup={setup}/>);
} catch {
  root.render(<App setup={{ configured: false, encryptionConfigured: false, unavailable: true }}/>);
} }
bootstrap();
