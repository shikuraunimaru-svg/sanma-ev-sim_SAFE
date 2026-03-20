import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom' // ← 追加
import './index.css'
import RouterApp from './RouterApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter> {/* ← ここでラップ */}
      <RouterApp />
    </HashRouter>
  </StrictMode>,
)