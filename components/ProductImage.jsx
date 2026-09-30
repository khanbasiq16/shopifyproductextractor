"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

/** Ask Shopify's image CDN for a small rendition to keep the table light. */
function thumbnail(src, width) {
  if (!src) return null;
  try {
    const url = new URL(src);
    if (url.hostname === "cdn.shopify.com" || url.pathname.includes("/cdn/shop/")) {
      url.searchParams.set("width", String(width));
      return url.toString();
    }
  } catch {
    return null;
  }
  return src;
}

export default function ProductImage({ src, alt, size = 44 }) {
  const [failed, setFailed] = useState(false);
  const thumb = thumbnail(src, size * 2);
  const box = { width: size, height: size };

  if (!thumb || failed) {
    return (
      <span
        style={box}
        className="flex shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-faint"
        title="No image"
      >
        <ImageOff className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumb}
      alt={alt}
      style={box}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-md border border-line bg-canvas object-cover"
    />
  );
}
