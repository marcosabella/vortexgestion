import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from 'next-themes'
import './index.css'
import 'leaflet/dist/leaflet.css'

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="vortex-tema">
    <App />
  </ThemeProvider>
);
