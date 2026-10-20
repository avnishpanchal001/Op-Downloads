import React from 'react';

interface PixelLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export const PixelLogo: React.FC<PixelLogoProps> = ({ size = 'md', showText = true }) => {
  const dimensions = {
    sm: { box: 'w-7 h-7', svg: 16, text: 'text-sm' },
    md: { box: 'w-9 h-9', svg: 20, text: 'text-lg' },
    lg: { box: 'w-14 h-14', svg: 32, text: 'text-2xl' }
  }[size];

  return (
    <div className="flex items-center gap-2.5">
      {/* Yellow Logo Badge */}
      <div
        className={`${dimensions.box} rounded-xl bg-[#FFE600] flex items-center justify-center shadow-sm border border-slate-900/15 shrink-0 select-none`}
      >
        {/* Pixel Download Icon (Arrow into Tray) */}
        <svg
          width={dimensions.svg}
          height={dimensions.svg}
          viewBox="0 0 12 12"
          className="shape-rendering-crispEdges"
          style={{ imageRendering: 'pixelated' }}
        >
          {/* Arrow Stem */}
          <rect x="4" y="0" width="4" height="4" fill="#0F172A" />
          {/* Arrow Head */}
          <rect x="1" y="4" width="10" height="1" fill="#0F172A" />
          <rect x="2" y="5" width="8" height="1" fill="#0F172A" />
          <rect x="3" y="6" width="6" height="1" fill="#0F172A" />
          <rect x="4" y="7" width="4" height="1" fill="#0F172A" />
          {/* Bottom Tray */}
          <rect x="0" y="9" width="2" height="2" fill="#0F172A" />
          <rect x="10" y="9" width="2" height="2" fill="#0F172A" />
          <rect x="0" y="10" width="12" height="2" fill="#0F172A" />
        </svg>
      </div>

      {showText && (
        <span className={`font-black tracking-tight text-slate-900 ${dimensions.text}`}>
          op.downloads
        </span>
      )}
    </div>
  );
};
