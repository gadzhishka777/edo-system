// src/styles/fonts.ts
import { css } from '@emotion/react';

// Импорт шрифтов из папки assets/fonts/Lato
import LatoRegular from '../assets/Lato-Regular.ttf';
import LatoMedium from '../assets/Lato-Medium.ttf';
import LatoSemiBold from '../assets/Lato-SemiBold.ttf';
import LatoBold from '../assets/Lato-Bold.ttf';
import LatoBlack from '../assets/Lato-Black.ttf';

export const latoFonts = css`
  @font-face {
    font-family: 'Lato';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url(${LatoRegular}) format('truetype');
  }

  @font-face {
    font-family: 'Lato';
    font-style: normal;
    font-weight: 500;
    font-display: swap;
    src: url(${LatoMedium}) format('truetype');
  }

  @font-face {
    font-family: 'Lato';
    font-style: normal;
    font-weight: 600;
    font-display: swap;
    src: url(${LatoSemiBold}) format('truetype');
  }

  @font-face {
    font-family: 'Lato';
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url(${LatoBold}) format('truetype');
  }

  @font-face {
    font-family: 'Lato';
    font-style: normal;
    font-weight: 900;
    font-display: swap;
    src: url(${LatoBlack}) format('truetype');
  }
`;