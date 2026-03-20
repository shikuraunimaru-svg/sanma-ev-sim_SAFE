import { useDarkMode } from '../hooks/useDarkMode';

export function DarkModeToggle() {
    const { isDarkMode, toggle } = useDarkMode();

    return (
        <button
            onClick={toggle}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            title={isDarkMode ? "ライトモードに切り替え" : "ダークモードに切り替え"}
            aria-label="Toggle Dark Mode"
        >
            {isDarkMode ? '☀️' : '🌙'}
        </button>
    );
}
