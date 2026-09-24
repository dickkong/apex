export function getSiteUrl(): string {
  return (
    process.env.RENDER_EXTERNAL_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  );
}