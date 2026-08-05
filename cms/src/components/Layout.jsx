import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useConnection, useSocketEvent } from '../hooks/useRealtime.js';
import { get } from '../lib/api.js';

const initials = (name = '') =>
  name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

function Nav({ to, icon, label, count }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}>
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
      {count > 0 && <span className="count">{count}</span>}
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, artist, isAdmin, signOut } = useAuth();
  const connected = useConnection();
  const location = useLocation();
  const [openOrders, setOpenOrders] = useState(0);
  const [pendingLooks, setPendingLooks] = useState(0);
  const [theme, setTheme] = useState(
    () => localStorage.getItem('faderoom.cms.theme') || 'dark',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('faderoom.cms.theme', theme);
  }, [theme]);

  const refreshBadge = async () => {
    try {
      const list = await get('/orders/manage/list?open=true');
      setOpenOrders(list.length);
    } catch {
      /* the badge is decoration — never break the shell over it */
    }
    try {
      const looks = await get('/styles/mine');
      setPendingLooks(looks.filter((l) => l.status === 'pending').length);
    } catch {
      /* same */
    }
  };

  useEffect(() => {
    refreshBadge();
  }, [location.pathname]);

  useSocketEvent('order:created', refreshBadge);
  useSocketEvent('order:status', refreshBadge);
  useSocketEvent('style:changed', refreshBadge);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">✂</div>
          <div>
            <b>FadeRoom</b>
            <span>{isAdmin ? 'Shop admin' : artist?.chair || 'Artist'}</span>
          </div>
        </div>

        <div className="navgroup">CHAIR</div>
        <Nav to="/" icon="◧" label="Dashboard" />
        <Nav to="/schedule" icon="▤" label="Schedule" />
        <Nav to="/check-ins" icon="▣" label="Check-in & QR" />

        <div className="navgroup">SHOP</div>
        <Nav to="/products" icon="▦" label="Products" />
        <Nav to="/orders" icon="🛍" label="Orders" count={openOrders} />
        <Nav to="/lookbook" icon="🖼" label="Lookbook" count={pendingLooks} />
        <Nav to="/notifications" icon="✦" label="Notifications" />
        {isAdmin && <Nav to="/artists" icon="◍" label="Artists" />}

        <div className="spacer" />

        <div className="row" style={{ padding: '10px 8px', gap: 9 }}>
          <div className="avatar">{initials(user.name)}</div>
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{user.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>{user.role}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn ghost sm grow"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
          <button type="button" className="btn ghost sm grow" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="grow" />
          <div className={`live ${connected ? 'on' : ''}`}>
            <i />
            {connected ? 'Live' : 'Reconnecting…'}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
