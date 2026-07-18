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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${fell.variable} ${garamond.variable}`}>
      <body>{children}</body>
    </html>
  );
}
