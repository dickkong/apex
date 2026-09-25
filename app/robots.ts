import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/login",
        "/register",
        "/dashboard",
        "/holdings",
        "/transactions",
        "/calculator",
        "/support",
        "/oversight",
      ],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}