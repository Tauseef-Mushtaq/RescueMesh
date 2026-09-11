import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { LayoutRouter } from "@/components/layout/layout-router";

export const metadata = {
  title: "RescueMesh AI — Disaster Intelligence Platform",
  description: "Turn chaotic multilingual emergency reports into prioritized rescue intelligence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('rescuemesh-theme');var r=t==='light'?'light':t==='system'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):'dark';if(r==='light')document.documentElement.classList.add('light');else document.documentElement.classList.remove('light');})();`,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider>
          <LayoutRouter>{children}</LayoutRouter>
        </ThemeProvider>
      </body>
    </html>
  );
}
