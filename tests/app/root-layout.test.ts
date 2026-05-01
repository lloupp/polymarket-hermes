import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

describe('RootLayout', () => {
  it('renders the required html and body tags', async () => {
    const { default: RootLayout } = await import('../../app/layout');
    const markup = renderToStaticMarkup(
      RootLayout({ children: createElement('main', null, 'Conteúdo') }),
    );

    expect(markup).toContain('<html lang="pt-BR">');
    expect(markup).toContain('<body>');
    expect(markup).toContain('<main>Conteúdo</main>');
  });
});
