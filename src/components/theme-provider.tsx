"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

type Theme = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  setTheme: (next: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = "hp-theme"

function readStored(): Theme {
  if (typeof window === "undefined") return "light"
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === "dark" ? "dark" : "light"
}

function applyTheme(next: Theme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (next === "dark") root.classList.add("dark")
  else root.classList.remove("dark")
  root.style.colorScheme = next
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStored())

  useEffect(() => {
    applyTheme(theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore localStorage write failures (private mode / storage full)
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])
  const toggle = useCallback(() => setThemeState(t => (t === "dark" ? "light" : "dark")), [])

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return {
      theme: "light",
      setTheme: () => {},
      toggle: () => {},
    }
  }
  return ctx
}
