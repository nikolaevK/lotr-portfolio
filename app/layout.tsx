import type { Metadata, Viewport } from "next";
import { Cinzel, IM_Fell_English, EB_Garamond } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-cinzel",
  display: "swap",
});

const fell = IM_Fell_English({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-fell",
  display: "swap",
});

// Body text: far more readable than IM Fell at small sizes, still of the period
const garamond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-garamond",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "There and Back Again — Konstantin Nikolaev",
  description:
    "The deeds and employments of Konstantin Nikolaev, full-stack engineer of Sherman Oaks — told as a dragon-flight over the map of Middle-earth. Fly Smaug, chart the five lands, light the beacons.",
  keywords: [
    "Konstantin Nikolaev",
    "portfolio",
    "full-stack engineer",
    "three.js",
    "react-three-fiber",
    "interactive portfolio",
  ],
  openGraph: {
    title: "There and Back Again — Konstantin Nikolaev",
    description:
      "An interactive Middle-earth portfolio. Fly the dragon, chart the five lands.",
    images: ["/assets/map.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0e0a06",
  // draw under the notch; UI pads itself with env(safe-area-inset-*)
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${fell.variable} ${garamond.variable}`}>
      <head>
        {/* hero texture: fetch in parallel with the JS instead of after canvas mount;
            crossOrigin must match THREE.TextureLoader ("anonymous") to reuse the cache entry */}
        <link rel="preload" as="image" href="/assets/map.jpg" crossOrigin="anonymous" />
      </head>
      <body>
        <noscript>
          <div style={{ maxWidth: 460, margin: "20vh auto 0", padding: "34px 40px", textAlign: "center" }}>
            <h1>There and Back Again — Konstantin Nikolaev</h1>
            <p>
              This portfolio is an interactive 3D map of Middle-earth and needs JavaScript. The old
              roads remain: <a href="https://linkedin.com/in/konn">linkedin.com/in/konn</a> ·{" "}
              <a href="https://github.com/nikolaevK">github.com/nikolaevK</a> ·{" "}
              <a href="/assets/resume.pdf">résumé (PDF)</a>
            </p>
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
