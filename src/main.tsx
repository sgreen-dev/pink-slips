import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './ui/App.tsx'
import { SoundProvider } from './ui/sound/SoundContext.tsx'

const root = document.getElementById('root')
if (!root) {
  throw new Error('index.html is missing the #root element')
}

createRoot(root).render(
  <StrictMode>
    <SoundProvider>
      <App />
    </SoundProvider>
  </StrictMode>,
)
