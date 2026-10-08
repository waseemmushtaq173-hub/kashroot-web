"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    id: "dal",
    image: "https://images.unsplash.com/photo-1715457573748-8e8a70b2c1be?auto=format&fit=crop&w=1920&q=80",
    localImage: "/hero/dal-lake.webp",
    fallbackGrad: "from-[#0D5C2E]/80 to-[#0A2E22]/90",
    themePrimary: "#0E7C86",
    subline: "Produce: from orchard to buyer, paid safely.",
  },
  {
    id: "apple",
    image: "https://images.unsplash.com/photo-1628157793441-10c0130db6fc?auto=format&fit=crop&w=1920&q=80",
    localImage: "/hero/apple-orchard.webp",
    fallbackGrad: "from-[#D9622B]/80 to-[#9E3E15]/90",
    themePrimary: "#D9622B",
    subline: "Seller Studio: manage inventory and scale directly.",
  },
  {
    id: "saffron",
    image: "https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&w=1920&q=80",
    localImage: "/hero/saffron-fields.webp",
    fallbackGrad: "from-[#E8A317]/80 to-[#B87C0D]/90",
    themePrimary: "#E8A317",
    subline: "Payments & Escrow: trust verified at every step.",
  },
  {
    id: "gulmarg",
    image: "https://images.unsplash.com/photo-1578326282862-259837910ff6?auto=format&fit=crop&w=1920&q=80",
    localImage: "/hero/gulmarg-snow.webp",
    fallbackGrad: "from-[#2A9DB8]/80 to-[#1D748A]/90",
    themePrimary: "#2A9DB8",
    subline: "Logistics & Storage: cold chain unbroken.",
  },
  {
    id: "walnut",
    image: "https://images.unsplash.com/photo-1623933758167-7bfa5dbf5f4f?auto=format&fit=crop&w=1920&q=80",
    localImage: "/hero/walnut-market.webp",
    fallbackGrad: "from-[#6B4423]/80 to-[#4A2D15]/90",
    themePrimary: "#6B4423",
    subline: "Prices & Market: transparent daily mandi rates.",
  },
  {
    id: "artisan",
    image: "https://images.unsplash.com/photo-1584988701980-60a1e36780ee?auto=format&fit=crop&w=1920&q=80",
    localImage: "/hero/artisan-crafts.webp",
    fallbackGrad: "from-[#0F9D74]/80 to-[#0A6D50]/90",
    themePrimary: "#0F9D74",
    subline: "Expert & Community: heritage meets modern insight.",
  },
  {
    id: "chinar",
    image: "https://images.unsplash.com/photo-1573215284803-9d48b1399723?auto=format&fit=crop&w=1920&q=80",
    localImage: "/hero/chinar-autumn.webp",
    fallbackGrad: "from-[#C62828]/80 to-[#8E1C1C]/90",
    themePrimary: "#C62828",
    subline: "Supplies & Hardware: authentic tools, fair prices.",
  }
];

export function HeroShowcase({ onEnterPortals }: { onEnterPortals: () => void }) {
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [imagesError, setImagesError] = useState<Record<string, boolean>>({});

  const nextSlide = useCallback(() => {
    setCurrent((prev) => (prev + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (isHovered) return;

    // Check visibility API to pause when tab hidden
    const handleVisibilityChange = () => {
      if (document.hidden) setIsHovered(true);
      else setIsHovered(false);
    };
    
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
      className="relative isolate min-h-[48rem] h-[100vh] flex items-center overflow-hidden bg-black"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setIsHovered(false)}
    >
      {/* Background Slides */}
      {SLIDES.map((slide, idx) => {
        const isActive = idx === current;
        const isPrev = idx === (current - 1 + SLIDES.length) % SLIDES.length;
        
        // Priority load the first one, lazy load the rest
        const shouldLoad = isActive || isPrev || idx === (current + 1) % SLIDES.length;

        return (
          <div
            key={slide.id}
            className={cn(
              "absolute inset-0 transition-opacity duration-[1500ms] ease-in-out",
              isActive ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            )}
          >
            {/* Fallback Gradient Layer */}
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-80", slide.fallbackGrad)} />
            
            {/* High Res Image */}
            {shouldLoad && !imagesError[slide.id] && (
              <img
                src={slide.localImage}
                alt={slide.subline}
                onError={(e) => {
                  // Fallback to Unsplash URL if local is missing, or gradient if both fail
                  if (e.currentTarget.src.includes(slide.localImage)) {
                    e.currentTarget.src = slide.image;
                  } else {
                    setImagesError(prev => ({ ...prev, [slide.id]: true }));
                  }
                }}
                className={cn(
                  "absolute inset-0 w-full h-full object-cover mix-blend-overlay",
                  // Slow zoom effect on active
                  isActive ? "animate-slow-zoom scale-100 origin-center" : "scale-100"
                )}
                // Fetch priority for LCP optimization
                fetchPriority={idx === 0 ? "high" : "auto"}
                loading={idx === 0 ? "eager" : "lazy"}
              />
            )}
            
            {/* Scrim for text readability (WCAG AA) */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
          </div>
        );
      })}

      {/* Content */}
      <div className="container mx-auto px-6 md:px-12 relative z-20 py-24 max-w-7xl h-full flex flex-col justify-center">
        <h1 className="max-w-4xl font-serif text-5xl md:text-7xl lg:text-8xl font-black text-[#FFFDF8] leading-[1.1] drop-shadow-2xl">
          Where roots become{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D9622B] via-[#E8A317] to-[#F4A261] italic">
            horizons.
          </span>
        </h1>

        <div className="h-20 mt-6 max-w-2xl">
           {SLIDES.map((slide, idx) => (
             <p 
               key={slide.id}
               className={cn(
                 "absolute text-lg md:text-2xl text-[#F2ECE1] font-sans font-medium leading-relaxed drop-shadow-md transition-all duration-[1000ms]",
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

        {/* Progress Dots */}
        <div className="absolute bottom-12 left-6 md:left-12 flex items-center gap-3">
          {SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => setCurrent(idx)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-500",
                idx === current ? "w-10 bg-[#E8A317]" : "w-2 bg-white/40 hover:bg-white/60"
              )}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
      
      {/* Required CSS for the slow zoom effect */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slow-zoom {
          0% { transform: scale(1); }
          100% { transform: scale(1.08); }
        }
        .animate-slow-zoom {
          animation: slow-zoom 7s ease-in-out forwards;
        }
      `}} />
    </section>
  );
}

