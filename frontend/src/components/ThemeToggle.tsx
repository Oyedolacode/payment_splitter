'use client'

import { useEffect, useState } from 'react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme()
    const [mounted, setMounted] = useState(false)

    useEffect(() => setMounted(true), [])

    if (!mounted) {
        return <div style={{ width: '34px', height: '34px' }} />
    }

    return (
        <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            style={{
                background: 'transparent',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text)'
            }}
        >
            {theme === 'light' ? '🌙' : '☀️'}
        </button>
    )
}
