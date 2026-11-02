'use client';
import { ThemeProvider as NextThemes } from 'next-themes';

export default function ThemeProvider({ children }) {
  return (
    <NextThemes attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
