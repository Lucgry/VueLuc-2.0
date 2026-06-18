import React from 'react';
import { AerolineasLogo } from './icons/AerolineasLogo';
import { JetSmartLogo } from './icons/JetSmartLogo';

interface AirlineLogoProps {
  airline: string | null;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  type?: 'full' | 'isotipo';
}


export const AirlineLogo: React.FC<AirlineLogoProps> = ({ airline, size = 'md', className = '', type = 'full' }) => {
    if (!airline) return null;
    
    // Further reduced sizes for a more compact look
    const heightClasses = {
        xs: 'h-4', // 16px
        sm: 'h-5', // 20px
        md: 'h-5'  // 20px
    };

    const normalizedAirline = airline
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    
    if (normalizedAirline.includes('aerolineas')) {
        const combinedClassName = `${heightClasses[size]} w-auto ${className}`;
        // AerolineasLogo now contains the 'condor' isotipo, so it's used for all cases.
        return <AerolineasLogo className={`${combinedClassName} text-[#00A1DE]`} />;
    }
    
    if (normalizedAirline.includes('jetsmart') || normalizedAirline.includes('jet smart')) {
        // Further reduced sizes for visual consistency with Aerolineas
        const sizeClasses = {
            xs: 'h-4 w-4', // 16px
            sm: 'h-5 w-5', // 20px
            md: 'h-5 w-5'  // 20px
        };
        const combinedClassName = `${sizeClasses[size]} ${className}`;
        return <JetSmartLogo className={combinedClassName} />;
    }

    // Fallback para otras aerolíneas
    return <span className={`text-sm font-semibold ${className}`}>{airline}</span>;
};
