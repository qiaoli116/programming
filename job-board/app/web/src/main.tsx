import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth';
import { ScoresProvider } from './scores';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ScoresProvider>
          <App />
        </ScoresProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
