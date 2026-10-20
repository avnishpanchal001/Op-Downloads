import React, { useState, useId } from 'react';
import { evaluateYouTubeUrl, RewriteResult } from '../rewriterEngine';
import {
  Check,
  Copy,
  Terminal,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  BookOpen,
  Cpu
} from 'lucide-react';

interface UrlSimulatorProps {
  onUrlTransformed?: () => void;
}

const PRESET_SCENARIOS = [
  {
    label: 'Standard Long Video',
    category: 'Watch Route',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  },
  {
    label: 'Music Video with Timestamp',
    category: 'Watch Route',
    url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ&t=45s'
  },
  {
    label: 'Gaming Stream VOD',
    category: 'Watch Route',
    url: 'https://www.youtube.com/watch?v=1La4QzGeaaQ'
  },
  {
    label: 'Already Dotted (RFC FQDN)',
    category: 'Loop Guard',
    url: 'https://www.youtube.com./watch?v=dQw4w9WgXcQ'
  },
  {
    label: 'YouTube Short',
    category: 'Excluded Route',
    url: 'https://www.youtube.com/shorts/5v847Hw'
  },
  {
    label: 'Channel Home Profile',
    category: 'Excluded Route',
    url: 'https://www.youtube.com/@mkbhd'
  },
  {
    label: 'Search Query Listing',
    category: 'Excluded Route',
    url: 'https://www.youtube.com/results?search_query=lofi+beats'
  },
  {
    label: 'Embedded Video Player',
    category: 'Excluded Route',
    url: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
  }
];

export const UrlSimulator: React.FC<UrlSimulatorProps> = ({ onUrlTransformed }) => {
  const [inputUrl, setInputUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [activeTokenVideoId, setActiveTokenVideoId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputId = useId();

  const currentResult = evaluateYouTubeUrl(inputUrl, activeTokenVideoId);

  const handleApplyPreset = (url: string) => {
    setInputUrl(url);
    const evaluated = evaluateYouTubeUrl(url, activeTokenVideoId);
    if (evaluated.decision === 'TRANSFORMED') {
      setActiveTokenVideoId(evaluated.videoParam);
      if (onUrlTransformed) onUrlTransformed();
    }
  };

  const handleExecuteRewrite = () => {
    if (currentResult.decision === 'TRANSFORMED' && currentResult.videoParam) {
      setActiveTokenVideoId(currentResult.videoParam);
      if (onUrlTransformed) onUrlTransformed();
    }
  };

  const handleResetToken = () => {
    setActiveTokenVideoId(null);
  };

  const handleCopyTarget = () => {
    if (currentResult.targetUrl) {
      navigator.clipboard.writeText(currentResult.targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* ============================================================== */}
      {/* 1. EDUCATIONAL SLIDE HERO: RETRO-MODERN TECH AESTHETIC       */}
      {/* ============================================================== */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#0F1B2E]">
          <span className="w-3 h-3 bg-[#FFE600] border-2 border-[#0F1B2E] inline-block shadow-[1px_1px_0px_#0F1B2E]"></span>
          <span>SLIDE 01 // COMPUTER SCIENCE PRINCIPLES</span>
          <span className="text-[#0F1B2E]/40">·</span>
          <span className="text-[#0F1B2E]/60">RFC 1034 §3.1 &amp; CHROMIUM ORIGIN MODEL</span>
        </div>

        {/* Prominent Header in blocky, dark navy pixelated display font */}
        <h1 className="font-pixel text-xl sm:text-2xl md:text-3xl lg:text-4xl text-[#0F1B2E] font-bold tracking-wide uppercase leading-tight">
          THE TRAILING-DOT MECHANISM
        </h1>

        {/* Clean, highly legible modern sans-serif body copy */}
        <p className="text-base sm:text-lg text-[#0F1B2E]/85 leading-relaxed font-sans max-w-3xl">
          In Internet Engineering RFC 1034, a trailing dot (<code className="font-mono bg-white px-1.5 py-0.5 border border-[#0F1B2E] text-xs font-bold font-code">.</code>) specifies an absolute Fully Qualified Domain Name (FQDN) evaluated against the DNS root zone. While modern browser security models partition storage and service workers under distinct origin boundaries, network routing converges on identical edge CDN nodes.
        </p>
      </section>

      {/* ============================================================== */}
      {/* 2. SPECIFIC CODE SNIPPET AREA WITH BRIGHT YELLOW MARKER BLOCKS  */}
      {/* ============================================================== */}
      <section className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-[#0F1B2E] font-bold">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#0F1B2E]" />
            <span>CORE SPECIFICATION: INVARIANT EXECUTION LOGIC</span>
          </div>
          <span className="text-[11px] text-[#0F1B2E]/60 uppercase">
            [YELLOW BLOCKS = INDENTATION ANCHORS]
          </span>
        </div>

        {/* Sharp, white rectangular box container with solid drop shadow */}
        <div className="bg-white border-2 border-[#0F1B2E] shadow-[6px_6px_0px_#0F1B2E] p-4 sm:p-6 font-code text-xs sm:text-sm text-[#0F1B2E] leading-relaxed overflow-x-auto">
          <div className="text-[11px] text-[#0F1B2E]/40 pb-3 mb-3 border-b border-[#0F1B2E]/20 flex items-center justify-between font-mono">
            <span>FILE: content.js // RUN_AT: DOCUMENT_START</span>
            <span>SPEC: MV3_SINGLE_PASS</span>
          </div>

          <div className="space-y-1.5 select-text">
            <div>
              <span className="text-[#0F1B2E]/50">01</span>{' '}
              <span className="font-bold text-[#0F1B2E]">function</span>{' '}
              <span className="font-bold text-blue-900">evaluateAndRewriteUrl</span>() &#123;
            </div>

            {/* Line with yellow marker block on 1st level indent */}
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/50 w-6">02</span>
              <span className="yellow-indent h-4 w-3.5 bg-[#FFE600] border border-[#0F1B2E] mx-1 inline-block shrink-0 shadow-[1px_1px_0px_#0F1B2E]" title="Indentation Space Anchor"></span>
              <span><span className="font-bold text-red-900">if</span> (window.location.pathname !== <span className="text-emerald-800 font-semibold">&apos;/watch&apos;</span>) <span className="font-bold text-red-900">return</span>; <span className="text-[#0F1B2E]/45">// Exclude Shorts, channels, feeds</span></span>
            </div>

            {/* Line with yellow marker block on 1st level indent */}
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/50 w-6">03</span>
              <span className="yellow-indent h-4 w-3.5 bg-[#FFE600] border border-[#0F1B2E] mx-1 inline-block shrink-0 shadow-[1px_1px_0px_#0F1B2E]" title="Indentation Space Anchor"></span>
              <span><span className="font-bold text-red-900">if</span> (window.location.hostname.endsWith(<span className="text-emerald-800 font-semibold">&apos;.&apos;</span>)) <span className="font-bold text-red-900">return</span>; <span className="text-[#0F1B2E]/45">// Invariant: Loop termination</span></span>
            </div>

            {/* Line with yellow marker block on 1st level indent */}
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/50 w-6">04</span>
              <span className="yellow-indent h-4 w-3.5 bg-[#FFE600] border border-[#0F1B2E] mx-1 inline-block shrink-0 shadow-[1px_1px_0px_#0F1B2E]" title="Indentation Space Anchor"></span>
              <span><span className="font-bold text-[#0F1B2E]">const</span> videoId = <span className="font-bold text-[#0F1B2E]">new</span> URL(window.location.href).searchParams.get(<span className="text-emerald-800 font-semibold">&apos;v&apos;</span>);</span>
            </div>

            {/* Line with yellow marker block on 1st level indent */}
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/50 w-6">05</span>
              <span className="yellow-indent h-4 w-3.5 bg-[#FFE600] border border-[#0F1B2E] mx-1 inline-block shrink-0 shadow-[1px_1px_0px_#0F1B2E]" title="Indentation Space Anchor"></span>
              <span><span className="font-bold text-red-900">if</span> (!videoId || lastRedirectedVideoId === videoId) <span className="font-bold text-red-900">return</span>; <span className="text-[#0F1B2E]/45">// Single-shot per video</span></span>
            </div>

            {/* Line with 2 yellow marker blocks on 2nd level indent */}
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/50 w-6">06</span>
              <span className="yellow-indent h-4 w-3.5 bg-[#FFE600] border border-[#0F1B2E] mx-1 inline-block shrink-0 shadow-[1px_1px_0px_#0F1B2E]"></span>
              <span>lastRedirectedVideoId = videoId;</span>
            </div>

            {/* Line with yellow marker block on 1st level indent */}
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/50 w-6">07</span>
              <span className="yellow-indent h-4 w-3.5 bg-[#FFE600] border border-[#0F1B2E] mx-1 inline-block shrink-0 shadow-[1px_1px_0px_#0F1B2E]"></span>
              <span><span className="font-bold text-[#0F1B2E]">const</span> target = <span className="font-bold text-[#0F1B2E]">new</span> URL(window.location.href);</span>
            </div>

            <div className="flex items-center">
              <span className="text-[#0F1B2E]/50 w-6">08</span>
              <span className="yellow-indent h-4 w-3.5 bg-[#FFE600] border border-[#0F1B2E] mx-1 inline-block shrink-0 shadow-[1px_1px_0px_#0F1B2E]"></span>
              <span>target.hostname = target.hostname + <span className="text-emerald-800 font-semibold">&apos;.&apos;</span>; <span className="text-[#0F1B2E]/45">// FQDN append</span></span>
            </div>

            <div className="flex items-center">
              <span className="text-[#0F1B2E]/50 w-6">09</span>
              <span className="yellow-indent h-4 w-3.5 bg-[#FFE600] border border-[#0F1B2E] mx-1 inline-block shrink-0 shadow-[1px_1px_0px_#0F1B2E]"></span>
              <span>window.location.replace(target.toString()); <span className="text-[#0F1B2E]/45">// Atomic history swap</span></span>
            </div>

            <div>
              <span className="text-[#0F1B2E]/50">10</span> &#125;
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 3. TEXTBOOK-STYLE RULES IN SCANNABLE FORMAT                   */}
      {/* ============================================================== */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Rule 1 */}
        <div className="bg-white border-2 border-[#0F1B2E] p-4 shadow-[4px_4px_0px_#0F1B2E] space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-[#FFE600] border border-[#0F1B2E] text-[10px] font-mono font-bold">
              RULE 01
            </span>
            <span className="font-mono text-xs font-bold text-[#0F1B2E]">ROOT ZONE DELIMITER</span>
          </div>
          <p className="text-xs text-[#0F1B2E]/80 leading-relaxed font-sans">
            Only long-form watch requests (<code className="font-mono font-bold">/watch?v=...</code>) are eligible. Shorts, channel feeds, and search result paths are left completely untouched.
          </p>
        </div>

        {/* Rule 2 */}
        <div className="bg-white border-2 border-[#0F1B2E] p-4 shadow-[4px_4px_0px_#0F1B2E] space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-[#FFE600] border border-[#0F1B2E] text-[10px] font-mono font-bold">
              RULE 02
            </span>
            <span className="font-mono text-xs font-bold text-[#0F1B2E]">SINGLE-PASS PER VIDEO</span>
          </div>
          <p className="text-xs text-[#0F1B2E]/80 leading-relaxed font-sans">
            The active video ID is verified against the session state. Exactly one redirect executes per video navigation, permanently preventing circular 301 loop bounces.
          </p>
        </div>

        {/* Rule 3 */}
        <div className="bg-white border-2 border-[#0F1B2E] p-4 shadow-[4px_4px_0px_#0F1B2E] space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-[#FFE600] border border-[#0F1B2E] text-[10px] font-mono font-bold">
              RULE 03
            </span>
            <span className="font-mono text-xs font-bold text-[#0F1B2E]">POLYMER SPA BINDING</span>
          </div>
          <p className="text-xs text-[#0F1B2E]/80 leading-relaxed font-sans">
            Listens on <code className="font-mono font-bold">yt-navigate-finish</code> to detect in-app dynamic clicks between videos, guaranteeing flawless execution on YouTube&apos;s router.
          </p>
        </div>
      </section>

      {/* ============================================================== */}
      {/* 4. INTERACTIVE SIMULATOR WORKBENCH                            */}
      {/* ============================================================== */}
      <section className="bg-white border-2 border-[#0F1B2E] shadow-[6px_6px_0px_#0F1B2E] p-5 sm:p-7 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b-2 border-[#0F1B2E] gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#0F1B2E] mb-1">
              <span className="w-2.5 h-2.5 bg-[#FFE600] border border-[#0F1B2E]"></span>
              <span>INTERACTIVE REWRITER SIMULATOR</span>
            </div>
            <h2 className="font-pixel text-base sm:text-lg text-[#0F1B2E] font-bold tracking-wide">
              EVALUATE TARGET URL
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-[#F6F3EB] border border-[#0F1B2E] text-xs font-mono font-bold text-[#0F1B2E]">
              SESSION TOKEN: {activeTokenVideoId ? activeTokenVideoId : 'READY'}
            </div>
            {activeTokenVideoId && (
              <button
                onClick={handleResetToken}
                className="px-2.5 py-1.5 bg-white border border-[#0F1B2E] hover:bg-[#FFE600] text-xs font-mono font-bold transition-colors shadow-[1px_1px_0px_#0F1B2E]"
              >
                RESET
              </button>
            )}
          </div>
        </div>

        {/* Preset Selector Grid */}
        <div className="space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#0F1B2E]">
            SELECT TEST PRESET:
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_SCENARIOS.map((preset) => {
              const isSelected = inputUrl === preset.url;
              return (
                <button
                  key={preset.label}
                  onClick={() => handleApplyPreset(preset.url)}
                  className={`text-left p-2.5 border-2 text-xs transition-all ${
                    isSelected
                      ? 'bg-[#FFE600] border-[#0F1B2E] text-[#0F1B2E] font-bold shadow-[2px_2px_0px_#0F1B2E]'
                      : 'bg-white border-[#0F1B2E]/60 text-[#0F1B2E] hover:border-[#0F1B2E] hover:bg-[#F6F3EB]'
                  }`}
                >
                  <div className="font-mono text-[11px] leading-tight truncate">{preset.label}</div>
                  <div className="text-[10px] font-mono text-[#0F1B2E]/60 mt-0.5 truncate">
                    {preset.category}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Input Bar */}
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="block text-xs font-mono font-bold text-[#0F1B2E]">
            RAW INPUT URL STRING:
          </label>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-3.5 py-2.5 bg-[#F6F3EB] border-2 border-[#0F1B2E] text-[#0F1B2E] font-mono text-xs focus:outline-none focus:bg-white transition-all shadow-[inset_2px_2px_0px_rgba(0,0,0,0.05)]"
            />
            {currentResult.decision === 'TRANSFORMED' && (
              <button
                onClick={handleExecuteRewrite}
                className="px-4 py-2.5 bg-[#FFE600] border-2 border-[#0F1B2E] font-mono text-xs font-bold text-[#0F1B2E] shadow-[2px_2px_0px_#0F1B2E] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all whitespace-nowrap"
              >
                APPLY REWRITE
              </button>
            )}
          </div>
        </div>

        {/* Transformation Visualizer */}
        <div className="border-2 border-[#0F1B2E] bg-[#F6F3EB] p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#0F1B2E]/30 text-xs font-mono font-bold">
            <span>DECISION RESULT:</span>
            <span
              className={`px-2 py-0.5 border ${
                currentResult.decision === 'TRANSFORMED'
                  ? 'bg-emerald-200 border-emerald-900 text-emerald-950'
                  : currentResult.decision === 'LOOP_GUARD_SKIPPED' || currentResult.decision === 'ONE_SHOT_HALTED'
                  ? 'bg-blue-200 border-blue-900 text-blue-950'
                  : 'bg-amber-200 border-amber-900 text-amber-950'
              }`}
            >
              {currentResult.decision}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Input state */}
            <div className="bg-white border-2 border-[#0F1B2E] p-3 space-y-1">
              <div className="text-[10px] font-mono uppercase text-[#0F1B2E]/60 font-bold">
                Original Input URL
              </div>
              <div className="font-mono text-xs text-[#0F1B2E] break-all select-all font-medium">
                {currentResult.rawUrl || '—'}
              </div>
            </div>

            {/* Transformed state */}
            <div className="bg-white border-2 border-[#0F1B2E] p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase font-bold text-[#0F1B2E]/60">
                <span>Resulting Target (FQDN)</span>
                {currentResult.targetUrl && (
                  <button
                    onClick={handleCopyTarget}
                    className="flex items-center gap-1 text-[#0F1B2E] hover:underline"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-700" />
                        <span className="text-emerald-700 font-bold">COPIED</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>COPY</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="font-mono text-xs break-all select-all">
                {currentResult.decision === 'TRANSFORMED' ? (
                  <span className="font-bold text-[#0F1B2E]">
                    https://www.youtube.com
                    <span className="bg-[#FFE600] border border-[#0F1B2E] px-1 font-extrabold mx-0.5">
                      .
                    </span>
                    /watch?v={currentResult.videoParam}
                    {currentResult.targetUrl.split('/watch?v=' + currentResult.videoParam)[1] || ''}
                  </span>
                ) : (
                  <span className="text-[#0F1B2E]/70">{currentResult.targetUrl || '—'}</span>
                )}
              </div>
            </div>
          </div>

          {/* Diagnostic status line */}
          <div className="text-xs font-mono text-[#0F1B2E] bg-white border border-[#0F1B2E] p-2.5 leading-relaxed">
            <span className="font-bold text-[#0F1B2E]">SPECIFICATION EVALUATION:</span>{' '}
            {currentResult.reason}
          </div>
        </div>
      </section>
    </div>
  );
};
