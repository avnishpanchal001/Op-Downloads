import React, { useState } from 'react';
import { Play, Check, RefreshCw, Terminal, Layers, ArrowRight } from 'lucide-react';

interface LogEntry {
  id: number;
  time: string;
  source: 'DOM' | 'POLYMER_SPA' | 'CONTENT_SCRIPT';
  message: string;
  status: 'info' | 'success' | 'warning';
}

export const SpaArchitectureExplorer: React.FC = () => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 1,
      time: '00:00.000',
      source: 'CONTENT_SCRIPT',
      message: 'content.js bound to document_start and ready for initial load',
      status: 'info'
    },
    {
      id: 2,
      time: '00:00.002',
      source: 'DOM',
      message: 'Listener registered for document: yt-navigate-finish event',
      status: 'info'
    }
  ]);

  const runSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setLogs([]);
    setActiveStep(1);

    const step1 = setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          time: '+12ms',
          source: 'DOM',
          message: 'User clicks video thumbnail: /watch?v=dQw4w9WgXcQ',
          status: 'info'
        }
      ]);
      setActiveStep(2);
    }, 400);

    const step2 = setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          time: '+35ms',
          source: 'POLYMER_SPA',
          message: 'YouTube Polymer router pushes route state: history.pushState()',
          status: 'info'
        },
        {
          id: Date.now() + 3,
          time: '+48ms',
          source: 'DOM',
          message: 'Document fires custom event: yt-navigate-finish',
          status: 'info'
        }
      ]);
      setActiveStep(3);
    }, 900);

    const step3 = setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now() + 4,
          time: '+54ms',
          source: 'CONTENT_SCRIPT',
          message: 'checkAndRewriteUrl() invoked: target route === "/watch"',
          status: 'info'
        },
        {
          id: Date.now() + 5,
          time: '+61ms',
          source: 'CONTENT_SCRIPT',
          message: 'Condition passed: !hostname.endsWith(".") && videoId !== lastRedirectedVideoId',
          status: 'success'
        }
      ]);
      setActiveStep(4);
    }, 1500);

    const step4 = setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now() + 6,
          time: '+72ms',
          source: 'CONTENT_SCRIPT',
          message: 'Executing window.location.replace("https://www.youtube.com./watch?v=dQw4w9WgXcQ")',
          status: 'success'
        },
        {
          id: Date.now() + 7,
          time: '+78ms',
          source: 'CONTENT_SCRIPT',
          message: 'State locked for videoId="dQw4w9WgXcQ". Invariant satisfied: 0 loops.',
          status: 'success'
        }
      ]);
      setActiveStep(5);
      setIsSimulating(false);
    }, 2100);
  };

  const steps = [
    {
      num: '01',
      title: 'USER INTERACTION',
      desc: 'Thumbnail clicked on Home, Search, or Channel'
    },
    {
      num: '02',
      title: 'POLYMER ROUTING',
      desc: 'Client-side pushState updates path without reload'
    },
    {
      num: '03',
      title: 'EVENT DISPATCH',
      desc: 'Document dispatches yt-navigate-finish event'
    },
    {
      num: '04',
      title: 'INVARIANT AUDIT',
      desc: 'Extension verifies trailing dot absence & new video ID'
    },
    {
      num: '05',
      title: 'ATOMIC SWAP',
      desc: 'window.location.replace() executes once and halts'
    }
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Educational Slide Header */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#0F1B2E]">
          <span className="w-3 h-3 bg-[#FFE600] border-2 border-[#0F1B2E] inline-block shadow-[1px_1px_0px_#0F1B2E]"></span>
          <span>SLIDE 02 // SINGLE-PAGE APPLICATION (SPA) EVENT ARCHITECTURE</span>
          <span className="text-[#0F1B2E]/40">·</span>
          <span className="text-[#0F1B2E]/60">CHROMIUM RUNTIME LIFECYCLE</span>
        </div>

        <h1 className="font-pixel text-xl sm:text-2xl md:text-3xl text-[#0F1B2E] font-bold tracking-wide uppercase leading-tight">
          YOUTUBE SPA STATE MACHINE
        </h1>

        <p className="text-base text-[#0F1B2E]/85 leading-relaxed font-sans max-w-3xl">
          YouTube utilizes a Polymer web-component architecture. In-app navigation bypasses standard document reloads. To achieve 100% interception coverage, the extension hooks into YouTube&apos;s custom event dispatch chain with an idempotent finite state machine.
        </p>
      </section>

      {/* Code Snippet with Yellow Marker Blocks */}
      <section className="space-y-2">
        <div className="text-xs font-mono font-bold text-[#0F1B2E]">
          EVENT LISTENER DECLARATION // MONOSPACE SNIPPET
        </div>
        <div className="bg-white border-2 border-[#0F1B2E] shadow-[4px_4px_0px_#0F1B2E] p-4 sm:p-5 font-code text-xs sm:text-sm text-[#0F1B2E] leading-relaxed">
          <div className="space-y-1">
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/40 w-6">01</span>
              <span><span className="text-[#0F1B2E]/50">// 1. Immediate execution for cold loads &amp; F5 reloads</span></span>
            </div>
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/40 w-6">02</span>
              <span className="font-bold text-blue-900">checkAndRewriteUrl</span>();
            </div>
            <div className="flex items-center pt-1">
              <span className="text-[#0F1B2E]/40 w-6">03</span>
              <span><span className="text-[#0F1B2E]/50">// 2. YouTube custom Polymer SPA navigation hook</span></span>
            </div>
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/40 w-6">04</span>
              <span>document.<span className="font-bold text-blue-900">addEventListener</span>(<span className="text-emerald-800 font-semibold">&apos;yt-navigate-finish&apos;</span>, () =&gt; &#123;</span>
            </div>
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/40 w-6">05</span>
              <span className="yellow-indent h-4 w-3.5 bg-[#FFE600] border border-[#0F1B2E] mx-1 inline-block shrink-0 shadow-[1px_1px_0px_#0F1B2E]" title="Indentation Space Anchor"></span>
              <span className="font-bold text-blue-900">checkAndRewriteUrl</span>();
            </div>
            <div className="flex items-center">
              <span className="text-[#0F1B2E]/40 w-6">06</span>
              <span>&#125;);</span>
            </div>
          </div>
        </div>
      </section>

      {/* Sequential State Flow Pipeline */}
      <section className="bg-white border-2 border-[#0F1B2E] shadow-[6px_6px_0px_#0F1B2E] p-5 sm:p-7 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b-2 border-[#0F1B2E] gap-3">
          <div>
            <div className="text-xs font-mono font-bold text-[#0F1B2E] mb-1">
              LIFECYCLE PIPELINE TRACE
            </div>
            <h2 className="font-pixel text-base text-[#0F1B2E] font-bold">
              EXECUTION STAGES
            </h2>
          </div>

          <button
            onClick={runSimulation}
            disabled={isSimulating}
            className="flex items-center gap-2 px-4 py-2 bg-[#FFE600] border-2 border-[#0F1B2E] font-mono text-xs font-bold text-[#0F1B2E] shadow-[3px_3px_0px_#0F1B2E] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-[#0F1B2E]" />
            <span>{isSimulating ? 'SIMULATING...' : 'EXECUTE SPA TRACE'}</span>
          </button>
        </div>

        {/* Pipeline Step Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {steps.map((st, i) => {
            const isCompleted = activeStep !== null && activeStep > i + 1;
            const isCurrent = activeStep === i + 1;
            return (
              <div
                key={st.num}
                className={`p-3 border-2 transition-all ${
                  isCurrent
                    ? 'bg-[#FFE600] border-[#0F1B2E] shadow-[3px_3px_0px_#0F1B2E]'
                    : isCompleted
                    ? 'bg-[#F6F3EB] border-[#0F1B2E]'
                    : 'bg-white border-[#0F1B2E]/30 text-[#0F1B2E]/60'
                }`}
              >
                <div className="font-mono text-xs font-bold text-[#0F1B2E] mb-1">
                  STAGE {st.num}
                </div>
                <div className="font-mono text-[11px] font-bold text-[#0F1B2E] leading-tight">
                  {st.title}
                </div>
                <div className="text-[10px] text-[#0F1B2E]/70 font-sans mt-1">
                  {st.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Debug Output Window */}
        <div className="border-2 border-[#0F1B2E] bg-[#F6F3EB] p-4 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-[#0F1B2E]/20 text-xs font-mono font-bold text-[#0F1B2E]">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-[#0F1B2E]" />
              <span>EVENT BUS TELEMETRY STREAM</span>
            </div>
            <span className="text-[11px] text-[#0F1B2E]/60">{logs.length} EVENTS CAPTURED</span>
          </div>

          <div className="space-y-1.5 max-h-[220px] overflow-y-auto font-mono text-xs pr-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 bg-white border border-[#0F1B2E] p-2 text-[#0F1B2E] shadow-[1px_1px_0px_#0F1B2E]"
              >
                <span className="text-[#0F1B2E]/50 text-[10px] shrink-0 pt-0.5">{log.time}</span>
                <span className="px-1.5 py-0.2 bg-[#FFE600] border border-[#0F1B2E] text-[9px] font-bold shrink-0">
                  {log.source}
                </span>
                <span className="font-medium text-xs break-all">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
