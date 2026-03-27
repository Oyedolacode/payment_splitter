'use client'

import { useEffect, useState } from 'react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => setMounted(true), [])

    if (!mounted) {
        return <div className="w-[34px] h-[34px]" />
    }

    return (
        <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            aria-pressed={theme === 'dark'}
            className="bg-transparent border-none text-[18px] cursor-pointer p-2 rounded-full flex items-center justify-center text-text"
        >
            {theme === 'light' ? '🌙' : '☀️'}
        </button>
    )
}
