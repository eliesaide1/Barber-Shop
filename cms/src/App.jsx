import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import Orders from './pages/Orders.jsx';
import Artists from './pages/Artists.jsx';
import Notifications from './pages/Notifications.jsx';
import CheckIns from './pages/CheckIns.jsx';
import Schedule from './pages/Schedule.jsx';
import Styles from './pages/Styles.jsx';
import Settings from './pages/Settings.jsx';
import Labels from './pages/Labels.jsx';

export default function App() {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="login-wrap">
        <div className="muted">Loading the shop…</div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/check-ins" element={<CheckIns />} />
        <Route path="/products" element={<Products />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/lookbook" element={<Styles />} />
        <Route path="/notifications" element={<Notifications />} />
        {/* Artist management is an admin-only surface. */}
        <Route path="/artists" element={isAdmin ? <Artists /> : <Navigate to="/" replace />} />
        <Route path="/labels" element={isAdmin ? <Labels /> : <Navigate to="/" replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
