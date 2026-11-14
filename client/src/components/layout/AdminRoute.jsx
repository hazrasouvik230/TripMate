import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Route guard for admin-only pages. Unauthenticated users are sent to /login
 * (preserving their destination); authenticated non-admins are bounced to
 * their trips, since the admin area isn't theirs to see.
 */
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/trips" replace />;
  }

  return children;
};

export default AdminRoute;
