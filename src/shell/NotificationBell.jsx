// Notification bell — sits next to the user avatar in the shell.
// Realtime: subscribes to `notification.new` events and refetches.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../auth/useRealtime';
import './NotificationBell.css';

export default function NotificationBell({ onNav }) {
  const { user } = useAuth();
  const { on, connected } = useRealtime();
  const [list, setList] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.listNotifications();
      setList(r.notifications || []);
      setUnread(r.unread || 0);
    } catch {}
  }, []);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  // Re-fetch when a new notification arrives in realtime
  useEffect(() => {
    if (!user) return;
    const off = on('notification.new', () => refresh());
    return () => off?.();
  }, [user, on, refresh]);

  // Close on outside click
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!user) return null;

  const onItem = async (n) => {
    if (!n.readAt) {
      try { await api.markNotificationRead(n.id); } catch {}
    }
    if (n.link) onNav?.(n.link);
    setOpen(false);
    refresh();
  };
  const onMarkAll = async () => { await api.markAllNotificationsRead(); refresh(); };

  return (
    <div className="notif" ref={ref}>
      <button
        className={'notif__btn' + (unread > 0 ? ' has-unread' : '')}
        title={connected ? 'Notifications · live' : 'Notifications · offline'}
        onClick={() => setOpen(o => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && <span className="notif__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif__pop">
          <div className="notif__head">
            <span>Notifications</span>
            {unread > 0 && <button onClick={onMarkAll}>Mark all read</button>}
          </div>
          <div className="notif__list">
            {list.length === 0
              ? <div className="notif__empty">No notifications.</div>
              : list.map(n => (
                  <button
                    key={n.id}
                    className={'notif__item' + (n.readAt ? '' : ' is-unread')}
                    onClick={() => onItem(n)}
                  >
                    <div className="notif__title">{n.title}</div>
                    {n.body && <div className="notif__body">{n.body}</div>}
                    <div className="notif__when">{relTime(n.createdAt)}</div>
                  </button>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}

function relTime(t) {
  const sec = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}
