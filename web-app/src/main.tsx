import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { UserPreferencesProvider } from './context/UserPreferences.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserPreferencesProvider>
      <App />
    </UserPreferencesProvider>
  </StrictMode>,
)
