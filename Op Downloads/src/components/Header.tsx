import React from 'react';
import { Download } from 'lucide-react';
import { PixelLogo } from './PixelLogo';

interface HeaderProps {
  onDownloadZip: () => void;
  isDownloading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onDownloadZip, isDownloading }) => {
  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand with Pixel Download Icon Logo */}
        <PixelLogo size="md" showText={true} />

        {/* 1-Click Download Button */}
        <button
          onClick={onDownloadZip}
          disabled={isDownloading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-900 bg-[#FFE600] hover:bg-amber-300 active:scale-95 shadow-sm transition-all disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5 text-slate-900" />
          <span>{isDownloading ? 'Packaging...' : 'Download op.downloads (.ZIP)'}</span>
        </button>
      </div>
    </header>
  );
};
