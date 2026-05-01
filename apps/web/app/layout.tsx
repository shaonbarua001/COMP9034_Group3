import type { ReactNode } from 'react';
import './globals.css';
import { Shell } from './components/shell';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
