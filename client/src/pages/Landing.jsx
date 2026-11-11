import Hero from "../components/home/Hero";
import PopularDestinations from "../components/home/PopularDestinations";
import Features from "../components/home/Features";
import HowItWorks from "../components/home/HowItWorks";
import CallToAction from "../components/home/CallToAction";

const Landing = () => {
  return (
    <>
      <Hero />
      <PopularDestinations />
      <Features />
      <HowItWorks />
      <CallToAction />
    </>
  );
};

export default Landing;
