import React from 'react';

// A representation of the 'JS' logo provided by the user.
export const JetSmartLogo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    aria-label="JetSmart Logo"
    {...props}
  >
    <g fill="none" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round">
      {/* Blue 'S' Path - rendered first to be in the background */}
      <path
        d="M 75 18 C 50 18, 50 49, 75 49 C 100 49, 100 80, 75 80"
        stroke="#163966"
      />
      {/* Red 'J' Path - rendered second to overlap the 'S' */}
      <path
        d="M 55 9 V 55 C 55 80, 25 80, 25 55"
        stroke="#ac2430"
      />
    </g>
  </svg>
);