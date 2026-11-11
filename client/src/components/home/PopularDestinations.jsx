import { useState, useEffect, useRef } from "react";
import { MapPin, Star } from "lucide-react";
import SectionHeading from "../ui/SectionHeading";

const DESTINATIONS = [
  {
    city: "Santorini",
    country: "Greece",
    image:
      "https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=600&q=80",
    rating: 4.9,
    tag: "Trending",
  },
  {
    city: "Kyoto",
    country: "Japan",
    image:
      "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600&q=80",
    rating: 4.8,
    tag: "Cultural",
  },
  {
    city: "Bali",
    country: "Indonesia",
    image:
      "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80",
    rating: 4.7,
    tag: "Nature",
  },
  {
    city: "Paris",
    country: "France",
    image:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80",
    rating: 4.8,
    tag: "Romantic",
  },
  {
    city: "Maldives",
    country: "South Asia",
    image:
      "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=600&q=80",
    rating: 4.9,
    tag: "Beach",
  },
  {
    city: "Swiss Alps",
    country: "Switzerland",
    image:
      "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=600&q=80",
    rating: 4.8,
    tag: "Adventure",
  },
];

const DestinationCard = ({ city, country, image, rating, tag, shown, delay }) => (
  <div
    style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
    className={`group relative rounded-2xl overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-500 ease-out ${
      shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
    }`}
  >
    {/* Image */}
    <div className="aspect-[4/5] overflow-hidden">
      <img
        src={image}
        alt={`${city}, ${country}`}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        loading="lazy"
      />
    </div>

    {/* Tag badge */}
    <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-xs font-semibold text-slate-700 px-3 py-1 rounded-full">
      {tag}
    </span>

    {/* Bottom info overlay */}
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent p-5 pt-16">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{city}</h3>
          <p className="flex items-center gap-1 text-sm text-slate-300 mt-0.5">
            <MapPin className="w-3.5 h-3.5" />
            {country}
          </p>
        </div>

        <div className="flex items-center gap-1 text-sm font-medium text-amber-400">
          <Star className="w-4 h-4 fill-amber-400" />
          {rating}
        </div>
      </div>
    </div>
  </div>
);

const PopularDestinations = () => {
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
    <section ref={sectionRef} id="destinations" className="py-20 sm:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          badge="Explore"
          title="Popular Destinations"
          subtitle="Discover breathtaking locations loved by travellers worldwide. Each destination is hand-picked and enriched with AI-curated insights."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {DESTINATIONS.map((dest, idx) => (
            <DestinationCard
              key={dest.city}
              {...dest}
              shown={shown}
              delay={idx * 100}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default PopularDestinations;

