import { Routes, Route, Link } from 'react-router-dom'
import App from './App'
import About from './pages/About'
import { DarkModeToggle } from './components/DarkModeToggle'

export default function RouterApp() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
      <nav className="p-4 flex gap-4 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors duration-200">
        <div className="flex gap-4">
          <Link to="/" className="hover:text-blue-600 dark:hover:text-blue-400 font-medium">シミュレーター</Link>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <Link to="/about" className="hover:text-blue-600 dark:hover:text-blue-400 font-medium">説明ページ</Link>
        </div>
        <DarkModeToggle />
      </nav>

      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </div>
  )
}