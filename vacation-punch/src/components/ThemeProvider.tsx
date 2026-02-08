"use client";

import {
  useEffect,
  useState,
  createContext,
  useContext,
  ReactNode,
} from "react";

type ThemeContextType = {
  darkMode: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);

  // Initialize theme globally ONCE
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const theme = saved === "dark" ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", theme);
    setDarkMode(theme === "dark");
  }, []);

  const toggleTheme = () => {
    const theme = darkMode ? "light" : "dark";

    setDarkMode(!darkMode);
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  };

  return (
    <ThemeContext.Provider value={{ darkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
