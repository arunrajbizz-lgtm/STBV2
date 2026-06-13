import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { NavigationProvider } from './contexts/NavigationContext.jsx'
import { PlayerProvider } from './contexts/PlayerContext.jsx'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <NavigationProvider>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </NavigationProvider>
  </ErrorBoundary>,
)
