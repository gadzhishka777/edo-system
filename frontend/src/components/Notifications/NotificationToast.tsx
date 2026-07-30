// src/components/Notifications/NotificationToast.tsx
import React, { useEffect } from 'react';
import { Snackbar, Alert } from '@mui/material';
import { useEvents } from '../../context/EventContext';

export const NotificationToast: React.FC = () => {
  const { events } = useEvents();
  const [open, setOpen] = React.useState(false);
  const [currentEvent, setCurrentEvent] = React.useState<any>(null);

  useEffect(() => {
    if (events.length > 0) {
      const lastEvent = events[0];
      if (!lastEvent.read) {
        setCurrentEvent(lastEvent);
        setOpen(true);
      }
    }
  }, [events]);

  const handleClose = () => {
    setOpen(false);
  };

  if (!currentEvent) return null;

  return (
    <Snackbar
      open={open}
      autoHideDuration={5000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{ mt: 7 }}
    >
      <Alert
        onClose={handleClose}
        severity={currentEvent.type}
        sx={{
          borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          minWidth: '300px',
        }}
      >
        <strong>{currentEvent.title}</strong>
        {currentEvent.description && (
          <div style={{ marginTop: 4, fontSize: '14px' }}>
            {currentEvent.description}
          </div>
        )}
      </Alert>
    </Snackbar>
  );
};