import { ArrowRight, Sparkles } from "lucide-react";
import Button from "../ui/Button";
import SectionHeading from "../ui/SectionHeading";

const CTA_IMAGE =
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80";

/**
 * Full-width call-to-action banner shown above the footer.
 * Phase 2: The "Get Started" button will navigate to the sign-up / trip planner flow.
 */
const CallToAction = () => {
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden bg-indigo-600">
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* Text */}
          <div className="flex-1 text-center lg:text-left">
            <span className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm font-medium text-indigo-100 mb-6">
              <Sparkles className="w-4 h-4" />
              Start for free
            </span>

            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
              Ready to Plan Your
              <br />
              Dream Vacation?
            </h2>

            <p className="mt-4 text-lg text-indigo-100 max-w-lg mx-auto lg:mx-0">
              Join thousands of travellers who plan smarter with AI. Create your
              first itinerary in under a minute.
            </p>

            {/* Phase 2: Authentication / trip planner */}
            <div className="mt-8 flex flex-wrap justify-center lg:justify-start gap-4">
              <Button
                variant="primary"
                size="lg"
                to="/register"
                className="!bg-white !text-indigo-600 hover:!bg-indigo-50 !shadow-lg !shadow-indigo-900/20"
              >
                Get Started — It's Free
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Image */}
          <div className="flex-1 max-w-md w-full">
            <div className="rounded-2xl overflow-hidden shadow-2xl shadow-indigo-900/30 rotate-2 hover:rotate-0 transition-transform duration-500">
              <img
                src={CTA_IMAGE}
                alt="Scenic travel landscape"
                className="w-full h-64 sm:h-80 object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CallToAction;

