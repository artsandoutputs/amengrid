import "./globals.css";

export const metadata = {
  title: "AmenGrid",
  description: "Audio ingest & conversion"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
