import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import Artists from './pages/Artists.jsx';
import Notifications from './pages/Notifications.jsx';
import CheckIns from './pages/CheckIns.jsx';
import Schedule from './pages/Schedule.jsx';
import Styles from './pages/Styles.jsx';
import Settings from './pages/Settings.jsx';
import Labels from './pages/Labels.jsx';
import DeleteAccount from './pages/DeleteAccount.jsx';

export default function App() {
  const { user, loading, isAdmin } = useAuth();
  const { pathname } = useLocation();

  /* The one public page, and it has to be answered before anything else on the
     way in: Google Play requires an account-deletion URL that works with no app
     installed and nobody signed in, which means it cannot sit behind the
     sign-in gate below — nor behind the loading state, which waits on a session
     lookup that a visitor here has no reason to have. Render already rewrites
     every unknown path to index.html, so this URL needs nothing on the server. */
  if (pathname === '/delete-account') return <DeleteAccount />;

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
