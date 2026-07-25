import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import KlantPortaal from './portaal/KlantPortaal.jsx'
import BeheerPortaal from './beheer/BeheerPortaal.jsx'

const isBeheer = window.location.pathname.startsWith('/beheer')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isBeheer ? <BeheerPortaal /> : <KlantPortaal />}
  </StrictMode>,
)
