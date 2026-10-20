import React, { useState } from 'react';
import {
  FolderArchive,
  Compass,
  ToggleRight,
  FolderOpen,
  CheckCircle,
  Copy,
  Check,
  Terminal,
  BookOpen
} from 'lucide-react';

export const InstallationGuide: React.FC = () => {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copyExtensionsUrl = () => {
    navigator.clipboard.writeText('chrome://extensions');
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const steps = [
    {
      num: '01',
      title: 'DOWNLOAD & UNPACK EXTENSION ARCHIVE',
      desc: 'Download the packaged ZIP file using the button above and extract it into a local directory on your workstation (e.g. ~/op.downloads).',
      detail: (
        <div className="mt-3 p-3 bg-[#F6F3EB] border-2 border-[#0F1B2E] font-code text-xs text-[#0F1B2E]">
          <div className="text-[#0F1B2E]/50 mb-1">// Directory Structure</div>
          op.downloads/<br />
          ├── manifest.json<br />
          ├── content.js<br />
          ├── background.js<br />
          ├── injected.js<br />
          ├── popup.html<br />
          ├── popup.js<br />
          └── icons/ (icon16, icon32, icon48, icon128)
        </div>
      )
    },
    {
      num: '02',
      title: 'OPEN CHROMIUM EXTENSION DASHBOARD',
      desc: 'Navigate your browser to the internal extension management control plane.',
      detail: (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 px-3 py-2 bg-[#F6F3EB] border-2 border-[#0F1B2E] font-code text-xs text-[#0F1B2E] font-bold">
            chrome://extensions
          </div>
          <button
            onClick={copyExtensionsUrl}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold text-[#0F1B2E] bg-white border-2 border-[#0F1B2E] shadow-[2px_2px_0px_#0F1B2E] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
          >
            {copiedUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-emerald-700 font-bold">COPIED</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>COPY URL</span>
              </>
            )}
          </button>
        </div>
      )
    },
    {
      num: '03',
      title: 'TOGGLE DEVELOPER MODE',
      desc: 'In the top-right corner of the Extensions dashboard, switch Developer Mode to ON. This enables the unpacked extension loading API.',
      detail: (
        <div className="mt-3 p-3 bg-[#F6F3EB] border-2 border-[#0F1B2E] text-xs font-mono text-[#0F1B2E] flex items-center justify-between">
          <span className="font-bold">DEVELOPER MODE TOGGLE</span>
          <span className="px-2 py-0.5 bg-[#FFE600] border border-[#0F1B2E] font-bold text-[10px]">
            ENABLED [ON]
          </span>
        </div>
      )
    },
    {
      num: '04',
      title: 'CLICK "LOAD UNPACKED"',
      desc: 'Click the "Load unpacked" button in the upper-left toolbar and select the directory containing your manifest.json.',
      detail: (
        <div className="mt-3 p-3 bg-white border-2 border-[#0F1B2E] text-xs font-mono text-[#0F1B2E] shadow-[2px_2px_0px_#0F1B2E]">
          <span className="font-bold">TARGET FOLDER:</span> Select the unpacked folder root containing <code className="bg-[#FFE600] px-1 font-bold">manifest.json</code>.
        </div>
      )
    },
    {
      num: '05',
      title: 'TEST DOWNLOAD ON ANY WEBSITE',
      desc: 'Open any video or image on YouTube, Twitter, Instagram, or any site. Hover cursor over media to see the top-right download badge, or open extension popup.',
      detail: (
        <div className="mt-3 p-3 bg-emerald-50 border-2 border-emerald-900 text-xs font-mono text-emerald-950 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="font-bold">SYSTEM ACTIVE: Top-right hover buttons, HLS sniffer &amp; restricted unlocker ready!</span>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Educational Slide Header */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#0F1B2E]">
          <span className="w-3 h-3 bg-[#FFE600] border-2 border-[#0F1B2E] inline-block shadow-[1px_1px_0px_#0F1B2E]"></span>
          <span>SLIDE 04 // DEPLOYMENT MANUAL &amp; CHROMIUM UNPACKED LOADER</span>
          <span className="text-[#0F1B2E]/40">·</span>
          <span className="text-[#0F1B2E]/60">MANIFEST V3 AUDIT COMPLETE</span>
        </div>

        <h1 className="font-pixel text-xl sm:text-2xl md:text-3xl text-[#0F1B2E] font-bold tracking-wide uppercase leading-tight">
          DEPLOYMENT PROTOCOL
        </h1>

        <p className="text-base text-[#0F1B2E]/85 leading-relaxed font-sans max-w-3xl">
          Standardized step-by-step procedure to load the extension into any Chromium-based desktop browser (Google Chrome, Microsoft Edge, Brave, Opera, Arc).
        </p>
      </section>

      {/* Scannable Textbook Steps */}
      <section className="space-y-4">
        {steps.map((st) => (
          <div
            key={st.num}
            className="bg-white border-2 border-[#0F1B2E] shadow-[4px_4px_0px_#0F1B2E] p-5 space-y-2"
          >
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 bg-[#FFE600] border-2 border-[#0F1B2E] flex items-center justify-center font-mono font-bold text-sm text-[#0F1B2E] shadow-[2px_2px_0px_#0F1B2E] shrink-0">
                {st.num}
              </span>
              <div className="flex-1">
                <h3 className="font-mono text-sm font-bold text-[#0F1B2E] tracking-tight">
                  {st.title}
                </h3>
                <p className="text-sm text-[#0F1B2E]/80 font-sans mt-0.5 leading-relaxed">
                  {st.desc}
                </p>
                {st.detail}
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};
