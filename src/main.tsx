import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import PlayView from './views/PlayView';
import WallView from './views/WallView';

// Two client routes, no router needed: / is the game, /wall is the big screen.
const isWall = window.location.pathname.startsWith('/wall');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isWall ? <WallView /> : <PlayView />}
  </React.StrictMode>,
);
