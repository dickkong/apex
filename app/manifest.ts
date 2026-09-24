import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Apex Yield Profit Render Inc",
    short_name: "ApexYield",
    description:
      "A transparent investment-tracking console. Real deposits, real price observations, honest returns.",
    start_url: "/",
    display: "standalone",
    background_color: "#171110",
    theme_color: "#3a1220",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}