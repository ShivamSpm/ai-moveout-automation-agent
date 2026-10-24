import Image from "next/image";
import type { Item } from "@/lib/demo";

// Item photo, or a colored tile with the item's initial when there's no photo yet.
export function ItemArt({ item, size = "md" }: { item: Item; size?: "md" | "lg" }) {
  return (
    <div
      className={`relative aspect-[4/3] overflow-hidden border border-line ${size === "lg" ? "rounded-[28px]" : "rounded-3xl"}`}
      style={{
        background: `radial-gradient(110% 90% at 85% 0%, color-mix(in oklab, ${item.hue} 45%, white) 0%, ${item.hue} 60%)`,
      }}
    >
      {item.image ? (
        <Image
          src={item.image}
          alt={item.name}
          fill
          sizes={size === "lg" ? "(min-width: 1024px) 560px, 100vw" : "(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"}
          className="object-cover"
          loading={size === "lg" ? "eager" : "lazy"}
        />
      ) : (
        <span
          aria-hidden
          className={`absolute -bottom-[0.18em] left-3 font-display leading-none text-[#0e0e12]/85 ${size === "lg" ? "text-[13rem]" : "text-[8.5rem]"}`}
        >
          {item.name.replace(/^IKEA /, "").charAt(0)}
        </span>
      )}
      <span className="absolute right-3 top-3 rounded-full border-2 border-black/10 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#0e0e12]">
        {item.category}
      </span>
    </div>
  );
}
