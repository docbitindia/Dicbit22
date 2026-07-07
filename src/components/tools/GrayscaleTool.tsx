import React, { useState } from 'react';
import { Dropzone } from '../Dropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { useFileExitConfirm } from '../../hooks/useFileExitConfirm';
import { NavigationConfirmModal } from '../NavigationConfirmModal';
import { 
  Palette, 
  Download, 
  Loader2,
  Settings2,
  FileText,
  Shield,
  LayoutGrid,
  Check,
  Printer,
  Layers,
  Plus,
  X,
  ShieldCheck
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

type GrayscaleMode = 'all' | 'selected';
type ConversionType = 'grayscale' | 'pure-bw';

export default function GrayscaleTool() {
  const tool = TOOLS.find(t => t.id === 'grayscale-pdf')!;
  const [file, setFile] = useState<File | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [pdfProxy, setPdfProxy] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState('');
  const [mode, setMode] = useState<GrayscaleMode>('all');
  const [conversionType, setConversionType] = useState<ConversionType>('grayscale');
  const [bwThreshold, setBwThreshold] = useState(128);
  
  const [result, setResult] = useState<{ url: string; size: number } | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [highResViewerImage, setHighResViewerImage] = useState<string | null>(null);
  const [isRenderingViewer, setIsRenderingViewer] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    try {
      const buffer = await readFileAsArrayBuffer(f);
      const loadingTask = pdfjs.getDocument({ data: buffer.slice(0) });
      const pdf = await loadingTask.promise;
      setPdfProxy(pdf);
      setTotalPages(pdf.numPages);

      const thumbs: string[] = [];
      const numToThumbnail = pdf.numPages;
      
      const thumbCanvas = document.createElement('canvas'); // Reuse canvas
      const thumbCtx = thumbCanvas.getContext('2d');

      for (let i = 0; i < numToThumbnail; i++) {
        try {
          const page = await pdf.getPage(i + 1);
          const viewport = page.getViewport({ scale: 0.2 });
          
          if (thumbCtx) {
            thumbCanvas.height = viewport.height;
            thumbCanvas.width = viewport.width;
            await page.render({ canvasContext: thumbCtx, canvas: thumbCanvas, viewport }).promise;
            thumbs.push(thumbCanvas.toDataURL('image/jpeg', 0.6));
            
            if ((i + 1) % 5 === 0 || (i + 1) === numToThumbnail) {
              setThumbnails([...thumbs]);
              await new Promise(r => requestAnimationFrame(r));
            }
          }
        } catch (err) {
          console.error(`Page ${i + 1} thumbnail failed:`, err);
        }
      }
    } catch (e) {
      console.error('File load failed:', e);
      setErrorMessage('Unable to load the selected PDF. Please try another document.');
      setFile(null);
    } finally {
      setIsLoadingFile(false);
    }
  };

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
    if (mode === 'selected') {
      togglePageSelection(index);
      return;
    }
    
    if (!pdfProxy) return;
    setViewerImage(thumbnails[index] || '');
    setHighResViewerImage(null);
    setIsRenderingViewer(true);

    try {
      const page = await pdfProxy.getPage(index + 1);
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
      console.error('Thumbnail high-res failed:', e);
    } finally {
      setIsRenderingViewer(false);
    }
  };

  const processGrayscale = async () => {
    if (!file || !pdfProxy) return;
    setIsProcessing(true);
    setProgress(0);
    setProcessingStage('Initializing engine...');

    try {
      const outPdf = await PDFDocument.create();
      const pagesToProcess = mode === 'all' 
        ? Array.from({ length: totalPages }, (_, i) => i + 1)
        : Array.from(selectedPages).sort((a, b) => a - b).map(idx => idx + 1);

      if (pagesToProcess.length === 0 && mode === 'selected') {
        setErrorMessage('Please select at least one page to process.');
        setIsProcessing(false);
        return;
      }

      // Initialize worker
      const worker = new Worker(new URL('../../workers/grayscaleWorker.ts', import.meta.url), { type: 'module' });

      const targetDPI = 200;
      const scaleFactor = targetDPI / 72;

      for (let i = 0; i < pagesToProcess.length; i++) {
        const pageNum = pagesToProcess[i];
        const currentProgress = Math.round((i / pagesToProcess.length) * 100);
        setProgress(currentProgress);
        setProcessingStage(`Rendering page ${i + 1} of ${pagesToProcess.length}...`);

        const page = await pdfProxy.getPage(pageNum);
        const originalViewport = page.getViewport({ scale: 1.0 });
        const { width: originalWidth, height: originalHeight } = originalViewport;
        const renderViewport = page.getViewport({ scale: scaleFactor });
        
        const canvas = document.createElement('canvas');
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        
        const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
        
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          await (page as any).render({ canvasContext: ctx, viewport: renderViewport, intent: 'print' }).promise;

          setProcessingStage(`Converting page ${i + 1} (Grayscale)...`);
          let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          const processedImageData = await new Promise<ImageData>((resolve) => {
            worker.onmessage = (e) => resolve(e.data.imageData);
            worker.postMessage({ imageData, type: conversionType, threshold: bwThreshold }, [imageData.data.buffer]);
          });

          ctx.putImageData(processedImageData, 0, 0);
          
          setProcessingStage(`Embedding page ${i + 1}...`);
          let imgBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, conversionType === 'pure-bw' ? 'image/png' : 'image/jpeg', 0.92));
          if (!imgBlob) throw new Error('Failed to create image blob');
          
          let imgBytes = await imgBlob.arrayBuffer();
          let embeddedImg = (conversionType === 'pure-bw') ? await outPdf.embedPng(imgBytes) : await outPdf.embedJpg(imgBytes);
          
          const newPage = outPdf.addPage([originalWidth, originalHeight]);
          newPage.drawImage(embeddedImg, { x: 0, y: 0, width: originalWidth, height: originalHeight });
          
          // Clear memory
          (imgBytes as any) = null;
          (embeddedImg as any) = null;
          (imageData as any) = null;

          // Yield to main thread
          await new Promise(r => requestAnimationFrame(r));
        }
        canvas.width = 0; canvas.height = 0;
      }

      worker.terminate();
      setProcessingStage('Finalizing PDF...');
      setProgress(100);

      const bytes = await outPdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setResult({ url, size: blob.size });
      setIsDownloaded(false);
    } catch (e) {
      console.error('Grayscale processing error:', e);
      setErrorMessage('An error occurred during processing. Please try again or select a smaller file.');
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setProcessingStage('');
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = `grayscale_${file?.name}`;
    link.click();
    setIsDownloaded(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-40 px-4">
      <SEO 
        {...SEO_CONFIG.grayscalePdf}
        schema={[
          getWebApplicationSchema(SEO_CONFIG.grayscalePdf.title, SEO_CONFIG.grayscalePdf.description, SEO_CONFIG.grayscalePdf.canonical),
          getBreadcrumbSchema([{ name: 'Home', item: APP_DOMAIN }, { name: 'Grayscale PDF', item: SEO_CONFIG.grayscalePdf.canonical }]),
          getFAQSchema(tool.faqs || []),
          tool.steps && getHowToSchema(tool.name, tool.description, tool.steps)
        ].filter(Boolean)}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-neutral-900 dark:text-white uppercase italic">
            Grayscale <span className="text-blue-600">PDF</span> Converter
          </h1>
          <p className="text-sm font-bold uppercase tracking-widest text-neutral-400">Transform color PDF pages into print-friendly monochrome.</p>
        </div>
      </div>

      <AnimatePresence>
        {result && (
          <DownloadResult 
            filename={`grayscale_${file?.name}`}
            size={result.size}
            onDownload={handleDownload}
            isDownloaded={isDownloaded}
            onBack={() => setResult(null)}
            onReset={() => { setFile(null); setPdfProxy(null); setResult(null); setIsDownloaded(false); setThumbnails([]); setSelectedPages(new Set()); }}
          />
        )}
      </AnimatePresence>

      {errorMessage && (
        <div className="px-4 py-3 rounded-3xl bg-red-50 dark:bg-red-950/60 border border-red-100 dark:border-red-900 text-red-700 dark:text-red-300 text-sm font-bold uppercase tracking-[0.24em]">
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
        label="Select PDF to Grayscale" 
      />

      {file && (
          <div className="space-y-8">
            {/* Header section moved to top */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
              <div className="hidden">
                <h1 className="text-3xl font-black flex items-center gap-3">
                  Grayscale Configuration
                </h1>
                <p className="text-sm font-bold uppercase tracking-widest text-neutral-400">Transform color PDF pages into print-friendly monochrome.</p>
              </div>
            </div>

            {/* Options & Strategy Section - Full Width Top */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[40px] p-8 shadow-xl shadow-black/5 space-y-8">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                <div className="xl:col-span-8 space-y-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-blue-600">
                      <Settings2 className="w-5 h-5" />
                      <h3 className="text-xs font-black tracking-widest uppercase">Grayscale Options</h3>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                      <div className="w-8 aspect-[1/1.414] bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 flex items-center justify-center">
                        <Palette className="w-4 h-4 text-blue-600/50" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-neutral-900 dark:text-white truncate max-w-[150px]">{file.name}</p>
                        <p className="text-[8px] font-bold text-neutral-400 uppercase">{formatBytes(file.size)} • {totalPages} Pages</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { id: 'all', label: 'All Pages', icon: <Layers className="w-4 h-4" />, sub: 'Convert document' },
                      { id: 'selected', label: 'Selected Only', icon: <LayoutGrid className="w-4 h-4" />, sub: 'Specific targets' }
                    ].map((m) => (
                      <button 
                        key={m.id} 
                        onClick={() => setMode(m.id as any)} 
                        className={cn(
                          "group flex items-center gap-3 px-4 py-4 rounded-2xl border-2 transition-all text-left",
                          mode === m.id 
                            ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20" 
                            : "bg-white dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                          mode === m.id ? "bg-white/20" : "bg-neutral-100 dark:bg-neutral-800"
                        )}>
                          {React.cloneElement(m.icon as React.ReactElement, { className: "w-5 h-5" })}
                        </div>
                        <div className="flex-1 min-w-0 text-center md:text-left">
                          <p className="text-[10px] font-black uppercase tracking-tight leading-none mb-1">{m.label}</p>
                          <p className={cn("text-[8px] font-bold uppercase", mode === m.id ? "text-blue-100" : "text-neutral-400")}>{m.sub}</p>
                        </div>
                      </button>
                    ))}
                    
                    <div className="lg:col-span-2 flex items-center gap-2 bg-neutral-50 dark:bg-neutral-800 p-2 rounded-2xl border border-neutral-200 dark:border-neutral-800">
                      {[
                        { id: 'grayscale', label: 'Multi-Tone Grayscale' },
                        { id: 'pure-bw', label: 'Pure Black & White' }
                      ].map(t => (
                        <button 
                          key={t.id} 
                          onClick={() => setConversionType(t.id as ConversionType)} 
                          className={cn(
                            "flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all",
                            conversionType === t.id 
                              ? "bg-white dark:bg-neutral-900 text-blue-600 shadow-sm border border-neutral-200 dark:border-neutral-700" 
                              : "text-neutral-400 hover:text-neutral-600"
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="xl:col-span-4 border-t xl:border-t-0 xl:border-l border-neutral-100 dark:border-neutral-800 pt-8 xl:pt-0 xl:pl-8 flex flex-col justify-center">
                  <div className="space-y-6">
                    {isProcessing && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">{processingStage}</span>
                          <span className="text-[10px] font-black text-blue-600">{progress}%</span>
                        </div>
                        <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-blue-600 transition-all duration-300" />
                        </div>
                      </div>
                    )}
                    <button 
                      onClick={processGrayscale} 
                      disabled={isProcessing || (mode === 'selected' && selectedPages.size === 0)} 
                      className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-[24px] shadow-2xl shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale group"
                    >
                      {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Printer className="w-6 h-6 transition-transform group-hover:rotate-12" />}
                      <span className="text-lg tracking-tight uppercase">
                        {isProcessing ? 'CONVERTING...' : 'APPLY GRAYSCALE'}
                      </span>
                    </button>
                    <div className="flex items-center justify-center gap-4 text-[8px] font-black uppercase text-neutral-400 tracking-[0.2em]">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                      100% Client-Side Encryption
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Gallery Grid */}
            <div className="bg-white dark:bg-neutral-900 rounded-[40px] border border-neutral-200 dark:border-neutral-800 p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8 px-2">
                <div className="flex items-center gap-3">
                  <LayoutGrid className="w-5 h-5 text-blue-600" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Page Navigation</h3>
                </div>
                {mode === 'selected' && (
                  <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full border border-blue-100 dark:border-blue-800">{selectedPages.size} Selected / {totalPages} Total</span>
                )}
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-6">
                {thumbnails.map((p, i) => (
                  <motion.div 
                    key={i} 
                    layout 
                    whileHover={{ scale: 1.05 }} 
                    whileTap={{ scale: 0.95 }} 
                    onClick={() => handleViewPage(i)} 
                    className={cn(
                      "group relative aspect-[3/4] bg-neutral-50 dark:bg-neutral-800 rounded-2xl overflow-hidden border transition-all cursor-pointer shadow-sm hover:shadow-xl", 
                      mode === 'all' ? "border-neutral-200 dark:border-neutral-700 cursor-zoom-in" : 
                      selectedPages.has(i) ? "border-blue-600 ring-4 ring-blue-500/10 shadow-blue-500/20" : "border-neutral-100 dark:border-neutral-800 opacity-60 hover:opacity-100"
                    )}
                  >
                    <img src={p} className="w-full h-full object-cover" alt={`Page ${i+1}`} />
                    <div className="absolute top-3 left-3 px-2 py-1 bg-white/95 dark:bg-black/95 backdrop-blur shadow-sm rounded-lg text-[10px] font-black text-neutral-600 dark:text-neutral-400 border border-neutral-100 dark:border-neutral-800">P{i+1}</div>
                    {mode === 'selected' && (
                      <div className={cn(
                        "absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-md", 
                        selectedPages.has(i) ? "bg-blue-600 text-white scale-110" : "bg-black/20 text-white/0 border border-white/20"
                      )}>
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-colors" />
                  </motion.div>
                ))}
                {totalPages > thumbnails.length && (
                  <div className="aspect-[3/4] flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center">
                    <FileText className="w-8 h-8 text-neutral-300 mb-4" />
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">+{totalPages - thumbnails.length}<br/>Remaining</p>
                  </div>
                )}
              </div>
            </div>

            <ImageViewer src={highResViewerImage || viewerImage || ''} isOpen={!!viewerImage} onClose={() => { setViewerImage(null); setHighResViewerImage(null); }} loading={isRenderingViewer} />
          </div>
        )}

        <ToolContent 
          toolId={tool.id}
          toolName="Grayscale PDF"
          toolType="Optimize"
          description="Convert color PDF files into high-quality grayscale or black and white versions. Designed for saving ink and meeting professional document standards without server uploads."
          longContent={TOOL_SEO_CONTENT.grayscalePdf}
        />

        <NavigationConfirmModal 
          isOpen={blocker.state === 'blocked'}
          onConfirm={() => blocker.proceed?.()}
          onCancel={() => blocker.reset?.()}
        />
    </div>
  );
}
