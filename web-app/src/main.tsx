import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { UserPreferencesProvider } from './context/UserPreferences.tsx'
import { ToastProvider } from './components/ui/Toast.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <UserPreferencesProvider>
        <App />
      </UserPreferencesProvider>
    </ToastProvider>
  </StrictMode>,
)
