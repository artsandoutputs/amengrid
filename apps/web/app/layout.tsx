import "./globals.css";

export const metadata = {
  title: "AmenGrid",
  description: "Audio ingest & conversion",
  icons: {
    icon: "/favicon_amengrid.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
