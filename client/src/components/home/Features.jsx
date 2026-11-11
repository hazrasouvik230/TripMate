import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Wallet,
  Heart,
  Globe,
  ShieldCheck,
  Clock,
} from "lucide-react";
import SectionHeading from "../ui/SectionHeading";

const FEATURES = [
  {
    icon: Sparkles,
    color: "text-indigo-600 bg-indigo-100",
    title: "AI Itineraries",
    description:
      "Generate detailed day-by-day travel plans in seconds. Our AI considers weather, local events, travel times, and your personal interests to build the perfect schedule.",
  },
  {
    icon: Wallet,
    color: "text-emerald-600 bg-emerald-100",
    title: "Budget Planning",
    description:
      "Set your budget and let AI optimise every dollar. Get real-time price comparisons for flights, hotels, and activities so there are no surprises.",
  },
  {
    icon: Heart,
    color: "text-rose-600 bg-rose-100",
    title: "Personalised Picks",
    description:
      "Tell us what you love — food tours, adventure sports, art galleries — and receive recommendations that match your unique travel personality.",
  },
  {
    icon: Globe,
    color: "text-sky-600 bg-sky-100",
    title: "Global Coverage",
    description:
      "From bustling cities to remote islands, TripMate AI covers 200+ destinations across every continent with up-to-date local knowledge.",
  },
  {
    icon: ShieldCheck,
    color: "text-amber-600 bg-amber-100",
    title: "Travel Safety",
    description:
      "Stay informed with real-time safety alerts, visa requirements, and health advisories for every destination on your itinerary.",
  },
  {
    icon: Clock,
    color: "text-violet-600 bg-violet-100",
    title: "Real-Time Updates",
    description:
      "Flight delays, gate changes, weather shifts — get instant notifications and automatic itinerary adjustments while you travel.",
  },
];

const FeatureCard = ({ icon: Icon, color, title, description, shown, delay }) => (
  <div
    style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
    className={`group bg-white rounded-2xl p-7 border border-slate-200/80 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/50 hover:-translate-y-1 transition-all duration-500 ease-out dark:bg-slate-800 dark:border-slate-700 dark:hover:border-indigo-500/40 dark:hover:shadow-black/20 ${
      shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
    }`}
  >
    <div
      className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-5 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${color}`}
    >
      <Icon className="w-6 h-6" />
    </div>

    <h3 className="text-lg font-bold text-slate-900 mb-2 dark:text-slate-100">{title}</h3>
    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
  </div>
);

const Features = () => {
  const sectionRef = useRef(null);
  const [shown, setShown] = useState(false);

  // Reveal the cards the first time the section scrolls into view.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="features"
      className="py-20 sm:py-28 bg-slate-50 dark:bg-slate-900"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          badge="Features"
          title="Why Choose TripMate AI?"
          subtitle="Everything you need to plan, book, and enjoy your travels — powered by cutting-edge artificial intelligence."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feat, idx) => (
            <FeatureCard
              key={feat.title}
              {...feat}
              shown={shown}
              delay={idx * 100}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;

