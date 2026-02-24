import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import { getToken, getUser } from './lib/session';
import AdminDashboard from './pages/AdminDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import LoginPage from './pages/LoginPage';
import PharmacistDashboard from './pages/PharmacistDashboard';
import ReceptionistDashboard from './pages/ReceptionistDashboard';

function ProtectedRoute({ requiredRole, children }) {
  const token = getToken();
  const user = getUser();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={`/${user.role.toLowerCase()}`} replace />;
  }

  return (
    <div className="app-shell">
      <Header />
      <main className="app-content">{children}</main>
    </div>
  );
}

function HomeRedirect() {
  const token = getToken();
  const user = getUser();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={`/${user.role.toLowerCase()}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/doctor"
          element={
            <ProtectedRoute requiredRole="DOCTOR">
              <DoctorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receptionist"
          element={
            <ProtectedRoute requiredRole="RECEPTIONIST">
              <ReceptionistDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pharmacist"
          element={
            <ProtectedRoute requiredRole="PHARMACIST">
              <PharmacistDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
