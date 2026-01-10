'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, limit, where } from 'firebase/firestore';
import type { Notification } from '@/lib/types/notifications';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  loading: boolean;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  loading: true,
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const previousNotificationsRef = useRef<Set<string>>(new Set());

  // Show browser notification for new unread notifications
  const showBrowserNotification = (notification: Notification) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (notification.read) return; // Don't show notifications for already read items

    const notificationTitle = notification.title || 'PadBuddy';
    const notificationBody = notification.message || 'New notification';
    
    const notificationOptions: NotificationOptions = {
      body: notificationBody,
      icon: '/icons/rice_logo.png',
      badge: '/icons/rice_logo.png',
      tag: notification.id,
      data: {
        notificationId: notification.id,
        actionUrl: notification.actionUrl,
        fieldId: notification.fieldId,
        paddyId: notification.paddyId,
      },
      requireInteraction: false,
      silent: false,
    };

    // Show notification
    const browserNotification = new Notification(notificationTitle, notificationOptions);

    // Handle click on notification
    browserNotification.onclick = (event) => {
      event.preventDefault();
      window.focus();
      
      // Navigate to action URL if available
      if (notification.actionUrl) {
        window.location.href = notification.actionUrl;
      } else if (notification.paddyId) {
        window.location.href = `/device/${notification.paddyId}`;
      } else if (notification.fieldId) {
        window.location.href = `/field/${notification.fieldId}`;
      }
      
      browserNotification.close();
    };

    // Auto-close after 5 seconds
    setTimeout(() => {
      browserNotification.close();
    }, 5000);
  };

  useEffect(() => {
    // Don't query Firestore while auth is still loading
    if (authLoading) {
      return;
    }

    if (!user) {
      setNotifications([]);
      setLoading(false);
      previousNotificationsRef.current.clear();
      return;
    }

    // Real-time listener for notifications
    const notificationsRef = collection(db, `users/${user.uid}/notifications`);
    const q = query(
      notificationsRef,
      orderBy('createdAt', 'desc'),
      limit(50) // Get last 50 notifications
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notificationsData: Notification[] = [];
      const currentNotificationIds = new Set<string>();
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const notification: Notification = {
          id: doc.id,
          userId: user.uid,
          type: data.type,
          title: data.title,
          message: data.message,
          read: data.read || false,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          fieldId: data.fieldId,
          fieldName: data.fieldName,
          paddyId: data.paddyId,
          paddyName: data.paddyName,
          deviceId: data.deviceId,
          actionUrl: data.actionUrl,
          icon: data.icon,
        };
        
        notificationsData.push(notification);
        currentNotificationIds.add(notification.id);
        
        // Show browser notification for new unread notifications
        if (!previousNotificationsRef.current.has(notification.id) && !notification.read) {
          showBrowserNotification(notification);
        }
      });
      
      // Update previous notifications set
      previousNotificationsRef.current = currentNotificationIds;
      
      setNotifications(notificationsData);
      setLoading(false);
    }, (error) => {
      // Silently handle permission errors after signout
      if (error.code === 'permission-denied') {
        console.log('[Notifications] Permission denied (user signed out), cleaning up...');
        setNotifications([]);
        setLoading(false);
        return;
      }
      console.error('Error fetching notifications:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, authLoading]);

  const markAsRead = async (notificationId: string) => {
    if (!user) return;
    
    try {
      const notificationRef = doc(db, `users/${user.uid}/notifications/${notificationId}`);
      await updateDoc(notificationRef, { read: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    
    try {
      const unreadNotifications = notifications.filter(n => !n.read);
      const updatePromises = unreadNotifications.map(notification => {
        const notificationRef = doc(db, `users/${user.uid}/notifications/${notification.id}`);
        return updateDoc(notificationRef, { read: true });
      });
      
      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider 
      value={{ 
        notifications, 
        unreadCount, 
        markAsRead, 
        markAllAsRead, 
        loading 
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
