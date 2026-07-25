import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import KlantPortaal from './portaal/KlantPortaal.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <KlantPortaal />
  </StrictMode>,
)
