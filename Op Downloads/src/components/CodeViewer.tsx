import React, { useState } from 'react';
import { Copy, Check, Download, FileCode, FileJson, FileText, Terminal, BookOpen } from 'lucide-react';
import { EXTENSION_FILES, ExtensionFile } from '../extensionData';
import { downloadBlob } from '../zipExporter';

export const CodeViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<ExtensionFile>(EXTENSION_FILES[1]); // default to content.js
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSingleFile = () => {
    const blob = new Blob([selectedFile.content], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, selectedFile.name);
  };

  const lines = selectedFile.content.split('\n');

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Educational Slide Header */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#0F1B2E]">
          <span className="w-3 h-3 bg-[#FFE600] border-2 border-[#0F1B2E] inline-block shadow-[1px_1px_0px_#0F1B2E]"></span>
          <span>SLIDE 03 // COMPLETE SOURCE CODE ARTIFACTS</span>
          <span className="text-[#0F1B2E]/40">·</span>
          <span className="text-[#0F1B2E]/60">MANIFEST V3 RUNTIME SPECIFICATION</span>
        </div>

        <h1 className="font-pixel text-xl sm:text-2xl md:text-3xl text-[#0F1B2E] font-bold tracking-wide uppercase leading-tight">
          SOURCE CODE REPOSITORY
        </h1>

        <p className="text-base text-[#0F1B2E]/85 leading-relaxed font-sans max-w-3xl">
          Clean, production-grade source code conforming strictly to Manifest V3 requirements. Every routine is annotated with algorithmic guarantees to preserve history integrity and prevent cyclic execution.
        </p>
      </section>

      {/* Code Viewer Container */}
      <div className="bg-white border-2 border-[#0F1B2E] shadow-[6px_6px_0px_#0F1B2E] space-y-0">
        {/* File Tabs as Sharp Textbook Segmented Tabs */}
        <div className="flex items-center overflow-x-auto bg-[#ECE8DC] border-b-2 border-[#0F1B2E] px-2 pt-2 gap-1 scrollbar-none">
          {EXTENSION_FILES.map((file) => {
            const isCurrent = file.name === selectedFile.name;
            return (
              <button
                key={file.name}
                onClick={() => setSelectedFile(file)}
                className={`px-3 py-2 text-xs font-mono font-bold border-t-2 border-x-2 transition-all whitespace-nowrap -mb-[2px] ${
                  isCurrent
                    ? 'bg-white text-[#0F1B2E] border-[#0F1B2E] shadow-[2px_0px_0px_#0F1B2E]'
                    : 'text-[#0F1B2E]/60 hover:text-[#0F1B2E] bg-transparent border-transparent hover:bg-white/40'
                }`}
              >
                <span>{file.name}</span>
              </button>
            );
          })}
        </div>

        {/* Action Header Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 bg-[#F6F3EB] border-b-2 border-[#0F1B2E] text-xs font-mono gap-3">
          <div className="flex items-center gap-3">
            <span className="font-bold text-[#0F1B2E] bg-white border border-[#0F1B2E] px-2 py-0.5 shadow-[1px_1px_0px_#0F1B2E]">
              {selectedFile.path}
            </span>
            <span className="text-[#0F1B2E]/60">·</span>
            <span className="text-[#0F1B2E]/80">{lines.length} LINES</span>
            <span className="text-[#0F1B2E]/60">·</span>
            <span className="text-[#0F1B2E]/80 uppercase">{selectedFile.language}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-[#0F1B2E] font-mono text-xs font-bold text-[#0F1B2E] shadow-[2px_2px_0px_#0F1B2E] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-emerald-700 font-bold">COPIED</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>COPY FILE</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadSingleFile}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFE600] border-2 border-[#0F1B2E] font-mono text-xs font-bold text-[#0F1B2E] shadow-[2px_2px_0px_#0F1B2E] hover:translate-x-[1px] hover:translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>SAVE</span>
            </button>
          </div>
        </div>

        {/* Code Content with Yellow Indentation Anchors */}
        <div className="relative bg-white overflow-x-auto max-h-[640px] font-code text-xs sm:text-sm p-4 sm:p-6 leading-relaxed">
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, idx) => {
                // Calculate leading spaces to render yellow marker block
                const leadingSpaces = line.search(/\S/);
                const hasIndent = leadingSpaces >= 2;
                const indentLevel = Math.min(Math.floor(leadingSpaces / 2), 4);

                return (
                  <tr key={idx} className="hover:bg-[#F6F3EB] transition-colors">
                    {/* Line Number */}
                    <td className="w-10 pr-4 text-right text-[#0F1B2E]/35 select-none font-mono text-xs align-top border-r border-[#0F1B2E]/15">
                      {idx + 1}
                    </td>

                    {/* Code Line */}
                    <td className="pl-4 text-[#0F1B2E] whitespace-pre font-code select-text">
                      {hasIndent && (
                        <span
                          className="yellow-indent h-3.5 bg-[#FFE600] border border-[#0F1B2E]/70 mr-1.5 inline-block align-middle shadow-[1px_1px_0px_#0F1B2E]"
                          style={{ width: `${Math.max(8, indentLevel * 6)}px` }}
                          title={`Indentation level: ${indentLevel}`}
                        />
                      )}
                      <span>{line.trimStart()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
