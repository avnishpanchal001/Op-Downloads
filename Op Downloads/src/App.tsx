/**
 * op.downloads - Dashboard & Extension Packager
 */

import React, { useState } from 'react';
import { Header } from './components/Header';
import { PixelLogo } from './components/PixelLogo';
import { createExtensionZip, downloadBlob } from './zipExporter';
import { Check, Download, Video, Image, Gauge, ShieldCheck, Radio } from 'lucide-react';

export default function App() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleDownloadZip = async () => {
    try {
      setIsDownloading(true);
      const zipBlob = await createExtensionZip();
      downloadBlob(zipBlob, 'op-downloads-extension.zip');
      showToast('op.downloads extension downloaded! Load unpacked in Chrome.');
    } catch (err) {
      console.error(err);
      showToast('Error packaging ZIP');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-amber-300 selection:text-slate-900">
      <Header onDownloadZip={handleDownloadZip} isDownloading={isDownloading} />

      {/* Main Clean & Simple Container */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8 sm:py-12 space-y-5">
        {/* Toast */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-lg animate-in fade-in slide-in-from-bottom-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* MAIN CARD */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
          {/* Logo & Headline */}
          <div className="flex items-center justify-between">
            <PixelLogo size="lg" showText={true} />

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>v3.1.0 Ready</span>
            </div>
          </div>

          <p className="text-sm text-slate-600 font-normal leading-relaxed">
            Download any video or image on Chrome directly to PC. Features top-right hover download buttons, HLS/m3u8 stream sniffer &amp; merger, restricted media unlocker, and 1x to 10x speed controller.
          </p>

          {/* Feature Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-1">
                <Video className="w-4 h-4 text-amber-500" />
                <span>Top-Right Hover Button</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Hover over any video or image to download instantly.
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-1">
                <Radio className="w-4 h-4 text-emerald-500" />
                <span>HLS &amp; Stream Sniffer</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Sniffs .m3u8 playlists and stitches chunks into MP4.
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-1">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                <span>Restricted Media Unlocker</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Unlocks blob players, transparent shields &amp; canvas.
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-1">
                <Gauge className="w-4 h-4 text-rose-500" />
                <span>1x to 10x Speed</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Universal playback speed controller on all websites.
              </div>
            </div>
          </div>

          {/* Highlights List */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Direct PC downloads in MP4 and PNG/JPG</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>1-Click automatic stream resolver for HLS, MSE &amp; protected players</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Zero VPN required · 100% Client-side and private</span>
            </div>
          </div>

          {/* Download Action Button */}
          <button
            onClick={handleDownloadZip}
            disabled={isDownloading}
            className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-sm active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-[#FFE600]" />
            <span>{isDownloading ? 'Packaging op.downloads...' : 'Download op.downloads Extension (.ZIP)'}</span>
          </button>
        </div>

        {/* 3 SIMPLE STEPS TO INSTALL */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
            How to Install in Chrome (3 Steps)
          </div>

          <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0 text-[11px]">
                1
              </span>
              <span>
                Click <strong>Download op.downloads Extension (.ZIP)</strong> and unzip the folder (or use the existing folder on your PC).
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0 text-[11px]">
                2
              </span>
              <span>
                Open Chrome, navigate to <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-slate-900">chrome://extensions</code>, and turn on <strong>Developer mode</strong>.
              </span>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0 text-[11px]">
                3
              </span>
              <span>
                Click <strong>Load unpacked</strong> and select the <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-slate-900">extension</code> folder.
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-4 text-center text-xs text-slate-400">
        op.downloads · Universal Video &amp; Image Downloader
      </footer>
    </div>
  );
}
