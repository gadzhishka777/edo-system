/**
 * Типы данных для приложения
 */

export interface SignatureFormData {
  signer: string;
  inn: string;
  signDate: string;
  certSerial: string;
  isValid: boolean;
}

export interface StampPosition {
  x: number;
  y: number;
  page: number;
}

export interface DocumentState {
  file: File | null;
  fileUrl: string | null;
  isUploading: boolean;
  result: UploadResponse | null;
  error: string | null;
}

export interface UploadResponse {
  document_id: string;
  original_filename: string;
  signed_file_path: string;
  verification: VerificationResult;
  stamp_position: { x: number; y: number };
  created_at: string;
}

export interface VerificationResult {
  signature_valid: boolean;
  signer_name: string;
  signer_inn: string;
  signature_date: string;
  certificate_serial: string;
  hash_algorithm: string;
  verification_details: string;
}