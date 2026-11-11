import { useState, useEffect, useRef } from "react";
import { UserCircle, Cpu, Plane } from "lucide-react";
import SectionHeading from "../ui/SectionHeading";

const STEPS = [
  {
    number: "01",
    icon: UserCircle,
    title: "Share Your Preferences",
    description:
      "Tell us your dates, budget, interests, and travel style. Whether you're a solo adventurer or planning a family holiday, we tailor everything to you.",
  },
  {
    number: "02",
    icon: Cpu,
    title: "AI Builds Your Itinerary",
    description:
      "Our AI analyses thousands of options — flights, hotels, activities, restaurants — and assembles a day-by-day plan optimised for your goals.",
  },
  {
    number: "03",
    icon: Plane,
    title: "Book & Enjoy",
    description:
      "Review your itinerary, tweak anything you like, then book it all in one place. Real-time updates keep your trip running smoothly.",
  },
];

// Plane flight duration (ms). Reveals are timed against it so each step
// appears as the plane reaches it (start → middle → end).
const PLANE_MS = 3000;

const HowItWorks = () => {
  const sectionRef = useRef(null);
  const [active, setActive] = useState(false);
  const [flying, setFlying] = useState(false); // plane + trail have started
  // phase advances 1..6: icon1, text1, icon2, text2, icon3, text3.
  const [phase, setPhase] = useState(0);

  // SMIL animation refs — started explicitly once the SVG is mounted, since
  // dynamically-inserted SMIL doesn't auto-begin reliably across browsers.
  const planeAnimRef = useRef(null);
  const clipAnimRef = useRef(null);

  // Start the sequence the first time the section scrolls into view.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setActive(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Sequence: icon 1 → context 1 → plane takes off → it reaches the middle
  // (icon/context 2) → it reaches the end (icon/context 3). Reveals after the
  // takeoff are timed against the flight so each step appears as the plane
  // arrives there.
  useEffect(() => {
    if (!active) return;
    const TAKEOFF = 1000; // after step 1's context has appeared
    const timers = [
      setTimeout(() => setPhase((p) => Math.max(p, 1)), 150), // icon 1
      setTimeout(() => setPhase((p) => Math.max(p, 2)), 550), // context 1
      setTimeout(() => setFlying(true), TAKEOFF), // plane + trail start
      setTimeout(() => setPhase((p) => Math.max(p, 3)), TAKEOFF + PLANE_MS / 2), // icon 2 (middle)
      setTimeout(() => setPhase((p) => Math.max(p, 4)), TAKEOFF + PLANE_MS / 2 + 400), // context 2
      setTimeout(() => setPhase((p) => Math.max(p, 5)), TAKEOFF + PLANE_MS), // icon 3 (end)
      setTimeout(() => setPhase((p) => Math.max(p, 6)), TAKEOFF + PLANE_MS + 400), // context 3
    ];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  // Kick off the SMIL flight + trail once the connector has mounted.
  useEffect(() => {
    if (!flying) return;
    const id = requestAnimationFrame(() => {
      try {
        clipAnimRef.current?.beginElement();
      } catch {
        /* noop */
      }
      try {
        planeAnimRef.current?.beginElement();
      } catch {
        /* noop */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [flying]);

  const reveal = (shown) =>
    `transition-all duration-500 ease-out ${
      shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
    }`;

  return (
    <section ref={sectionRef} id="how-it-works" className="py-20 sm:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          badge="Simple Process"
          title="How It Works"
          subtitle="Three easy steps from dream to destination. No stress, no endless tabs — just your perfect trip."
        />

        {/* ---- Steps ---- */}
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
          {/* Connector (desktop only) — the dotted trail is drawn progressively
              behind the plane as it flies. Only mounts once the plane takes off
              (after step 1's context), so nothing shows beforehand. */}
          {flying && (
            <div
              className="hidden md:block absolute top-8 left-[16.6%] right-[16.6%] -translate-y-1/2"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 1000 60"
                preserveAspectRatio="none"
                className="w-full h-12 overflow-visible"
              >
                <defs>
                  <linearGradient id="howGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#a5b4fc" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a5b4fc" />
                  </linearGradient>
                  {/* A rectangle that grows left → right in sync with the plane,
                      revealing only the portion of the trail already passed. */}
                  <clipPath id="trailClip">
                    <rect x="0" y="0" width="0" height="60">
                      <animate
                        ref={clipAnimRef}
                        attributeName="width"
                        from="0"
                        to="1000"
                        dur={`${PLANE_MS / 1000}s`}
                        begin="indefinite"
                        fill="freeze"
                      />
                    </rect>
                  </clipPath>
                </defs>

                {/* The invisible path the plane follows. */}
                <path
                  id="howPath"
                  d="M0,30 Q250,2 500,30 T1000,30"
                  fill="none"
                  stroke="none"
                />

                {/* Dotted trail, revealed only where the plane has already passed. */}
                <path
                  d="M0,30 Q250,2 500,30 T1000,30"
                  fill="none"
                  stroke="url(#howGrad)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="1 14"
                  clipPath="url(#trailClip)"
                  style={{ filter: "drop-shadow(0 0 4px rgba(99,102,241,0.6))" }}
                />

                {/* The plane, banking along the curve (rotate="auto"). */}
                <g style={{ filter: "drop-shadow(0 0 6px rgba(99,102,241,0.7))" }}>
                  <g transform="rotate(45) scale(1.7) translate(-12 -12)">
                    <path
                      d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 4.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
                      fill="#4f46e5"
                      stroke="#ffffff"
                      strokeWidth="1"
                      strokeLinejoin="round"
                    />
                  </g>
                  <animateMotion
                    ref={planeAnimRef}
                    dur={`${PLANE_MS / 1000}s`}
                    begin="indefinite"
                    fill="freeze"
                    rotate="auto"
                  >
                    <mpath href="#howPath" />
                  </animateMotion>
                </g>
              </svg>
            </div>
          )}

          {STEPS.map(({ number, icon: Icon, title, description }, idx) => {
            const iconShown = phase >= idx * 2 + 1;
            const textShown = phase >= idx * 2 + 2;
            return (
            <div key={number} className="relative flex flex-col items-center text-center">
              {/* Number circle — revealed as the plane reaches this step */}
              <div
                className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 mb-6 ${reveal(
                  iconShown
                )}`}
              >
                <Icon className="w-7 h-7" />
              </div>

              {/* Context (step number, title, description) — revealed after the icon */}
              <div className={reveal(textShown)}>
                {/* Step number pill */}
                <span className="block text-xs font-bold text-indigo-600 tracking-widest uppercase mb-2">
                  Step {number}
                </span>

                <h3 className="text-xl font-bold text-slate-900 mb-3 dark:text-slate-100">
                  {title}
                </h3>

                <p className="text-sm leading-relaxed text-slate-600 max-w-xs dark:text-slate-400">
                  {description}
                </p>
              </div>

              {/* Vertical connector between steps (mobile only) */}
              {idx < STEPS.length - 1 && (
                <div
                  className="md:hidden w-0.5 h-10 mt-8 rounded-full bg-gradient-to-b from-indigo-400 to-indigo-200 dark:from-indigo-500 dark:to-indigo-500/20"
                  aria-hidden="true"
                />
              )}
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;

