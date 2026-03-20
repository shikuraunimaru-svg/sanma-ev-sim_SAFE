import { useState, useEffect } from 'react';

export function useDarkMode() {
    const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
        // Only run on client side
        if (typeof window === 'undefined') return false;
        const savedMode = localStorage.getItem('theme-mode');
        if (savedMode) {
            return savedMode === 'dark';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (isDarkMode) {
            root.classList.add('dark');
            localStorage.setItem('theme-mode', 'dark');
        } else {
            root.classList.remove('dark');
            localStorage.setItem('theme-mode', 'light');
        }
    }, [isDarkMode]);

    const toggle = () => setIsDarkMode(prev => !prev);

    return { isDarkMode, toggle };
}
