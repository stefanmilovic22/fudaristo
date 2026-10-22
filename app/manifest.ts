import type { MetadataRoute } from "next";

/**
 * Web manifest — „Dodaj na početni ekran" otvara sajt kao aplikaciju (bez
 * adresne trake) sa našom ikonom. Namerno bez service worker-a: ne treba nam
 * rad bez interneta, a keširanje stranica bi moglo da pokaže stare poene.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fudaristo",
    short_name: "Fudaristo",
    description: "Fantasy football for the Greek Super League",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0D1326",
    theme_color: "#0D1326",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
