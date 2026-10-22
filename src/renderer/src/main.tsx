import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import contentJson from '@content';
import { buildContent } from '@core/content.js';
import { App } from './App.js';
import './styles.css';

const db = buildContent(contentJson as never);

const root = document.getElementById('root');
if (!root) throw new Error('缺少 #root');

createRoot(root).render(
  <StrictMode>
    <App db={db} />
  </StrictMode>,
);
