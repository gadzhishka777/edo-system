import React from 'react';

interface KndLogoProps {
  /** Высота знака в пикселях; ширина считается пропорционально. */
  size?: number;
  /** Цвет заливки знака. */
  color?: string;
}

/**
 * Знак модуля «ТОР Контроль».
 *
 * Временная векторная заглушка. Когда появится официальный логотип —
 * положить файл в `frontend/public/` и заменить содержимое на
 * `<img src="/knd-logo.svg" alt="ТОР Контроль" height={size} />`.
 */
const KndLogo: React.FC<KndLogoProps> = ({ size = 92, color = '#ffffff' }) => (
  <svg
    width={(size * 96) / 104}
    height={size}
    viewBox="0 0 96 104"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="ТОР Контроль"
  >
    {/* Верхняя планка и «щит» — знак контрольной деятельности */}
    <rect x="0" y="0" width="96" height="18" fill={color} />
    <path d="M0 30H96V58L48 104L0 58V30Z" fill={color} />
  </svg>
);

export default KndLogo;
