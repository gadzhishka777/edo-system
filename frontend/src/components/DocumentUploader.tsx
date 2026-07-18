import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Typography,
  Paper,
  Button,
  LinearProgress,
  Alert,
  Chip,
  IconButton,
  Fade,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  InsertDriveFile as FileIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

interface DocumentUploaderProps {
  onFileSelect: (file: File) => void;
  onFileRemove?: () => void;
  file?: File | null;
  maxSize?: number;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  onFileSelect,
  onFileRemove,
  file,
  maxSize = 20 * 1024 * 1024,
}) => {
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setError(null);

      if (rejectedFiles.length > 0) {
        const errors = rejectedFiles[0].errors;
        if (errors) {
          errors.forEach((err: any) => {
            if (err.code === 'file-too-large') {
              setError(`Файл слишком большой. Максимальный размер: ${maxSize / 1024 / 1024}MB`);
            } else if (err.code === 'file-invalid-type') {
              setError('Пожалуйста, загрузите PDF-файл');
            } else {
              setError(err.message || 'Ошибка загрузки файла');
            }
          });
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        const selectedFile = acceptedFiles[0];

        if (selectedFile.size > maxSize) {
          setError(`Файл слишком большой. Максимальный размер: ${maxSize / 1024 / 1024}MB`);
          return;
        }

        if (!selectedFile.type.includes('pdf') && !selectedFile.name.endsWith('.pdf')) {
          setError('Пожалуйста, загрузите PDF-файл');
          return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        const interval = setInterval(() => {
          setUploadProgress((prev) => {
            if (prev >= 100) {
              clearInterval(interval);
              return 100;
            }
            return prev + 10;
          });
        }, 100);

        setTimeout(() => {
          clearInterval(interval);
          setIsUploading(false);
          setUploadProgress(100);
          onFileSelect(selectedFile);
        }, 1000);
      }
    },
    [maxSize, onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: handleDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxSize,
    multiple: false,
  });

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onFileRemove) {
      onFileRemove();
    }
    setUploadProgress(0);
    setIsUploading(false);
    setError(null);
  };

  if (file) {
    return (
      <Fade in>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            border: '2px solid',
            borderColor: 'success.main',
            borderRadius: 2,
            bgcolor: (theme) => theme.palette.success.light + '20',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FileIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {file.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </Typography>
              </Box>
              <Chip
                icon={<CheckCircleIcon />}
                label="Загружен"
                color="success"
                size="small"
                sx={{ ml: 1 }}
              />
            </Box>
            <IconButton onClick={handleRemove} color="error" size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          {isUploading && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress
                variant="determinate"
                value={uploadProgress}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          )}
        </Paper>
      </Fade>
    );
  }

  return (
    <Box>
      <Paper
        {...getRootProps()}
        elevation={0}
        sx={{
          p: 4,
          border: '2px dashed',
          borderColor: isDragReject
            ? 'error.main'
            : isDragActive
            ? 'primary.main'
            : 'divider',
          borderRadius: 2,
          bgcolor: isDragActive
            ? (theme) => theme.palette.primary.light + '15'
            : isDragReject
            ? (theme) => theme.palette.error.light + '15'
            : (theme) => theme.palette.grey[50],
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: (theme) => theme.palette.primary.light + '10',
          },
        }}
      >
        <input {...getInputProps()} />
        <Box sx={{ textAlign: 'center' }}>
          {isUploading ? (
            <Box sx={{ py: 2 }}>
              <LinearProgress
                variant="determinate"
                value={uploadProgress}
                sx={{ height: 8, borderRadius: 4, maxWidth: 400, mx: 'auto' }}
              />
              <Typography sx={{ mt: 2, color: 'text.secondary' }}>
                Загрузка файла... {uploadProgress}%
              </Typography>
            </Box>
          ) : (
            <>
              <CloudUploadIcon
                sx={{
                  fontSize: 64,
                  color: isDragReject ? 'error.main' : 'primary.main',
                  mb: 2,
                }}
              />
              <Typography variant="h6" gutterBottom>
                {isDragActive
                  ? 'Отпустите файл для загрузки'
                  : 'Перетащите PDF-документ сюда'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                или кликните для выбора файла
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Поддерживаются PDF-файлы до {maxSize / 1024 / 1024}MB
              </Typography>
            </>
          )}
        </Box>
      </Paper>

      {error && (
        <Alert
          severity="error"
          icon={<WarningIcon />}
          sx={{ mt: 2 }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}
    </Box>
  );
};