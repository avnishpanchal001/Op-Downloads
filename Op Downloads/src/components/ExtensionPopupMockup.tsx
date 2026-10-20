import React, { useState } from 'react';
import { Sparkles, RotateCcw, Check, Terminal } from 'lucide-react';

interface ExtensionPopupMockupProps {
  redirectCount: number;
  onResetCount: () => void;
  onTriggerTestVideo: () => void;
}

export const ExtensionPopupMockup: React.FC<ExtensionPopupMockupProps> = ({
  redirectCount,
  onResetCount,
  onTriggerTestVideo
}) => {
  const [isEnabled, setIsEnabled] = useState(true);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Educational Slide Header */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#0F1B2E]">
          <span className="w-3 h-3 bg-[#FFE600] border-2 border-[#0F1B2E] inline-block shadow-[1px_1px_0px_#0F1B2E]"></span>
          <span>SLIDE 05 // POPUP BROWSER ACTION &amp; RUNTIME CONTROLS</span>
          <span className="text-[#0F1B2E]/40">·</span>
          <span className="text-[#0F1B2E]/60">MANIFEST V3 ACTION SPEC</span>
        </div>

        <h1 className="font-pixel text-xl sm:text-2xl md:text-3xl text-[#0F1B2E] font-bold tracking-wide uppercase leading-tight">
          BROWSER ACTION MOCKUP
        </h1>

        <p className="text-base text-[#0F1B2E]/85 leading-relaxed font-sans max-w-3xl">
          Direct interactive simulation of the Chromium extension popup (<code className="font-mono bg-white px-1.5 py-0.5 border border-[#0F1B2E] text-xs font-bold font-code">popup.html</code>). Provides instant telemetry inspection and global state toggling.
        </p>
      </section>

      {/* Centered Mockup Display */}
      <div className="flex flex-col items-center justify-center p-8 bg-[#F6F3EB] border-2 border-[#0F1B2E] shadow-[6px_6px_0px_#0F1B2E]">
        <div className="text-xs font-mono font-bold text-[#0F1B2E] mb-4 flex items-center gap-2">
          <span>CHROMIUM TOOLBAR // EXTENSION ACTION PREVIEW</span>
        </div>

        {/* The simulated popup container: Sharp White Box with 2px Dark Navy Borders and Retro Shadow */}
        <div className="w-[300px] bg-white border-2 border-[#0F1B2E] shadow-[6px_6px_0px_#0F1B2E] p-4 text-[#0F1B2E] select-none space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b-2 border-[#0F1B2E]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-[#FFE600] border-2 border-[#0F1B2E] flex items-center justify-center shadow-[2px_2px_0px_#0F1B2E]">
                {/* Black Pixel-Format Skip Icon */}
                <svg width="14" height="14" viewBox="0 0 14 12" style={{ imageRendering: 'pixelated' }}>
                  <rect x="1" y="2" width="1" height="8" fill="#000000" />
                  <rect x="2" y="2" width="1" height="8" fill="#000000" />
                  <rect x="3" y="3" width="1" height="6" fill="#000000" />
                  <rect x="4" y="3" width="1" height="6" fill="#000000" />
                  <rect x="5" y="4" width="1" height="4" fill="#000000" />
                  <rect x="6" y="4" width="1" height="4" fill="#000000" />
                  <rect x="7" y="5" width="1" height="2" fill="#000000" />
                  <rect x="8" y="5" width="1" height="2" fill="#000000" />
                  <rect x="10" y="2" width="1.5" height="8" fill="#000000" />
                  <rect x="11.5" y="2" width="1" height="8" fill="#000000" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-pixel text-xs font-bold text-[#0F1B2E] leading-tight">adskiper</span>
                <span className="text-[10px] font-mono text-[#0F1B2E]/60">SPEC-MV3 // ACTIVE</span>
              </div>
            </div>

            {/* Retro Toggle Switch */}
            <button
              onClick={() => setIsEnabled(!isEnabled)}
              aria-label="Toggle Extension Status"
              className={`relative inline-flex h-6 w-11 items-center border-2 border-[#0F1B2E] transition-colors ${
                isEnabled ? 'bg-[#FFE600]' : 'bg-[#ECE8DC]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform border border-[#0F1B2E] bg-white transition-transform ${
                  isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Status Banner */}
          <div className="bg-[#F6F3EB] border border-[#0F1B2E] p-2.5 flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 border border-[#0F1B2E] shrink-0 ${
                isEnabled ? 'bg-[#FFE600] animate-pulse' : 'bg-red-400'
              }`}
            />
            <div>
              <div className="font-mono text-xs font-bold text-[#0F1B2E]">
                {isEnabled ? 'SYSTEM ACTIVE // DOTTED' : 'SYSTEM PAUSED'}
              </div>
              <div className="text-[10px] text-[#0F1B2E]/70 font-sans">
                {isEnabled ? 'Atomic rewrite on video open & F5' : 'Standard YouTube URLs'}
              </div>
            </div>
          </div>

          {/* Telemetry Counter */}
          <div className="bg-[#F6F3EB] border border-[#0F1B2E] p-3 flex items-center justify-between">
            <div className="text-xs font-mono font-bold text-[#0F1B2E]/70">URLS REWRITTEN</div>
            <div className="font-code text-xl font-bold text-[#0F1B2E] bg-white px-2 py-0.5 border border-[#0F1B2E] shadow-[1px_1px_0px_#0F1B2E]">
              {redirectCount}
            </div>
          </div>

          {/* Rule Breakdown */}
          <div className="bg-white border border-[#0F1B2E] p-2.5 text-[11px] font-mono text-[#0F1B2E]/80 leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#FFE600] border border-[#0F1B2E]"></span>
              <span>Target: /watch?v=... (Long-form)</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#0F1B2E]/50">
              <span className="w-2 h-2 bg-transparent border border-[#0F1B2E]/40"></span>
              <span>Untouched: /shorts/, feeds, search</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-2 border-t border-[#0F1B2E]/30 flex items-center justify-between text-xs font-mono text-[#0F1B2E]/70">
            <span className="text-[10px]">VERSION 1.2.0</span>
            <button
              onClick={onResetCount}
              className="text-[#0F1B2E] font-bold hover:underline text-[11px]"
            >
              RESET STATS
            </button>
          </div>
        </div>

        {/* Simulator controls below mockup */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onTriggerTestVideo}
            className="flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold text-[#0F1B2E] bg-[#FFE600] border-2 border-[#0F1B2E] shadow-[3px_3px_0px_#0F1B2E] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>SIMULATE REWRITE (+1)</span>
          </button>

          <button
            onClick={onResetCount}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold text-[#0F1B2E] bg-white border-2 border-[#0F1B2E] shadow-[2px_2px_0px_#0F1B2E] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET COUNTER</span>
          </button>
        </div>
      </div>
    </div>
  );
};
