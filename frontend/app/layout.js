import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import 'highlight.js/styles/github-dark.css';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata = {
  title: 'Cairn - ask your codebase for directions',
  description:
    'Index any repo. Ask a question. Get a streamed answer grounded in the exact files and lines, with a live dependency graph and Mermaid diagrams.',
};

export default function RootLayout({ children }) {
  return (
    // Font variables go on <html> so :root-level custom properties (--font-display etc.) can
    // reference them — var() chains resolve at the declaring element, not the usage site.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body>
        {/* Apply the saved theme before hydration so light-mode users see no dark flash. */}
        <Script id="cairn-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('cairn-theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
