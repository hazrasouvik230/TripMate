import { useState, useEffect } from "react";
import { ArrowRight, MapPin, Calendar, Sparkles } from "lucide-react";
import Button from "../ui/Button";
import { useAuth } from "../../contexts/AuthContext";

// Varied scenery that cross-fades behind the hero. Beach, mountains, a
// waterfall, forested hills and an alpine lake.
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80", // beach
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80", // mountains
  "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=1920&q=80", // waterfall
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920&q=80", // forested hills
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80", // alpine lake
];

const SLIDE_MS = 6000; // time each image stays before cross-fading

const STATS = [
  { icon: MapPin, text: "200+ Destinations" },
  { icon: Calendar, text: "Smart Scheduling" },
  { icon: Sparkles, text: "AI Recommendations" },
];

const Hero = () => {
  const [index, setIndex] = useState(0);
  const { user } = useAuth();

  // Advance the slideshow on a timer.
  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % HERO_IMAGES.length),
      SLIDE_MS
    );
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden">
      {/* ---- Background slideshow (cross-fade + slow zoom) ---- */}
      <div className="absolute inset-0" aria-hidden="true">
        {HERO_IMAGES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 w-full h-full object-cover transition-all ease-out duration-[1500ms] ${
              i === index ? "opacity-100 scale-100" : "opacity-0 scale-110"
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-transparent" />
      </div>

      {/* ---- Content ---- */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-24">
        <div className="max-w-2xl">
          {/* Badge */}
          <span className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 rounded-full px-4 py-1.5 text-sm font-medium text-indigo-300 mb-6">
            <Sparkles className="w-4 h-4" />
            AI-Powered Trip Planning
          </span>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
            Your Next Adventure
            <br />
            <span className="text-indigo-400">Starts Here</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg sm:text-xl text-slate-300 leading-relaxed max-w-xl">
            Let AI craft your perfect trip. Personalised itineraries, smart
            budget planning, and hidden-gem recommendations — all tailored to
            your travel style.
          </p>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-x-6 gap-y-3 mt-8">
            {STATS.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-2 text-sm text-slate-300"
              >
                <Icon className="w-4 h-4 text-indigo-400 shrink-0" />
                {text}
              </div>
            ))}
          </div>

          {/* CTAs — logged-in users jump straight to their trips. */}
          <div className="mt-10 flex flex-wrap gap-4">
            <Button variant="primary" size="lg" to={user ? "/trips" : "/plan"}>
              Start Planning <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="secondary" size="lg" href="#how-it-works">
              Learn More
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

