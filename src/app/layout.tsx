import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kickio Content",
  description: "Approval queue for Kickio social posts",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Kickio Content" },
};

export const viewport: Viewport = {
  // One hardcoded dark value put a near-black status bar above a white page for
  // anyone whose phone is set to light, which is how the tool is actually used.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
  width: "device-width",
  initialScale: 1,
  // Deliberately NOT maximumScale or userScalable: pinch zoom is how somebody
  // reads a card in bright sun, and the iOS focus-zoom this used to work around
  // is fixed properly, by sizing the fields at 16px.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
