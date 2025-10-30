import React from 'react';

// Isotipo (cóndor) de Aerolíneas Argentinas, extraído del SVG oficial para una representación fiel.
export const AerolineasIsotipoLogo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="170 0 80 25" // Vista recortada para centrar solo el isotipo
    aria-label="Isotipo de Aerolíneas Argentinas"
    {...props}
  >
    <path
      fill="currentColor"
      d="M205.69,12.84c-10.06,1.73-23.39,2.91-33.62,6.02,8-.08,16.17-.11,24.53-.11,4.97,0,9.84,0,14.69.05,4.19,0,8.28.03,12.16.11,6.87.05,13.59.16,20.16.31-.41-2.39-2.19-5.16-7.81-5.16l-3.25-.05v.02c.91,2.14-1.33,3.52-3.28,2.45-1.02-.52-1.56-1.59-.12-2.69,1.45-1.11,3.84-2.75,5.05-3.45,4.02-2.41,3.86-6.47-1.92-6.91-13.78-1.14-38.62-2.66-47.66-3.44,6.3,4.06,15.16,5.16,23.28,7.94,5.25,1.8,2.55,4.09-2.19,4.91Z"
    />
  </svg>
);
