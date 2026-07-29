import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import KlantPortaal from './portaal/KlantPortaal.jsx'
import BeheerPortaal from './beheer/BeheerPortaal.jsx'
import MedewerkerPortaal from './medewerker/MedewerkerPortaal.jsx'
import TekenPagina from './medewerker/offertes/Teken.jsx'

const pad = window.location.pathname

// /tekenen/{id} is de publieke tekenpagina van de Offertetool-integratie — geen Microsoft-
// login nodig (zie staticwebapp.config.json, route op anonymous). Moet vóór de routes
// hieronder gecontroleerd worden: hij valt niet onder /beheer of /medewerker, en zou anders
// per ongeluk als klantportaal-pagina geladen worden (en dus achter een inlogscherm blijven
// hangen, precies het lek dat het integratieplan expliciet noemt als kritiek aandachtspunt).
const tekenMatch = pad.match(/^\/tekenen\/([^/]+)\/?$/)

const Portaal = pad.startsWith('/beheer')
  ? BeheerPortaal
  : pad.startsWith('/medewerker')
    ? MedewerkerPortaal
    : KlantPortaal

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {tekenMatch ? <TekenPagina id={decodeURIComponent(tekenMatch[1])} /> : <Portaal />}
  </StrictMode>,
)
