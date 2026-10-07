import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { APP_VERSION, CURRENT_CHANGELOG } from '../version';

/** Ключ в localStorage: какую версию «Что нового» пользователь уже видел. */
const SEEN_VERSION_KEY = 'edo_seen_version';

/**
 * Модальное окно «Что нового», показывается при входе один раз на версию.
 * Закрытие запоминает текущую версию, чтобы не показывать окно повторно,
 * пока не выйдет следующая версия.
 */
const WhatsNewDialog: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_VERSION_KEY) !== APP_VERSION) {
        setOpen(true);
      }
    } catch {
      /* localStorage недоступен — просто не показываем */
    }
  }, []);

  const handleClose = () => {
    try {
      localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!CURRENT_CHANGELOG) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <Box
        sx={{
          background: 'linear-gradient(135deg, #4c6ef5 0%, #5f3dc4 100%)',
          color: '#ffffff',
          px: 3,
          py: 2.5,
          position: 'relative',
        }}
      >
        <IconButton
          onClick={handleClose}
          size="small"
          sx={{ position: 'absolute', top: 8, right: 8, color: 'rgba(255,255,255,0.85)' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <RocketLaunchIcon sx={{ fontSize: 34 }} />
          <Box>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontWeight: 700, fontSize: '20px', lineHeight: 1.2 }}>
              Версия {APP_VERSION}
            </Typography>
            <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '13px', color: 'rgba(255,255,255,0.9)', mt: 0.25 }}>
              Что нового в этой версии
            </Typography>
          </Box>
        </Box>
      </Box>

      <DialogContent sx={{ pt: 2.5, pb: 1 }}>
        {CURRENT_CHANGELOG.date && (
          <Chip
            size="small"
            label={CURRENT_CHANGELOG.date}
            sx={{ mb: 1.5, fontSize: '11px', background: '#f4f4f8', color: '#87879b' }}
          />
        )}
        <List dense disablePadding>
          {CURRENT_CHANGELOG.highlights.map((item, idx) => (
            <ListItem key={idx} disableGutters alignItems="flex-start" sx={{ py: 0.75 }}>
              <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
                <CheckCircleIcon sx={{ fontSize: 18, color: '#2f9e44' }} />
              </ListItemIcon>
              <ListItemText
                disableTypography
                primary={
                  <Typography sx={{ fontFamily: 'Lato, sans-serif', fontSize: '14px', color: '#101025', lineHeight: 1.5 }}>
                    {item}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button
          variant="contained"
          onClick={handleClose}
          sx={{ fontFamily: 'Lato, sans-serif', textTransform: 'none', px: 3 }}
        >
          Понятно
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WhatsNewDialog;
