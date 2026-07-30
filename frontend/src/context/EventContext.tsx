// src/context/EventContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export interface Event {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  timestamp: Date;
  read: boolean;
  icon?: React.ReactNode;
  action?: {
    label: string;
    handler: () => void;
  };
  link?: string;
  category?: 'document' | 'license' | 'mail' | 'signature' | 'system';
}

interface EventContextType {
  events: Event[];
  unreadCount: number;
  addEvent: (event: Omit<Event, 'id' | 'timestamp' | 'read'>) => void;
  addSuccess: (title: string, description?: string, action?: Event['action']) => void;
  addError: (title: string, description?: string) => void;
  addWarning: (title: string, description?: string, action?: Event['action']) => void;
  addInfo: (title: string, description?: string, action?: Event['action']) => void;
  markAsRead: (eventId: string) => void;
  markAllAsRead: () => void;
  deleteEvent: (eventId: string) => void;
  deleteAllEvents: () => void;
  getUnreadCount: () => number;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export const useEvents = () => {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvents must be used within an EventProvider');
  }
  return context;
};

interface EventProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'edo_events';

export const EventProvider: React.FC<EventProviderProps> = ({ children }) => {
  const [events, setEvents] = useState<Event[]>([]);

  // Загружаем события из localStorage при монтировании
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Восстанавливаем даты
        const restored = parsed.map((e: any) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
        setEvents(restored);
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки событий:', error);
    }
  }, []);

  // Сохраняем события в localStorage при изменении
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
      console.error('❌ Ошибка сохранения событий:', error);
    }
  }, [events]);

  const addEvent = useCallback((event: Omit<Event, 'id' | 'timestamp' | 'read'>) => {
    const newEvent: Event = {
      ...event,
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };
    setEvents(prev => [newEvent, ...prev]);
    return newEvent;
  }, []);

  const addSuccess = useCallback((title: string, description?: string, action?: Event['action']) => {
    addEvent({ type: 'success', title, description, action, category: 'system' });
  }, [addEvent]);

  const addError = useCallback((title: string, description?: string) => {
    addEvent({ type: 'error', title, description, category: 'system' });
  }, [addEvent]);

  const addWarning = useCallback((title: string, description?: string, action?: Event['action']) => {
    addEvent({ type: 'warning', title, description, action, category: 'system' });
  }, [addEvent]);

  const addInfo = useCallback((title: string, description?: string, action?: Event['action']) => {
    addEvent({ type: 'info', title, description, action, category: 'system' });
  }, [addEvent]);

  const markAsRead = useCallback((eventId: string) => {
    setEvents(prev => prev.map(e => 
      e.id === eventId ? { ...e, read: true } : e
    ));
  }, []);

  const markAllAsRead = useCallback(() => {
    setEvents(prev => prev.map(e => ({ ...e, read: true })));
  }, []);

  const deleteEvent = useCallback((eventId: string) => {
    setEvents(prev => prev.filter(e => e.id !== eventId));
  }, []);

  const deleteAllEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const getUnreadCount = useCallback(() => {
    return events.filter(e => !e.read).length;
  }, [events]);

  const unreadCount = getUnreadCount();

  return (
    <EventContext.Provider value={{
      events,
      unreadCount,
      addEvent,
      addSuccess,
      addError,
      addWarning,
      addInfo,
      markAsRead,
      markAllAsRead,
      deleteEvent,
      deleteAllEvents,
      getUnreadCount,
    }}>
      {children}
    </EventContext.Provider>
  );
};