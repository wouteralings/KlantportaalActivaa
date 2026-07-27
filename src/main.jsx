import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import KlantPortaal from './portaal/KlantPortaal.jsx'
import BeheerPortaal from './beheer/BeheerPortaal.jsx'
import MedewerkerPortaal from './medewerker/MedewerkerPortaal.jsx'

const pad = window.location.pathname
const Portaal = pad.startsWith('/beheer')
  ? BeheerPortaal
  : pad.startsWith('/medewerker')
    ? MedewerkerPortaal
    : KlantPortaal

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Portaal />
  </StrictMode>,
)
