export default function RootLayout({children}: {children: React.ReactNode}){
  return (
    <html lang="pt">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;800&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{__html: `
          :root {
            --bg: #1a1a1a;
            --bg-card: #232323;
            --surface: #2a2a2a;
            --surface-hover: #333333;
            --surface-active: #3a3a3a;
            --border: #2f2f2f;
            --border-strong: #404040;
            --ink: #ffffff;
            --ink-secondary: #b3b3b3;
            --muted: #6b6b6b;
            --accent: #1a4be0;
            --accent-hover: #2558e8;
            --accent-muted: #1a4be040;
            --success: #43b581;
            --warning: #faa61a;
            --danger: #f04747;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Schibsted Grotesk', sans-serif;
            background: var(--bg);
            color: var(--ink);
            min-height: 100vh;
          }
          ::-webkit-scrollbar { width: 8px; height: 8px; }
          ::-webkit-scrollbar-track { background: var(--bg); }
          ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
          ::-webkit-scrollbar-thumb:hover { background: var(--muted); }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  )
}