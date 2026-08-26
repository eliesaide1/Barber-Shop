import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useConnection, useSocketEvent } from '../hooks/useRealtime.js';
import { get } from '../lib/api.js';
import Icon from './Icon.jsx';

/* Below this the sidebar is an off-canvas drawer rather than a column. Kept in
   step with the 1024px breakpoint in styles.css. */
const WIDE = '(min-width: 1025px)';

const initials = (name = '') =>
  name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

function Nav({ to, icon, label, count, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`}
    >
      <Icon name={icon} />
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
  const [requests, setRequests] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
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
    try {
      setRequests((await get('/appointments/requests')).length);
    } catch {
      /* same */
    }
  };

  useEffect(() => {
    refreshBadge();
    /* Arriving somewhere is the end of using the nav. */
    setNavOpen(false);
  }, [location.pathname]);

  /* A request landing while you are on another page has to show up there —
     the whole point of the badge is that you don't have to go and look. */
  useSocketEvent('appointment:created', refreshBadge);
  useSocketEvent('appointment:status', refreshBadge);
  useSocketEvent('order:created', refreshBadge);
  useSocketEvent('order:status', refreshBadge);

  /* A drawer left open while the window grows past the breakpoint would sit
     over a layout that already has its sidebar back. */
  useEffect(() => {
    const wide = window.matchMedia(WIDE);
    const sync = (e) => e.matches && setNavOpen(false);
    wide.addEventListener('change', sync);
    return () => wide.removeEventListener('change', sync);
  }, []);

  /* Escape closes it, and the page behind must not scroll under it — the same
     contract Modal and Dialog keep. */
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  const closeNav = () => setNavOpen(false);

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar" id="cms-nav">
        <div className="brand">
          <div className="mark"><Icon name="scissors" size={20} strokeWidth={2} /></div>
          <div className="grow">
            <b>FadeRoom</b>
            <span>{isAdmin ? 'Shop admin' : artist?.chair || 'Artist'}</span>
          </div>
          <button
            type="button"
            className="iconbtn drawer-close"
            onClick={closeNav}
            aria-label="Close menu"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="navgroup">CHAIR</div>
        <Nav to="/" icon="dashboard" label="Dashboard" onNavigate={closeNav} />
        <Nav to="/schedule" icon="calendar" label="Schedule" count={requests} onNavigate={closeNav} />
        <Nav to="/check-ins" icon="qr" label="Check-in & QR" onNavigate={closeNav} />

        <div className="navgroup">SHOP</div>
        <Nav to="/products" icon="box" label="Products" onNavigate={closeNav} />
        <Nav to="/orders" icon="bag" label="Orders" count={openOrders} onNavigate={closeNav} />
        <Nav to="/lookbook" icon="image" label="Lookbook" count={pendingLooks} onNavigate={closeNav} />
        <Nav to="/notifications" icon="bell" label="Notifications" onNavigate={closeNav} />
        {isAdmin && <Nav to="/artists" icon="users" label="Artists" onNavigate={closeNav} />}
        {isAdmin && <Nav to="/labels" icon="dashboard" label="App wording" onNavigate={closeNav} />}
        <Nav to="/settings" icon="dashboard" label="Settings" onNavigate={closeNav} />

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
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button type="button" className="btn ghost sm grow" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      {navOpen && <div className="nav-backdrop" onClick={closeNav} />}

      <main className="main">
        <div className="topbar appbar">
          <button
            type="button"
            className="iconbtn navtoggle"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-controls="cms-nav"
            aria-expanded={navOpen}
          >
            <Icon name="menu" size={19} />
          </button>
          <b className="appbar-brand">FadeRoom</b>
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
