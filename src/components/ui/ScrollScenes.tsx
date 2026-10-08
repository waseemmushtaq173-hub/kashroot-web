import React from "react";
import { ArrowRight, Sprout, ShoppingCart, Tractor } from "lucide-react";
import { Button } from "@/components/ui/Button";

const SCENES = [
  { id: "farmer", title: "Farmer Portal", desc: "Manage orchards and direct mandi listings.", color: "bg-[#D9622B]", icon: Sprout },
  { id: "buyer", title: "Buyer Portal", desc: "Source authenticated Kashmiri produce.", color: "bg-[#0B1F3A]", icon: ShoppingCart },
  { id: "tools", title: "Kissan Tools", desc: "Orchard equipment & supplies.", color: "bg-[#1E7B4F]", icon: Tractor }
];

export function ScrollScenes() {
  return (
    <div className="relative w-full bg-[#07120D]">
      {SCENES.map((scene, idx) => (
        <section key={scene.id} className="sticky top-0 h-screen flex items-center justify-center overflow-hidden">
          {/* Dynamic Theme Background */}
          <div className={`absolute inset-0 opacity-20 ${scene.color}`} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#07120D]/90" />
          
          <div className="container mx-auto px-6 relative z-10 flex flex-col items-center text-center">
            <div className={`w-20 h-20 rounded-2xl ${scene.color} flex items-center justify-center mb-6 shadow-2xl transform hover:scale-110 transition-transform`}>
              <scene.icon className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-4xl md:text-6xl font-serif font-black text-white mb-4 drop-shadow-lg">
              {scene.title}
            </h2>
            <p className="text-xl text-white/80 max-w-xl mx-auto mb-8">
              {scene.desc}
            </p>
            <Button variant="secondary" className="group rounded-full px-8">
              Explore Portal <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}
