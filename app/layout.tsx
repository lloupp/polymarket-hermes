import type { ReactNode } from 'react';

export const metadata = {
  title: 'Polymarket Hermes',
  description: 'Paper trading dashboard para mercados de clima da Polymarket.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
