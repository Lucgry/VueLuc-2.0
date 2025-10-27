import React from 'react';

// Una representación SVG refinada del logo de Aerolíneas Argentinas,
// diseñada para coincidir con la imagen proporcionada por el usuario.
// Utiliza `currentColor` para el relleno, permitiendo la personalización del color a través de CSS.
export const AerolineasLogo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 80" // Ajustado para proporciones correctas
    aria-label="Aerolíneas Argentinas Logo"
    {...props}
  >
    <path
      fill="currentColor"
      d="M0 56 L35 56 C85 56 110 5 155 5 L195 5 C210 5 215 15 225 30 C235 45 230 55 220 55 L215 55 C210 55 210 60 215 60 L256 60 L256 80 L0 80 Z"
    />
  </svg>
);
