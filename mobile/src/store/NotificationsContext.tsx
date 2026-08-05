import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { registerDevice, subscribeToPushMessages } from '../api/push';
import { useAuth } from './AuthContext';
import { NotificationBanner } from '../components/NotificationBanner';
import { navigate } from '../navigation/ref';
import type { AppNotification } from '../types';

interface NotificationsContextValue {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  reload: () => Promise<void>;
  markAllRead: () => Promise<void>;
  /**
   * The single delivery entry point. Socket.IO calls it today; a Firebase
   * foreground handler will call the same function, so nothing downstream has
   * to know which transport a message arrived on.
   */
  deliver: (notification: AppNotification) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<AppNotification | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await api.get<AppNotification[]>('/notifications'));
    } catch {
      /* The inbox is not worth interrupting anyone over — it refreshes on the
         next socket event or the next foreground. */
    } finally {
      setLoading(false);
    }
  }, [user]);

  /* Load on sign-in, and clear on sign-out so the next account never sees the
     previous one's messages. */
  useEffect(() => {
    if (user) reload();
    else {
      setItems([]);
      setBanner(null);
    }
  }, [user, reload]);

  /* Coming back from the background is the other moment the inbox can be
     stale — the socket was asleep while the phone was. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    return () => sub.remove();
  }, [reload]);

  const deliver = useCallback((notification: AppNotification) => {
    /* Prepend, de-duplicated: the same message can arrive twice if a socket
       event and a reload race, and later if Socket.IO and FCM both land it. */
    setItems((list) =>
      list.some((n) => n.id === notification.id)
        ? list
        : [{ ...notification, read: false }, ...list],
    );
    setBanner(notification);
  }, []);

  /* One listener for the whole app. It used to live on the Home screen, which
     meant nothing arrived until that screen had been visited — and never at
     all in the artist portal. */
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user) return undefined;
    const handler = (n: AppNotification) => deliver(n);
    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, [user, deliver]);

  /* The Firebase seam. While no adapter is installed this registers nothing
     and subscribes to nothing; once one is, foreground pushes land in exactly
     the same deliver() the socket uses, and duplicates are dropped by id. */
  useEffect(() => {
    if (!user) return undefined;
    registerDevice();
    return subscribeToPushMessages(deliver);
  }, [user, deliver]);

  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    try {
      await api.post('/notifications/read-all');
    } catch {
      /* Optimistic. The server is re-read on the next reload. */
    }
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unread: items.filter((n) => !n.read).length,
      loading,
      reload,
      markAllRead,
      deliver,
    }),
    [items, loading, reload, markAllRead, deliver],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {banner && (
        <NotificationBanner
          notification={banner}
          onPress={() => navigate('Notifications')}
          onDismiss={() => setBanner(null)}
        />
      )}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider');
  return ctx;
}
