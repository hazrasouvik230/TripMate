import Navbar from "./Navbar";
import Footer from "./Footer";
import AiChatbot from "../ai/AiChatbot";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Top-level page layout: Navbar + scrollable content + Footer.
 * Wrap every page inside <Layout> via the router.
 *
 * The floating "Ask TripMate AI" assistant is mounted here so it's available
 * on every page (for signed-in users).
 */
const Layout = ({ children }) => {
  const { user } = useAuth();
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      {user && <AiChatbot />}
    </div>
  );
};

export default Layout;
