import React, { useState, useEffect } from 'react';
import { Dropzone } from '../Dropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { useFileExitConfirm } from '../../hooks/useFileExitConfirm';
import { NavigationConfirmModal } from '../NavigationConfirmModal';
import { 
  Scissors, 
  Download, 
  Loader2,
  Settings2,
  FileText,
  Shield,
  LayoutGrid,
  Check,
  Layers,
  AlertCircle,
  FileBox,
  Plus,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { readFileAsArrayBuffer, cn, formatBytes } from '../../lib/utils';
import { DownloadResult } from '../DownloadResult';
import { ImageViewer } from '../ImageViewer';
import { SEO } from '../SEO';
import { ToolContent } from '../ToolContent';
import { TOOLS } from '../../constants/tools';
import { SEO_CONFIG, APP_DOMAIN } from '../../seo/seoConfig';
import { 
  getWebApplicationSchema, 
  getBreadcrumbSchema,
  getHowToSchema
} from '../../seo/structuredData';
import { getFAQSchema } from '../../utils/schema/faqSchema';
import { TOOL_SEO_CONTENT } from '../../constants/toolSeoContent';

// Configure pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type SplitMode = 'all' | 'range' | 'extract';

export default function SplitTool() {
  const tool = TOOLS.find(t => t.id === 'split')!;
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  
  const [splitMode, setSplitMode] = useState<SplitMode>('all');
  const [rangeStr, setRangeStr] = useState('');
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [rangeError, setRangeError] = useState<string | null>(null);
  
  const [isSplitting, setIsSplitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState('');
  const [result, setResult] = useState<{ url: string; size: number } | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [highResViewerImage, setHighResViewerImage] = useState<string | null>(null);
  const [isRenderingViewer, setIsRenderingViewer] = useState(false);

  const blocker = useFileExitConfirm({ isDirty: !!file && !result });

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const f = files[0];
    setErrorMessage(null);
    setIsLoadingFile(true);
    setFile(f);
    setResult(null);
    setIsDownloaded(false);
    setThumbnails([]);
    setSelectedPages(new Set());
    setRangeStr('');

    try {
      const buffer = await readFileAsArrayBuffer(f);
      const loadingTask = pdfjs.getDocument({ data: buffer.slice(0) });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);

      const thumbs: string[] = [];
      const numToPreview = pdf.numPages;
      
      const thumbCanvas = document.createElement('canvas'); // Reuse canvas
      const thumbCtx = thumbCanvas.getContext('2d');

      for (let i = 1; i <= numToPreview; i++) {
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.2 });
          
          if (thumbCtx) {
            thumbCanvas.height = viewport.height;
            thumbCanvas.width = viewport.width;
            await page.render({ canvasContext: thumbCtx, canvas: thumbCanvas, viewport }).promise;
            thumbs.push(thumbCanvas.toDataURL('image/jpeg', 0.6));
            
            if (i % 5 === 0 || i === numToPreview) {
              setThumbnails([...thumbs]);
              await new Promise(r => requestAnimationFrame(r));
            }
          }
        } catch (err) {
          console.error(`Page ${i} render failed:`, err);
        }
      }
    } catch (e) {
      console.error('File load failed:', e);
      setErrorMessage('Unable to load the selected PDF. Please try again with a different file.');
      setFile(null);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const validateRange = (str: string, total: number) => {
    if (!str.trim()) return null;
    const parts = str.split(',').map(p => p.trim());
    for (const part of parts) {
      if (!part) continue;
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (isNaN(start) || isNaN(end) || start < 1 || end > total || start > end) {
          return `Invalid range: ${part}`;
        }
      } else {
        const num = Number(part);
        if (isNaN(num) || num < 1 || num > total) {
          return `Invalid page: ${part}`;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    if (splitMode === 'range') {
      setRangeError(validateRange(rangeStr, totalPages));
    } else {
      setRangeError(null);
    }
  }, [rangeStr, splitMode, totalPages]);

  const togglePageSelection = (index: number) => {
    const next = new Set(selectedPages);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedPages(next);
  };

  const handleViewPage = async (index: number) => {
    if (splitMode === 'extract') {
      togglePageSelection(index);
      return;
    }
    
    if (!pdfDoc) return;
    setViewerImage(thumbnails[index] || '');
    setHighResViewerImage(null);
    setIsRenderingViewer(true);

    try {
      const page = await pdfDoc.getPage(index + 1);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, canvas, viewport }).promise;
        setHighResViewerImage(canvas.toDataURL('image/jpeg', 0.9));
      }
    } catch (e) {
      console.error('High-res render failed:', e);
    } finally {
      setIsRenderingViewer(false);
    }
  };

  const processSplit = async () => {
    if (!file || !pdfDoc) return;
    setIsSplitting(true);
    setProgress(0);
    setProcessingStage('Reading Original PDF...');

    try {
      const buffer = await readFileAsArrayBuffer(file);
      const sourcePdf = await PDFDocument.load(buffer);
      const outPdf = await PDFDocument.create();

      let pagesToInclude: number[] = [];
      if (splitMode === 'all') {
        pagesToInclude = Array.from({ length: totalPages }, (_, i) => i + 1);
      } else if (splitMode === 'range') {
        const parts = rangeStr.split(',').map(p => p.trim());
        for (const part of parts) {
          if (!part) continue;
          if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            for (let i = start; i <= end; i++) pagesToInclude.push(i);
          } else {
            pagesToInclude.push(Number(part));
          }
        }
      } else {
        pagesToInclude = Array.from(selectedPages).sort((a, b) => a - b).map(idx => idx + 1);
      }

      // De-duplicate and sort
      pagesToInclude = Array.from(new Set(pagesToInclude)).sort((a, b) => a - b);

      if (pagesToInclude.length === 0) {
        setErrorMessage('Please specify at least one page to split.');
        setIsSplitting(false);
        return;
      }

      setProcessingStage(`Extracting ${pagesToInclude.length} pages...`);
      // Process in smaller chunks to avoid freezing
      const CHUNK_SIZE = 10;
      for (let i = 0; i < pagesToInclude.length; i += CHUNK_SIZE) {
        const chunk = pagesToInclude.slice(i, i + CHUNK_SIZE);
        let copiedPages = await outPdf.copyPages(sourcePdf, chunk.map(p => p - 1));
        copiedPages.forEach(p => outPdf.addPage(p));
        
        // Memory cleanup
        (copiedPages as any) = null;

        const currentProg = Math.round(((i + chunk.length) / pagesToInclude.length) * 100);
        setProgress(currentProg);
        await new Promise(r => requestAnimationFrame(r));
      }

      setProcessingStage('Finalizing...');
      setProgress(100);
      const pdfBytes = await outPdf.save({ useObjectStreams: true });
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResult({ url, size: blob.size });
    } catch (e) {
      console.error('Split failed:', e);
      setErrorMessage('Failed to split PDF. Please check the file and try again.');
    } finally {
      setIsSplitting(false);
      setProgress(0);
      setProcessingStage('');
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = `split_${file?.name}`;
    link.click();
    setIsDownloaded(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-40 px-4">
      <SEO 
        {...SEO_CONFIG.split}
        schema={[
          getWebApplicationSchema(
            SEO_CONFIG.split.title,
            SEO_CONFIG.split.description,
            SEO_CONFIG.split.canonical
          ),
          getBreadcrumbSchema([
            { name: 'Home', item: APP_DOMAIN },
            { name: 'Split PDF', item: SEO_CONFIG.split.canonical }
          ]),
          getFAQSchema(tool.faqs || []),
          tool.steps && getHowToSchema(tool.name, tool.description, tool.steps)
        ].filter(Boolean)}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-neutral-900 dark:text-white uppercase italic">
            Split <span className="text-blue-600">PDF</span> Pages
          </h1>
          <p className="text-sm font-bold uppercase tracking-widest text-neutral-400">Divide a PDF into separate files or extract specific pages easily.</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {result && (
          <DownloadResult 
            filename={`split_${file?.name}`}
            size={result.size}
            onDownload={handleDownload}
            isDownloaded={isDownloaded}
            onBack={() => setResult(null)}
            onReset={() => { setFile(null); setPdfDoc(null); setResult(null); setIsDownloaded(false); setThumbnails([]); setSelectedPages(new Set()); setRangeStr(''); }}
          />
        )}
      </AnimatePresence>

      {errorMessage && (
        <div className="px-4 py-3 rounded-3xl bg-red-50 dark:bg-red-950/60 border border-red-100 dark:border-red-900 text-red-700 dark:text-red-300 text-sm font-bold uppercase tracking-[0.24em] mb-4">
          {errorMessage}
        </div>
      )}

      <Dropzone 
        onFilesSelected={handleFiles} 
        maxFiles={1} 
        maxFilesMessage="Please upload a single PDF file." 
        invalidTypeMessage="Only PDF files are supported." 
        maxFilesStrict={true}
        isProcessing={isLoadingFile} 
        processingFilesCount={file ? 1 : undefined} 
        processingTotalSize={file?.size} 
        onError={setErrorMessage} 
        label="Split PDF Document" 
      />

      {file && (
          <div className="space-y-8">
            {/* Header section moved to top */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
              <div className="hidden">
                <h1 className="text-3xl font-black flex items-center gap-3">
                  Split PDF Pages
                </h1>
                <p className="text-sm font-bold uppercase tracking-widest text-neutral-400">Divide a PDF into separate files or extract specific pages easily.</p>
              </div>
            </div>

            {/* Strategy & Options Section - Now Full Width at Top */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[40px] p-8 shadow-xl shadow-black/5 space-y-8">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                {/* File Preview & Mode Selector */}
                <div className="xl:col-span-8 space-y-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-blue-600">
                      <Settings2 className="w-5 h-5" />
                      <h3 className="text-xs font-black tracking-widest uppercase">Select Split Strategy</h3>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                      <div className="w-8 aspect-[1/1.414] bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-600/50" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-neutral-900 dark:text-white truncate max-w-[150px]">{file.name}</p>
                        <p className="text-[8px] font-bold text-neutral-400 uppercase">{formatBytes(file.size)} • {totalPages} Pages</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { id: 'all', label: 'Split into files', icon: <Layers className="w-4 h-4" />, sub: 'Each page as separate PDF' },
                      { id: 'range', label: 'Custom Range', icon: <Scissors className="w-4 h-4" />, sub: 'e.g. 1-5, 10, 15-20' },
                      { id: 'extract', label: 'Extract Selected', icon: <LayoutGrid className="w-4 h-4" />, sub: 'Select pages from grid' }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setSplitMode(mode.id as SplitMode)}
                        className={cn(
                          "group flex items-center gap-3 px-4 py-4 rounded-2xl border-2 transition-all text-left w-full",
                          splitMode === mode.id 
                            ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20" 
                            : "bg-white dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                          splitMode === mode.id ? "bg-white/20" : "bg-neutral-100 dark:bg-neutral-800 group-hover:bg-neutral-200"
                        )}>
                          {React.cloneElement(mode.icon as React.ReactElement, { className: "w-5 h-5" })}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-tight leading-none mb-1">{mode.label}</p>
                          <p className={cn(
                            "text-[8px] font-bold uppercase tracking-widest",
                            splitMode === mode.id ? "text-blue-100" : "text-neutral-400"
                          )}>{mode.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {splitMode === 'range' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Page Range</label>
                          {rangeError && (
                            <div className="flex items-center gap-1 text-[8px] font-black uppercase text-red-500">
                              <AlertCircle className="w-3 h-3" />
                              {rangeError}
                            </div>
                          )}
                        </div>
                        <input 
                          type="text" 
                          placeholder="e.g. 1-5, 8, 12-15"
                          value={rangeStr} 
                          onChange={(e) => setRangeStr(e.target.value)} 
                          className={cn(
                            "w-full px-6 py-4 bg-neutral-50 dark:bg-neutral-800 rounded-2xl border-2 font-black text-xl transition-all",
                            rangeError ? "border-red-500/50 text-red-600" : "border-transparent focus:border-blue-500"
                          )}
                        />
                        <p className="text-[10px] font-bold text-neutral-500 italic">
                          Separate ranges with commas. Available pages: 1 to {totalPages}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Finalizing Action Area */}
                <div className="xl:col-span-4 border-t xl:border-t-0 xl:border-l border-neutral-100 dark:border-neutral-800 pt-8 xl:pt-0 xl:pl-8 flex flex-col justify-center">
                  <div className="space-y-6">
                    {isSplitting && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">{processingStage}</span>
                          <span className="text-[10px] font-black text-blue-600">{progress}%</span>
                        </div>
                        <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            className="h-full bg-blue-600"
                          />
                        </div>
                      </div>
                    )}
                    <button 
                      onClick={processSplit}
                      disabled={isSplitting || (splitMode === 'range' && (!!rangeError || !rangeStr)) || (splitMode === 'extract' && selectedPages.size === 0)}
                      className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-[24px] shadow-2xl shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed group"
                    >
                      {isSplitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Scissors className="w-6 h-6 transition-transform group-hover:rotate-12" />}
                      <span className="text-lg tracking-tight">
                        {isSplitting ? 'PROCESSING...' : splitMode === 'range' || splitMode === 'extract' ? 'GENERATE PDF' : 'SPLIT ALL PAGES'}
                      </span>
                    </button>
                    <div className="flex items-center justify-center gap-6">
                      <div className="flex items-center gap-2 text-[8px] font-black uppercase text-neutral-400 tracking-[0.2em]">
                        <Shield className="w-3 h-3" />
                        In-Browser
                      </div>
                      <div className="flex items-center gap-2 text-[8px] font-black uppercase text-neutral-400 tracking-[0.2em]">
                        <Check className="w-3 h-3 text-green-500" />
                        Private
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Thumbnails Grid Section */}
            <div className="bg-white dark:bg-neutral-900 rounded-[40px] border border-neutral-200 dark:border-neutral-800 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8 px-2">
                <div className="flex items-center gap-3">
                  <LayoutGrid className="w-5 h-5 text-blue-600" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                    {splitMode === 'extract' ? 'Select extraction targets' : 'Document Page Insights'}
                  </h3>
                </div>
                {splitMode === 'extract' && (
                  <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full border border-blue-100 dark:border-blue-800">
                    {selectedPages.size} Selected / {totalPages} Total
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {thumbnails.map((p, i) => (
                  <motion.div 
                    key={i} 
                    layout
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleViewPage(i)} 
                    className={cn(
                      "group relative aspect-[3/4] bg-neutral-50 dark:bg-neutral-800 rounded-2xl overflow-hidden border transition-all shadow-sm hover:shadow-xl",
                      splitMode !== 'extract' ? "border-neutral-200 dark:border-neutral-700 cursor-zoom-in" : 
                      selectedPages.has(i) ? "border-blue-600 ring-4 ring-blue-500/10 shadow-blue-500/20 cursor-pointer" : "border-neutral-100 dark:border-neutral-800 opacity-60 hover:opacity-100 cursor-pointer"
                    )}
                  >
                    <img src={p} className="w-full h-full object-cover" alt={`Page ${i+1}`} />
                    
                    <div className="absolute top-3 left-3 px-2 py-1 bg-white/95 dark:bg-black/95 backdrop-blur shadow-[0_2px_10px_rgba(0,0,0,0.1)] rounded-lg text-[10px] font-black text-neutral-600 dark:text-neutral-400 border border-neutral-100 dark:border-neutral-800">
                      P{i+1}
                    </div>

                    {splitMode === 'extract' && (
                      <div className={cn(
                        "absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-md",
                        selectedPages.has(i) ? "bg-blue-600 text-white scale-110" : "bg-black/20 text-white/0 border border-white/20 hover:bg-black/40"
                      )}>
                        <Check className="w-4 h-4" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-colors pointer-events-none" />
                  </motion.div>
                ))}
                {totalPages > thumbnails.length && (
                  <div className="aspect-[3/4] flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center mb-4">
                      <FileBox className="w-6 h-6 text-neutral-300" />
                    </div>
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest leading-loose">
                      +{totalPages - thumbnails.length}<br/>Remaining
                    </p>
                  </div>
                )}
              </div>
            </div>

            <ImageViewer 
              src={highResViewerImage || viewerImage || ''} 
              isOpen={!!viewerImage} 
              onClose={() => { setViewerImage(null); setHighResViewerImage(null); }} 
              loading={isRenderingViewer}
            />
          </div>
        )}

        <ToolContent 
          toolId={tool.id}
          toolName="Split PDF"
          toolType="Split"
          description="Extract specific pages, split giant documents into separate files, or select pages visually from thumbnails. Everything runs in-browser for complete data security."
          longContent={TOOL_SEO_CONTENT.split}
        />

        <NavigationConfirmModal 
          isOpen={blocker.state === 'blocked'}
          onConfirm={() => blocker.proceed?.()}
          onCancel={() => blocker.reset?.()}
        />
    </div>
  );
}
