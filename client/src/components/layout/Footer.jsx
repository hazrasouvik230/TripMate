import { Link } from "react-router-dom";
import { MapPin, Globe, MessageCircle, Users } from "lucide-react";

const FOOTER_SECTIONS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Destinations", href: "#destinations" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "Pricing", to: "/pricing" },       // Phase 3
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", to: "/about" },        // Phase 3
      { label: "Careers", to: "/careers" },        // Phase 3
      { label: "Blog", to: "/blog" },              // Phase 3
      { label: "Contact", to: "/contact" },        // Phase 3
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", to: "/help" },       // Phase 3
      { label: "Privacy Policy", to: "/privacy" }, // Phase 3
      { label: "Terms of Service", to: "/terms" }, // Phase 3
      { label: "FAQ", to: "/faq" },                // Phase 3
    ],
  },
];

const SOCIAL_LINKS = [
  { Icon: MessageCircle, href: "#", label: "Community" },
  { Icon: Globe, href: "#", label: "Website" },
  { Icon: Users, href: "#", label: "Team" },
];

const Footer = () => {
  return (
    <footer className="bg-slate-900 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        {/* ---- Top grid ---- */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          {/* Brand column */}
          <div className="col-span-2">
            <Link
              to="/"
              className="flex items-center gap-2 text-xl font-bold text-white mb-4"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white">
                <MapPin className="w-5 h-5" />
              </div>
              TripMate&nbsp;<span className="text-indigo-400">AI</span>
            </Link>

            <p className="text-sm leading-relaxed max-w-xs">
              AI-powered trip planning that crafts personalised itineraries,
              discovers hidden gems, and manages every detail of your journey.
            </p>

            {/* Social icons */}
            <div className="flex items-center gap-3 mt-6">
              {SOCIAL_LINKS.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white transition"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_SECTIONS.map(({ title, links }) => (
            <div key={title}>
              <h4 className="text-sm font-semibold text-white tracking-wide uppercase mb-4">
                {title}
              </h4>
              <ul className="space-y-2.5">
                {links.map(({ label, href, to }) => (
                  <li key={label}>
                    {href ? (
                      <a
                        href={href}
                        className="text-sm hover:text-indigo-400 transition-colors"
                      >
                        {label}
                      </a>
                    ) : (
                      <Link
                        to={to}
                        className="text-sm hover:text-indigo-400 transition-colors"
                      >
                        {label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ---- Bottom bar ---- */}
        <div className="mt-14 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <p>© {new Date().getFullYear()} TripMate AI. All rights reserved.</p>
          <p className="text-slate-500">
            Built with React, Tailwind CSS &amp; ❤️
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
