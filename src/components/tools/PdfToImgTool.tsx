import React, { useState, useEffect } from 'react';
import { Dropzone } from '../Dropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import { useFileExitConfirm } from '../../hooks/useFileExitConfirm';
import { NavigationConfirmModal } from '../NavigationConfirmModal';
import { 
  Download, 
  Loader2, 
  Wand2,
  Shield, 
  Files,
  Settings2,
  FileCheck,
  CheckCircle2,
  Archive,
  Menu,
  X,
  Layers,
  Search,
  FileText,
  Plus,
  LayoutGrid,
  Check,
  Scissors,
  AlertCircle,
  FileBox
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { readFileAsArrayBuffer, cn, formatBytes } from '../../lib/utils';
import JSZip from 'jszip';
import { ImageViewer } from '../ImageViewer';
import { DownloadResult } from '../DownloadResult';
import { SEO } from '../SEO';
import { ToolInfo } from '../ToolInfo';
import { ToolContent } from '../ToolContent';
import { ShieldCheck, Zap, Globe } from 'lucide-react';
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

interface PageThumbnail {
  id: string;
  index: number;
  dataUrl: string;
}

type ExportMode = 'all' | 'range' | 'extract';

export default function PdfToImgTool() {
  const tool = TOOLS.find(t => t.id === 'pdf-to-img')!;
  const [file, setFile] = useState<File | null>(null);
  const [pdfProxy, setPdfProxy] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageThumbnail[]>([]);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState('');
  
  const [format, setFormat] = useState<'jpg' | 'png'>('jpg');
  const [quality, setQuality] = useState(0.9);
  const [exportMode, setExportMode] = useState<ExportMode>('all');
  const [rangeStr, setRangeStr] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [totalPages, setTotalPages] = useState(0);
  
  const [result, setResult] = useState<{ url: string; size: number; isZip: boolean } | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [viewerImg, setViewerImg] = useState<string | null>(null);
  const [highResViewerImage, setHighResViewerImage] = useState<string | null>(null);
  const [isRenderingViewer, setIsRenderingViewer] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const blocker = useFileExitConfirm({ isDirty: !!file && !result });

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const f = files[0];
    setErrorMessage(null);
    setFile(f);
    setIsLoadingFile(true);
    setPages([]);
    setResult(null);
    setIsDownloaded(false);
    setPdfProxy(null);

    try {
      const buffer = await readFileAsArrayBuffer(f);
      const loadingTask = pdfjs.getDocument({ data: buffer.slice(0) });
      const pdf = await loadingTask.promise;
      setPdfProxy(pdf);
      setTotalPages(pdf.numPages);
      
      const thumbs: PageThumbnail[] = [];
      const numToPreview = pdf.numPages;
      
      for (let i = 1; i <= numToPreview; i++) {
        // Small stagger for UX
        if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 50));

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, canvas, viewport }).promise;
          thumbs.push({
            id: `p-${i}`,
            index: i - 1,
            dataUrl: canvas.toDataURL('image/jpeg', 0.8)
          });
          if (i % 5 === 0) setPages([...thumbs]);
        }
      }
      setPages(thumbs);
    } catch (e) {
      console.error('Failed to process PDF.', e);
      setErrorMessage('Failed to read the selected PDF. Please try another document.');
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
    if (exportMode === 'extract') {
      togglePageSelection(index);
      return;
    }
    
    if (!pdfProxy) return;
    setViewerImg(pages[index]?.dataUrl || '');
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
      console.error('High-res thumbnail generation failed:', e);
    } finally {
      setIsRenderingViewer(false);
    }
  };

  const validateRange = (str: string): number[] => {
    const pages: number[] = [];
    const ranges = str.split(',').map(r => r.trim()).filter(Boolean);
    
    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(Number);
        if (isNaN(start) || isNaN(end) || start <= 0 || end > totalPages || start > end) {
          throw new Error(`Invalid range: ${range}`);
        }
        for (let i = start; i <= end; i++) pages.push(i - 1);
      } else {
        const val = Number(range);
        if (isNaN(val) || val <= 0 || val > totalPages) {
          throw new Error(`Invalid page number: ${range}`);
        }
        pages.push(val - 1);
      }
    }
    return Array.from(new Set(pages)).sort((a, b) => a - b);
  };

  useEffect(() => {
    if (exportMode === 'range' && rangeStr) {
      try {
        validateRange(rangeStr);
        setRangeError(null);
      } catch (e: any) {
        setRangeError(e.message);
      }
    } else {
      setRangeError(null);
    }
  }, [rangeStr, exportMode]);

  const convertPages = async () => {
    if (!file) return;
    setIsConverting(true);
    setProgress(0);
    setProcessingStage('Initializing engine...');

    try {
      const buffer = await readFileAsArrayBuffer(file);
      const loadingTask = pdfjs.getDocument({ data: buffer.slice(0) });
      const pdf = await loadingTask.promise;
      
      const zip = new JSZip();
      let targetIndices: number[];

      if (exportMode === 'all') {
        targetIndices = [];
        for (let i = 0; i < pdf.numPages; i++) targetIndices.push(i);
      } else if (exportMode === 'range') {
        try {
          targetIndices = validateRange(rangeStr);
        } catch (e: any) {
          setErrorMessage(e.message || 'Please enter a valid page range.');
          setIsConverting(false);
          return;
        }
      } else {
        if (selectedPages.size === 0) {
          setErrorMessage('Please select valid pages to export.');
          setIsConverting(false);
          return;
        }
        targetIndices = Array.from(selectedPages).sort((a, b) => a - b);
      }

      if (targetIndices.length === 0) {
        setErrorMessage('Please select valid pages to export.');
        setIsConverting(false);
        return;
      }

      const zipFolder = zip.folder("images");
      const sortedIndices = targetIndices;

      for (let i = 0; i < sortedIndices.length; i++) {
        const index = sortedIndices[i];
        const currentProgress = Math.round((i / sortedIndices.length) * 100);
        setProgress(currentProgress);
        setProcessingStage(`Rendering page ${index + 1}...`);

        const page = await pdf.getPage(index + 1);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher quality for final result
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, canvas, viewport }).promise;
          
          const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
          const ext = format === 'jpg' ? 'jpg' : 'png';
          const dataUrl = canvas.toDataURL(mime, quality);
          const base64 = dataUrl.split(',')[1];
          
          zipFolder?.file(`page_${index + 1}.${ext}`, base64, { base64: true });
        }
      }

      setProcessingStage('Creating ZIP archive...');
      setProgress(100);
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      setResult({ url, size: content.size, isZip: true });
      setIsDownloaded(false);
    } catch (e) {
      console.error('Conversion failed:', e);
      setErrorMessage('Conversion failed. Please try again or select a smaller file.');
    } finally {
      setIsConverting(false);
      setProgress(0);
      setProcessingStage('');
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = result.isZip ? 'images.zip' : `image.${format}`;
    link.click();
    setIsDownloaded(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-40">
      <SEO 
        {...SEO_CONFIG.pdfToImg}
        schema={[
          getWebApplicationSchema(
            SEO_CONFIG.pdfToImg.title,
            SEO_CONFIG.pdfToImg.description,
            SEO_CONFIG.pdfToImg.canonical
          ),
          getBreadcrumbSchema([
            { name: 'Home', item: APP_DOMAIN },
            { name: 'PDF to Image', item: SEO_CONFIG.pdfToImg.canonical }
          ]),
          getFAQSchema(tool.faqs || []),
          tool.steps && getHowToSchema(tool.name, tool.description, tool.steps)
        ].filter(Boolean)}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-neutral-900 dark:text-white uppercase italic">
            Convert <span className="text-blue-600">PDF</span> to Images
          </h1>
          <p className="text-sm font-bold uppercase tracking-widest text-neutral-400">Extract pages from your PDF as high-quality images.</p>
        </div>
      </div>

      <AnimatePresence>
        {result && (
          <DownloadResult 
            filename={result.isZip ? `extracted_from_${file?.name}.zip` : `extracted_page.${format}`}
            size={result.size}
            onDownload={handleDownload}
            isDownloaded={isDownloaded}
            onBack={() => setResult(null)}
            onReset={() => { setFile(null); setPages([]); setResult(null); setIsDownloaded(false); setRangeStr(''); setSelectedPages(new Set()); }}
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
        maxFilesMessage="Only one PDF can be converted at a time."
        invalidTypeMessage="Only PDF files are supported."
        maxFilesStrict={true}
        isProcessing={isLoadingFile}
        processingFilesCount={file ? 1 : undefined}
        processingTotalSize={file?.size}
        onError={setErrorMessage}
        accept={{ 'application/pdf': ['.pdf'] }}
        label="Select PDF Documents" 
      />

      {file && (
        <div className="space-y-8">
            {/* Header section moved to top */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
              <div className="hidden">
                <h1 className="text-3xl font-black flex items-center gap-3">
                  Convert PDF to Images
                </h1>
                <p className="text-sm font-bold uppercase tracking-widest text-neutral-400">Extract pages from your PDF as high-quality images.</p>
              </div>

                    <div className="flex items-center gap-2 text-blue-600">
                      <Files className="w-5 h-5" />
                      <h3 className="text-xs font-black tracking-widest uppercase">Export Strategy</h3>
                    </div>
                    {exportMode === 'extract' && (
                      <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full">
                        {selectedPages.size} Selected / {totalPages} Total
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                     {[
                       { id: 'all', label: 'Export All', icon: <Layers className="w-4 h-4" />, sub: 'All pages as images' },
                       { id: 'range', label: 'Custom Range', icon: <Scissors className="w-4 h-4" />, sub: 'e.g. 1-5, 10, 15-20' },
                       { id: 'extract', label: 'Extract Selected', icon: <LayoutGrid className="w-4 h-4" />, sub: 'Select pages from grid' }
                     ].map((mode) => (
                       <button
                         key={mode.id}
                         onClick={() => setExportMode(mode.id as ExportMode)}
                         className={cn(
                           "group flex items-center gap-3 px-4 py-4 rounded-2xl border-2 transition-all text-left",
                           exportMode === mode.id 
                             ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20" 
                             : "bg-white dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm"
                         )}
                       >
                         <div className={cn(
                           "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                           exportMode === mode.id ? "bg-white/20" : "bg-neutral-100 dark:bg-neutral-800 group-hover:bg-neutral-200"
                         )}>
                           {React.cloneElement(mode.icon as React.ReactElement, { className: "w-5 h-5 transition-transform group-hover:scale-110" })}
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-[10px] font-black uppercase tracking-tight leading-none mb-1">{mode.label}</p>
                           <p className={cn(
                             "text-[8px] font-bold uppercase tracking-widest transition-colors",
                             exportMode === mode.id ? "text-blue-100" : "text-neutral-400"
                           )}>{mode.sub}</p>
                         </div>
                       </button>
                     ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end mt-auto">
                    <div className="space-y-4">
                      <AnimatePresence mode="wait">
                        {exportMode === 'range' ? (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400 italic">Page Range</label>
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
                                "w-full px-4 py-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border-2 font-black text-sm transition-all italic",
                                rangeError ? "border-red-500/30" : "border-transparent focus:border-blue-500"
                              )}
                            />
                          </motion.div>
                        ) : (
                          <div className="h-[74px] flex items-center px-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                             <div className="flex items-center gap-4">
                                <FileCheck className="w-5 h-5 text-neutral-300" />
                                <div className="space-y-1">
                                   <p className="text-[10px] font-black uppercase text-neutral-900 dark:text-white truncate max-w-[200px]">{file.name}</p>
                                   <p className="text-[8px] font-bold text-neutral-400 uppercase tracking-widest italic">{totalPages} Pages Found</p>
                                </div>
                             </div>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="space-y-3">
                       <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider italic">Format & Quality</p>
                       <div className="flex gap-2">
                          <div className="flex-1 grid grid-cols-2 gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                             {['jpg', 'png'].map(f => (
                               <button 
                                 key={f} 
                                 onClick={() => setFormat(f as any)} 
                                 className={cn(
                                   "py-2 rounded-lg font-black text-[10px] uppercase transition-all",
                                   format === f ? "bg-white dark:bg-neutral-700 text-blue-600 shadow-sm" : "text-neutral-400 hover:text-neutral-600"
                                 )}
                               >
                                 {f}
                               </button>
                             ))}
                          </div>
                          <select 
                            value={quality} 
                            onChange={(e) => setQuality(Number(e.target.value))}
                            className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-neutral-600 outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value={0.95}>BEST</option>
                            <option value={0.8}>HIGH</option>
                            <option value={0.6}>LOW</option>
                          </select>
                       </div>
                    </div>
                  </div>


                <div className="xl:col-span-4 border-t xl:border-t-0 xl:border-l border-neutral-100 dark:border-neutral-800 pt-8 xl:pt-0 xl:pl-8 flex flex-col justify-center">
                  <div className="space-y-6">
                    {isConverting && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">{processingStage}</span>
                          <span className="text-[10px] font-black text-blue-600">{progress}%</span>
                        </div>
                        <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: progress + '%' }} className="h-full bg-blue-600" />
                        </div>
                      </div>
                    )}
                    <button 
                      onClick={convertPages}
                      disabled={isConverting || pages.length === 0 || (exportMode === 'range' && (!!rangeError || !rangeStr)) || (exportMode === 'extract' && selectedPages.size === 0)}
                      className="group w-full py-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-[24px] shadow-2xl shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                      {isConverting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Archive className="w-6 h-6 transition-transform group-hover:scale-110" />}
                      <span className="text-lg tracking-tight uppercase">{isConverting ? 'GENERATING...' : 'GENERATE IMAGES'}</span>
                    </button>
                    <div className="flex items-center justify-center gap-2 text-[8px] font-black uppercase text-neutral-400 tracking-[0.2em]">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                      Encrypted Browser Export
                    </div>
                  </div>
                </div>


            {/* Preview Section */}
            <div className="bg-white dark:bg-neutral-900 rounded-[40px] border border-neutral-200 dark:border-neutral-800 p-8 shadow-sm flex-1">
               {isLoadingFile && pages.length === 0 ? (
                 <div className="h-64 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 italic">Analyzing Document...</p>
                 </div>
               ) : (
                 <>
                  <div className="flex items-center justify-between mb-8 px-2">
                    <div className="flex items-center gap-3">
                      <LayoutGrid className="w-5 h-5 text-blue-600" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400">
                        {exportMode === 'extract' ? 'Multi-Select Mode' : 'Document Gallery'}
                      </h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-6">
                      {pages.map((p) => (
                        <motion.div 
                          key={p.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleViewPage(p.index)}
                          className={cn(
                            "relative aspect-[1/1.414] bg-neutral-50 dark:bg-neutral-800 rounded-3xl overflow-hidden border transition-all shadow-md group",
                            exportMode !== 'extract' ? "border-neutral-100 dark:border-neutral-800 cursor-zoom-in group ring-offset-2 ring-blue-500 hover:ring-4" : 
                            selectedPages.has(p.index) ? "border-blue-600 ring-4 ring-blue-500/20 shadow-2xl scale-105" : "border-neutral-100 dark:border-neutral-800 opacity-60 hover:opacity-100 italic"
                          )}
                        >
                           <img src={p.dataUrl} className="w-full h-full object-cover" />
                           
                           <div className="absolute top-4 left-4 px-3 py-1.5 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-xl shadow-lg border border-neutral-100 dark:border-neutral-800 text-[10px] font-black text-blue-600 uppercase tracking-tighter">
                             PAGE {p.index + 1}
                           </div>

                           {exportMode === 'extract' && (
                              <div className={cn(
                                "absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-lg",
                                selectedPages.has(p.index) ? "bg-blue-600 text-white scale-110" : "bg-black/20 text-white/0 border border-white/40"
                              )}>
                                <Check className="w-5 h-5 stroke-[4]" />
                              </div>
                            )}

                           {exportMode !== 'extract' && (
                             <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div className="w-12 h-12 bg-white/90 dark:bg-neutral-900/90 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-sm">
                                  <Search className="w-6 h-6 text-blue-600" />
                                </div>
                             </div>
                           )}
                        </motion.div>
                      ))}
                      {totalPages > pages.length && (
                        <div className="aspect-[1/1.414] flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-800 rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-700 p-4 text-center">
                          <FileBox className="w-8 h-8 text-neutral-300 mb-3" />
                          <p className="text-[12px] font-black uppercase text-neutral-400 leading-none">
                            +{totalPages - pages.length} MORE
                          </p>
                        </div>
                      )}
                  </div>
                 </>
               )}
            </div>

            <ImageViewer 
              src={highResViewerImage || viewerImg || ''} 
              isOpen={!!viewerImg} 
              loading={isRenderingViewer}
              onClose={() => { setViewerImg(null); setHighResViewerImage(null); }} 
            />
          </div>
        )}
      <ToolContent 
        toolId={tool.id}
        toolName="PDF to Image"
        toolType="Convert"
        description="Convert PDF pages into high-quality JPG or PNG images instantly. Our local engine ensures crystal-clear resolution without uploading your data."
        longContent={TOOL_SEO_CONTENT.pdfToImg}
      />

      <NavigationConfirmModal 
        isOpen={blocker.state === 'blocked'}
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  );
}
