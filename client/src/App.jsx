import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/layout/Layout";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import AdminRoute from "./components/layout/AdminRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ComingSoon from "./pages/ComingSoon";
import TripsList from "./pages/trips/TripsList";
import TripCreate from "./pages/trips/TripCreate";
import TripEdit from "./pages/trips/TripEdit";
import TripDetails from "./pages/trips/TripDetails";
import MapPage from "./pages/trips/MapPage";
import BudgetDashboard from "./pages/trips/BudgetDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";

const App = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Layout>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected — Trips */}
            <Route
              path="/trips"
              element={
                <ProtectedRoute>
                  <TripsList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trips/new"
              element={
                <ProtectedRoute>
                  <TripCreate />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trips/:tripId"
              element={
                <ProtectedRoute>
                  <TripDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trips/:tripId/edit"
              element={
                <ProtectedRoute>
                  <TripEdit />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trips/:tripId/map"
              element={
                <ProtectedRoute>
                  <MapPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trips/:tripId/budget"
              element={
                <ProtectedRoute>
                  <BudgetDashboard />
                </ProtectedRoute>
              }
            />

            {/* Admin only */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />

            {/* Protected (Phase 2+) */}
            <Route
              path="/plan"
              element={
                <ProtectedRoute>
                  <ComingSoon />
                </ProtectedRoute>
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<ComingSoon />} />
          </Routes>
            </Layout>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App;
