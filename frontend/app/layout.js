import 'highlight.js/styles/github-dark.css';
import './globals.css';

export const metadata = {
  title: 'Codebase Knowledge AI',
  description: 'Explain any concept in a codebase and visualize its flow.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <h1>Codebase Knowledge AI</h1>
          <span className="tag">explain code · draw diagrams</span>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
