import type { MetadataRoute } from "next";
import { languages, siteUrl, tools } from "@/lib/catalog";
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    ...tools.map((t) => `/${t.slug}`),
    "/languages",
    ...languages.map((l) => `/languages/${l.slug}/dub-video-to-${l.slug}`),
    "/pricing",
    "/how-to-dub-a-video",
    "/blog",
    "/blog/preparing-a-video-for-dubbing",
    "/about",
    "/privacy",
    "/terms",
    "/refund-policy",
    "/contact",
  ];
  return paths.map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: path === "/blog" ? "weekly" : "monthly",
    priority:
      path === "/"
        ? 1
        : path === "/auto-dubbing"
          ? 0.9
          : path.startsWith("/languages/")
            ? 0.6
            : 0.7,
  }));
}
