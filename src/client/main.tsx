import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FeedbackProvider } from './components/Feedback';
import './style.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

createRoot(root).render(
  <StrictMode>
    <FeedbackProvider>
      <App />
    </FeedbackProvider>
  </StrictMode>,
);
