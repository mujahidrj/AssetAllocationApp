import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './lib/fontawesome'
import './lib/firebase' // Initialize Firebase

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  // Ignore common browser extension errors
  if (event.reason?.message?.includes('message channel closed') ||
      event.reason?.message?.includes('asynchronous response')) {
    event.preventDefault();
    return;
  }
  console.error('Unhandled promise rejection:', event.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
