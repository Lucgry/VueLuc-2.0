import React from 'react';
import { AerolineasLogo } from './icons/AerolineasLogo';
import { JetSmartLogo } from './icons/JetSmartLogo';

export const AirlineLogo: React.FC<{ airline: string | null; size?: 'xs' | 'sm' | 'md' }> = ({ airline, size = 'md' }) => {
    if (!airline) return null;
    
    const sizeClasses = {
        xs: 'h-6 w-6', // For NextTripCard
        sm: 'h-8 w-8', // For TripCard collapsed view
        md: 'h-8 w-8'  // For TripCard expanded view
    };

    const lowerCaseAirline = airline.toLowerCase();
    
    if (lowerCaseAirline.includes('aerolineas')) {
        return <AerolineasLogo className={`${sizeClasses[size]} text-[#00A1DE]`} />;
    }
    if (lowerCaseAirline.includes('jetsmart') || lowerCaseAirline.includes('jet smart')) {
        return <JetSmartLogo className={sizeClasses[size]} />;
    }
    return <span className="text-sm font-semibold">{airline}</span>;
};
