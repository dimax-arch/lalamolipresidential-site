import React from 'react';
import { createRoot } from 'react-dom/client';
import SpotifyCallback from './components/SpotifyCallback/SpotifyCallback.jsx';
import './index.css';

createRoot(document.getElementById('spotify-callback-root')).render(
  <React.StrictMode>
    <SpotifyCallback />
  </React.StrictMode>
);
