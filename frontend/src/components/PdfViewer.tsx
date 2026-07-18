import React, { useState, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import Draggable from 'react-draggable';
import {
  Box,
  Card,
  CardContent,
  IconButton,
  Typography,
  Stack,
  Button,
  Chip,
  Tooltip,
  LinearProgress,
  Alert,
  Divider,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  RestartAlt as ResetIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Download as DownloadIcon,
  DragIndicator as DragIcon,
} from '@mui/icons-material';

// ✅ Убираем настройку worker - пусть react-pdf использует свой

interface PdfViewerProps {
  fileUrl: string;
  onStampPositionChange?: (x: number, y: number, page: number) => void;
  initialStampX?: number;
  initialStampY?: number;
  currentPage?: number;
  stampText?: string;
  isValid?: boolean;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  fileUrl,
  onStampPositionChange,
  initialStampX = 100,
  initialStampY = 50,
  currentPage = 1,
  stampText = 'Документ подписан электронной подписью',
  isValid = true,
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(currentPage);
  const [scale, setScale] = useState<number>(1.0);
  const [stampX, setStampX] = useState<number>(initialStampX);
  const [stampY, setStampY] = useState<number>(initialStampY);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setStampX(initialStampX);
    setStampY(initialStampY);
  }, [initialStampX, initialStampY]);

  useEffect(() => {
    if (currentPage !== pageNumber) {
      setPageNumber(currentPage);
    }
  }, [currentPage, pageNumber]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(Math.min(currentPage, numPages));
    setLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF loading error:', error);
    setLoading(false);
  };

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.1, 2.5));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.1, 0.3));
  const handleZoomReset = () => setScale(1.0);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (numPages || 1)) {
      setPageNumber(newPage);
    }
  };

  const handleDragStop = (_e: any, data: any) => {
    setIsDragging(false);
    const newX = Math.max(0, data.x);
    const newY = Math.max(0, data.y);
    setStampX(newX);
    setStampY(newY);
    if (onStampPositionChange) {
      onStampPositionChange(newX, newY, pageNumber);
    }
  };

  const handleDownload = () => {
    window.open(fileUrl, '_blank');
  };

  const stampStyle: React.CSSProperties = {
    position: 'absolute',
    padding: '12px 16px',
    background: isValid ? 'rgba(76, 175, 80, 0.92)' : 'rgba(244, 67, 54, 0.92)',
    border: `2px solid ${isValid ? '#2e7d32' : '#c62828'}`,
    borderRadius: '6px',
    cursor: 'grab',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    zIndex: 1000,
    minWidth: '200px',
    pointerEvents: 'auto',
    userSelect: 'none',
    color: '#ffffff',
    backdropFilter: 'blur(4px)',
  };

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <CardContent sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Уменьшить">
              <span>
                <IconButton onClick={handleZoomOut} disabled={scale <= 0.3} size="small">
                  <ZoomOutIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="body2" sx={{ minWidth: 50, textAlign: 'center' }}>
              {Math.round(scale * 100)}%
            </Typography>
            <Tooltip title="Увеличить">
              <span>
                <IconButton onClick={handleZoomIn} disabled={scale >= 2.5} size="small">
                  <ZoomInIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Сбросить масштаб">
              <IconButton onClick={handleZoomReset} size="small">
                <ResetIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Divider orientation="vertical" flexItem />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Предыдущая страница">
              <span>
                <IconButton
                  onClick={() => handlePageChange(pageNumber - 1)}
                  disabled={pageNumber <= 1}
                  size="small"
                >
                  <PrevIcon />
                </IconButton>
              </span>
            </Tooltip>
            <TextField
              type="number"
              value={pageNumber}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1 && val <= (numPages || 1)) {
                  setPageNumber(val);
                }
              }}
              slotProps={{
                input: {
                  inputProps: {
                    min: 1,
                    max: numPages || 1,
                    style: { textAlign: 'center', width: 50 },
                  },
                  endAdornment: (
                    <InputAdornment position="end">/ {numPages || '?'}</InputAdornment>
                  ),
                },
              }}
              size="small"
              variant="outlined"
            />
            <Tooltip title="Следующая страница">
              <span>
                <IconButton
                  onClick={() => handlePageChange(pageNumber + 1)}
                  disabled={pageNumber >= (numPages || 1)}
                  size="small"
                >
                  <NextIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          <Box sx={{ flex: 1 }} />

          <Chip
            icon={<DragIcon />}
            label="Перетащите штамп"
            color="primary"
            variant="outlined"
            size="small"
          />

          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
            size="small"
          >
            Скачать PDF
          </Button>
        </Stack>

        <Box
          sx={{
            position: 'relative',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            minHeight: 500,
            bgcolor: 'grey.100',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {loading && (
            <Box sx={{ width: '100%', p: 2 }}>
              <LinearProgress />
              <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
                Загрузка документа...
              </Typography>
            </Box>
          )}

          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
            error={
              <Alert severity="error" sx={{ m: 2 }}>
                Не удалось загрузить PDF-документ. Проверьте, что файл доступен.
              </Alert>
            }
          >
            <Box sx={{ position: 'relative', display: 'inline-block' }}>
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={
                  <Box sx={{ p: 2 }}>
                    <LinearProgress />
                  </Box>
                }
              />

              <Draggable
                position={{ x: stampX, y: stampY }}
                onStart={() => setIsDragging(true)}
                onStop={handleDragStop}
                bounds="parent"
                grid={[2, 2]}
              >
                <div style={stampStyle}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: 20 }}>{isValid ? '✅' : '❌'}</span>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#fff' }}>
                      {stampText}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      mt: 0.5,
                      color: 'rgba(255,255,255,0.8)',
                      fontSize: 10,
                    }}
                  >
                    {isValid ? 'Подпись действительна' : 'Подпись недействительна'} • Перетащите для изменения позиции
                  </Typography>
                </div>
              </Draggable>
            </Box>
          </Document>
        </Box>

        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            Позиция штампа: X={Math.round(stampX)}px, Y={Math.round(stampY)}px
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Страница {pageNumber} из {numPages || '?'}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};