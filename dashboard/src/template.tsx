import { type TemplateProps } from 'rasengan';

export default function Template({ Head, Body, Script }: TemplateProps) {
  return (
    <html lang="en">
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0b0c0f" />
        {/* rasengan 2.0.0 reads this flag when its client entry loads, but injects it after the entry
            scripts, so an SPA hydrates an empty #root (React error 418). A classic script runs first. */}
        <script dangerouslySetInnerHTML={{ __html: 'window.__RASENGAN_SPA_MODE__=true;' }} />
        <link rel="icon" type="image/svg+xml" href="/rasengan.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
        />
      </Head>

      <Body>
        <Script />
      </Body>
    </html>
  );
}
