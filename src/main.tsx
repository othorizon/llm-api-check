import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const el = document.getElementById('root')!
el.innerHTML = ''
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
