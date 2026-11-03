import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../components/pastoral/refinement.css";
import "./pastoral.css";
import { SessionHeartbeat } from "../components/auth/SessionHeartbeat";

export const metadata: Metadata = {
  title: {
    default: "3D",
    template: "%s | 3D",
  },
  description: "삼덕청년부 기도운동, 심방신청, 기도요청, 공지",
  applicationName: "3D",
  appleWebApp: { capable: true, title: "3D", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/3duks-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/3duks-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/3duks-apple-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><SessionHeartbeat />{children}</body>
    </html>
  );
}
