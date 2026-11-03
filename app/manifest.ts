import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "3D",
    short_name: "3D",
    description: "삼덕청년부 기도운동, 심방신청, 기도요청, 공지",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/3duks-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/3duks-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/3duks-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
