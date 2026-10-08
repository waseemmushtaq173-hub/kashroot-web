"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * HeroShowcase — full-screen crossfading slideshow of authentic Kashmir
 * photography. Three slides, in order:
 *   1. Shikara on Dal Lake   2. Pampore saffron fields   3. Apple orchards
 *
 * The section itself is transparent so the dynamic app wallpaper
 * (AppWallpaper, fixed behind everything) is the base layer — there is no
 * flat black or brown CSS gradient anywhere in this hero. Readability comes
 * from a single glassmorphic scrim: `backdrop-blur-md bg-black/40`.
 */
const SLIDES = [
  {
    id: "dal-lake",
    image: "https://images.unsplash.com/photo-1715457573748-8e8a70b2c1be?auto=format&fit=crop&w=2400&q=85",
    localImage: "/hero/dal-lake.webp",
    eyebrow: "Dal Lake, Srinagar",
    subline: "Shikaras carry the valley's harvest from orchard to market.",
  },
  {
    id: "saffron",
    image: "https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&w=2400&q=85",
    localImage: "/hero/saffron-fields.webp",
    eyebrow: "Pampore",
    subline: "Bogha saffron traded direct with verified buyers.",
  },
  {
    id: "apple",
    image: "https://images.unsplash.com/photo-1628157793441-10c0130db6fc?auto=format&fit=crop&w=2400&q=85",
    localImage: "/hero/apple-orchard.webp",
    eyebrow: "Shopian Valley",
    subline: "Grade-A apples priced transparently, escrow protected.",
  },
];

export function HeroShowcase({ onEnterPortals }: { onEnterPortals: () => void }) {
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [imagesError, setImagesError] = useState<Record<string, boolean>>({});

  const nextSlide = useCallback(() => {
    setCurrent((prev) => (prev + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => setIsHovered(document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = setInterval(() => {
      if (!document.hidden) nextSlide();
    }, 7000);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isHovered, nextSlide]);

  return (
    <section
      className="relative isolate min-h-[48rem] h-[100vh] flex items-center overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setIsHovered(false)}
    >
      {/* Crossfading slides — photography over the live wallpaper base */}
      {SLIDES.map((slide, idx) => {
        const isActive = idx === current;
        const shouldLoad = isActive || idx === (current + 1) % SLIDES.length;

        return (
          <div
            key={slide.id}
            className={cn(
              "absolute inset-0 transition-opacity duration-[1500ms] ease-in-out",
              isActive ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            )}
          >
            {shouldLoad && !imagesError[slide.id] && (
              <img
                src={slide.localImage}
                alt={slide.eyebrow}
                onError={(e) => {
                  // Local asset missing → Unsplash; Unsplash failing → wallpaper base
                  if (e.currentTarget.src.includes(slide.localImage)) {
                    e.currentTarget.src = slide.image;
                  } else {
                    setImagesError((prev) => ({ ...prev, [slide.id]: true }));
                  }
                }}
                className={cn(
                  "absolute inset-0 w-full h-full object-cover",
                  isActive ? "animate-slow-zoom origin-center" : "scale-100"
                )}
                fetchPriority={idx === 0 ? "high" : "auto"}
                loading={idx === 0 ? "eager" : "lazy"}
              />
            )}
          </div>
        );
      })}

      {/* Glassmorphic scrim — keeps the white serif type WCAG-readable */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-20 backdrop-blur-md bg-black/40"
      />

      {/* Content */}
      <div className="container mx-auto px-6 md:px-12 relative z-30 py-24 max-w-7xl h-full flex flex-col justify-center">
        <p className="text-[#E8C87A] tracking-[0.3em] text-xs md:text-sm uppercase font-serif font-bold mb-5 drop-shadow-md">
          {SLIDES[current].eyebrow}
        </p>

        <h1 className="max-w-4xl font-serif text-5xl md:text-7xl lg:text-8xl font-black text-white leading-[1.1] drop-shadow-2xl">
          Where roots become{" "}
          <span className="italic text-[#F4C77B]">horizons.</span>
        </h1>

        <div className="h-24 mt-6 max-w-2xl relative">
          {SLIDES.map((slide, idx) => (
            <p
              key={slide.id}
              className={cn(
                "absolute text-lg md:text-2xl text-white font-sans font-medium leading-relaxed drop-shadow-lg transition-all duration-[1000ms]",
                idx === current ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
              )}
            >
              {slide.subline}
            </p>
          ))}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 w-full max-w-md">
          <Button
            onClick={onEnterPortals}
            variant="primary"
            size="default"
            className="group py-5 px-8 text-lg rounded-2xl shadow-[0_10px_35px_rgba(200,90,23,0.4)] border border-[#FFD79E]/40"
          >
            Enter Kashroot Portals
            <ArrowRight className="ml-3 w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
          </Button>
        </div>

        {/* Progress dots */}
        <div className="absolute bottom-12 left-6 md:left-12 flex items-center gap-3">
          {SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => setCurrent(idx)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-500",
                idx === current ? "w-10 bg-[#F4C77B]" : "w-2 bg-white/50 hover:bg-white/80"
              )}
              aria-label={`Go to slide ${idx + 1}: ${slide.eyebrow}`}
            />
          ))}
        </div>
      </div>

      {/* Slow zoom for the active photograph */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slow-zoom {
          0% { transform: scale(1); }
          100% { transform: scale(1.06); }
        }
        .animate-slow-zoom {
          animation: slow-zoom 7s ease-in-out forwards;
        }
      `}} />
    </section>
  );
}
