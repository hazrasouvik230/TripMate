import { Link, useLocation } from "react-router-dom";
import { Construction, ArrowLeft } from "lucide-react";
import Button from "../components/ui/Button";

/**
 * Placeholder page for routes that will be implemented in later phases.
 *
 * Phase 2  — Authentication (login, register), Trip Planner
 * Phase 3  — User dashboard, booking, blog, company pages
 */

const PHASE_MAP = {
  "/login": { label: "Log In", phase: 2 },
  "/register": { label: "Sign Up", phase: 2 },
  "/plan": { label: "Trip Planner", phase: 2 },
  "/pricing": { label: "Pricing", phase: 3 },
  "/about": { label: "About Us", phase: 3 },
  "/careers": { label: "Careers", phase: 3 },
  "/blog": { label: "Blog", phase: 3 },
  "/contact": { label: "Contact", phase: 3 },
  "/help": { label: "Help Center", phase: 3 },
  "/privacy": { label: "Privacy Policy", phase: 3 },
  "/terms": { label: "Terms of Service", phase: 3 },
  "/faq": { label: "FAQ", phase: 3 },
};

const ComingSoon = () => {
  const { pathname } = useLocation();
  const route = PHASE_MAP[pathname];
  const title = route?.label ?? "This Page";
  const phase = route?.phase ?? "a future";

  return (
    <section className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-indigo-100 text-indigo-600 mb-6 dark:bg-indigo-500/15 dark:text-indigo-400">
        <Construction className="w-10 h-10" />
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3 dark:text-slate-100">
        {title} — Coming Soon
      </h1>

      <p className="text-slate-600 max-w-md mb-8 dark:text-slate-400">
        This feature is planned for <strong>Phase {phase}</strong> of
        TripMate&nbsp;AI. We're working hard to bring it to you. Stay tuned!
      </p>

      <Button variant="outline" size="md" to="/">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Button>
    </section>
  );
};

export default ComingSoon;

