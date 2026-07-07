import React, { useState } from 'react';
import { Dropzone } from '../Dropzone';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import { useFileExitConfirm } from '../../hooks/useFileExitConfirm';
import { NavigationConfirmModal } from '../NavigationConfirmModal';
import { 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  Loader2, 
  Wand2,
  FileText, 
  Plus, 
  Settings2,
  Combine, 
  Shield, 
  ShieldCheck, 
  Zap,
  Square,
  Globe,
  Maximize
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { readFileAsArrayBuffer, cn, formatBytes } from '../../lib/utils';
import { DownloadResult } from '../DownloadResult';
import { FileGrid, GridItem } from '../FileGrid';
import { SEO } from '../SEO';
import { ToolInfo } from '../ToolInfo';
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

export default function MergeTool() {
  const MAX_FILES = 50;
  const tool = TOOLS.find(t => t.id === 'merge')!;
  const [files, setFiles] = useState<GridItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState('');
  const [result, setResult] = useState<{ url: string; size: number } | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Options
  const [normalizeSize, setNormalizeSize] = useState(false);
  const [enableCompression, setEnableCompression] = useState(false);

  const blocker = useFileExitConfirm({ isDirty: files.length > 0 && !result });

  const handleFiles = async (newFiles: File[]) => {
    if (files.length >= MAX_FILES) {
      setErrorMessage(`Maximum of ${MAX_FILES} files allowed.`);
      return;
    }

    setErrorMessage(null);
    const remainingSlots = MAX_FILES - files.length;
    const filesToProcess = newFiles.slice(0, remainingSlots);

    if (newFiles.length > remainingSlots) {
      setErrorMessage(`Only ${remainingSlots} additional file${remainingSlots === 1 ? '' : 's'} can be added.`);
    }

    setIsAddingFiles(true);
    
    const pending: GridItem[] = filesToProcess.map(f => ({
      id: `f-${Math.random().toString(36).substr(2, 9)}`,
      file: f,
      size: f.size,
      status: 'processing'
    }));

    setFiles(prev => [...prev, ...pending]);
    setResult(null);
    setIsDownloaded(false);

    // Generate thumbnails in batches
    const CHUNK_SIZE = 5;
    for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
      const chunk = pending.slice(i, i + CHUNK_SIZE);
      const thumbUpdates: { id: string, thumbnail: string }[] = [];
      
      for (const item of chunk) {
        try {
          const buffer = await readFileAsArrayBuffer(item.file);
          const loadingTask = pdfjs.getDocument({ data: buffer });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 0.2 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, canvas, viewport }).promise;
            thumbUpdates.push({ id: item.id, thumbnail: canvas.toDataURL('image/jpeg', 0.6) });
          }
          // Clean up
          await pdf.destroy();
        } catch (err) {
          console.error('PDF Thumbnail error:', err);
        }
      }
      
      setFiles(prev => prev.map(f => {
        const update = thumbUpdates.find(u => u.id === f.id);
        return update ? { ...f, thumbnail: update.thumbnail, status: 'ready' } : f;
      }));
      
      await new Promise(r => requestAnimationFrame(r));
    }
    
    setIsAddingFiles(false);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleMove = (id: string, direction: 'left' | 'right') => {
    const index = files.findIndex(f => f.id === id);
    if (index === -1) return;
    const newFiles = [...files];
    if (direction === 'left' && index > 0) {
      [newFiles[index], newFiles[index - 1]] = [newFiles[index - 1], newFiles[index]];
    } else if (direction === 'right' && index < files.length - 1) {
      [newFiles[index], newFiles[index + 1]] = [newFiles[index + 1], newFiles[index]];
    }
    setFiles(newFiles);
  };

  const mergePDFs = async () => {
    if (files.length < 2) return;
    
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > 1.8 * 1024 * 1024 * 1024) {
      if (!confirm('The total size of selected files exceeds 1.8GB. This may crash your browser. Continue?')) {
        return;
      }
    }

    setIsMerging(true);
    setProgress(0);
    setProcessingStage('Initializing engine...');

    try {
      const mergedPdf = await PDFDocument.create();
      
      for (let i = 0; i < files.length; i++) {
        const fileData = files[i];
        try {
          setProcessingStage(`Reading file ${i + 1} of ${files.length}...`);
          setProgress(Math.round((i / files.length) * 100));

          let bytes = await readFileAsArrayBuffer(fileData.file);
          let pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
          
          setProcessingStage(`Merging file ${i + 1}...`);
          let copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          
          for (const copiedPage of copiedPages) {
            if (normalizeSize) {
              copiedPage.setSize(595, 842);
            }
            mergedPdf.addPage(copiedPage);
          }

          // Force memory cleanup
          (pdf as any) = null;
          (bytes as any) = null;
          (copiedPages as any) = null;
          
          // Yield every 5 files for responsiveness
          if (i % 5 === 0) {
            await new Promise(r => requestAnimationFrame(r));
          }
        } catch (err) {
          console.error(`Error merging file ${i}:`, err);
        }
      }

      setProcessingStage('Optimizing & Finalizing...');
      setProgress(100);
      
      const mergedPdfBytes = await mergedPdf.save({
        useObjectStreams: true
      });
      
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      setResult({ url: URL.createObjectURL(blob), size: blob.size });
      setIsDownloaded(false);
    } catch (error) {
      console.error('Merge error:', error);
      setErrorMessage('Failed to merge PDFs. One of the files may be corrupted or encrypted.');
    } finally {
      setIsMerging(false);
      setProgress(0);
      setProcessingStage('');
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = 'merged.pdf';
    link.click();
    setIsDownloaded(true);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-40">
      <SEO 
        {...SEO_CONFIG.merge}
        schema={[
          getWebApplicationSchema(SEO_CONFIG.merge.title, SEO_CONFIG.merge.description, SEO_CONFIG.merge.canonical),
          getBreadcrumbSchema([
            { name: 'Home', item: APP_DOMAIN },
            { name: 'Merge PDF', item: SEO_CONFIG.merge.canonical }
          ]),
          getFAQSchema(tool.faqs || []),
          tool.steps && getHowToSchema(tool.name, tool.description, tool.steps)
        ].filter(Boolean)}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-neutral-900 dark:text-white uppercase italic">
            Merge <span className="text-blue-600">PDF</span> Files
          </h1>
          <p className="text-sm font-bold uppercase tracking-widest text-neutral-400">Secure broker for high-volume document fusion.</p>
        </div>
      </div>

      <AnimatePresence>
        {result && (
          <DownloadResult 
            filename="merged_docbit.pdf" 
            size={result.size} 
            onDownload={handleDownload} 
            isDownloaded={isDownloaded}
            onBack={() => setResult(null)}
            onReset={() => { setFiles([]); setResult(null); setIsDownloaded(false); }} 
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
        maxFiles={MAX_FILES} 
        existingFilesCount={files.length}
        maxFilesMessage="Maximum 50 PDF files allowed for merging."
        invalidTypeMessage="Only PDF files are supported."
        isProcessing={isAddingFiles}
        processingFilesCount={files.length}
        processingTotalSize={files.reduce((acc, file) => acc + file.size, 0)}
        onError={setErrorMessage}
        accept={{ 'application/pdf': ['.pdf'] }}
        label="Select PDF Documents" 
      />

      {files.length > 0 && (
        <div className="space-y-8">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[40px] p-8 shadow-xl shadow-black/5 space-y-8">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                <div className="xl:col-span-8 space-y-6">
                  <div className="flex items-center gap-3 text-blue-600">
                    <Settings2 className="w-5 h-5" />
                    <h3 className="text-xs font-black tracking-widest uppercase">Merge Parameters</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button 
                      onClick={() => setNormalizeSize(!normalizeSize)}
                      className={cn(
                        "flex items-center gap-4 p-5 rounded-2xl border-2 transition-all text-left",
                        normalizeSize ? "border-blue-600 bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 shadow-sm" : "border-neutral-100 dark:border-neutral-800 text-neutral-400 hover:border-neutral-200"
                      )}
                    >
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-colors", normalizeSize ? "bg-blue-600 text-white" : "bg-neutral-100 dark:bg-neutral-800")}>
                        <Maximize className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black uppercase tracking-tight mb-1">Standardize Layout</p>
                        <p className="text-[8px] font-bold opacity-60 uppercase tracking-widest">Normalize all pages to standard A4</p>
                      </div>
                    </button>

                    <button 
                      onClick={() => setEnableCompression(!enableCompression)}
                      className={cn(
                        "flex items-center gap-4 p-5 rounded-2xl border-2 transition-all text-left",
                        enableCompression ? "border-purple-600 bg-purple-50/50 dark:bg-purple-900/20 text-purple-600 shadow-sm" : "border-neutral-100 dark:border-neutral-800 text-neutral-400 hover:border-neutral-200"
                      )}
                    >
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-colors", enableCompression ? "bg-purple-600 text-white" : "bg-neutral-100 dark:bg-neutral-800")}>
                        <Zap className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black uppercase tracking-tight mb-1">Stream Optimization</p>
                        <p className="text-[8px] font-bold opacity-60 uppercase tracking-widest">Reduce output size via object stream compression</p>
                      </div>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-black uppercase text-neutral-400">Batch:</span>
                       <span className="text-[10px] font-black text-neutral-900 dark:text-white uppercase tracking-tighter">{files.length} Files</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-black uppercase text-neutral-400">Aggregated:</span>
                       <span className="text-[10px] font-black text-blue-600 italic">{formatBytes(files.reduce((a, b) => a + b.size, 0))}</span>
                    </div>
                  </div>
                </div>

                <div className="xl:col-span-4 border-t xl:border-t-0 xl:border-l border-neutral-100 dark:border-neutral-800 pt-8 xl:pt-0 xl:pl-8 flex flex-col justify-center">
                  <div className="space-y-6">
                    {isMerging && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">{processingStage}</span>
                          <span className="text-[10px] font-black text-blue-600">{progress}%</span>
                        </div>
                        <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-blue-600" />
                        </div>
                      </div>
                    )}
                    <button 
                      onClick={mergePDFs}
                      disabled={isMerging || files.length < 2}
                      className="group w-full py-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-[24px] shadow-2xl shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    >
                      {isMerging ? <Loader2 className="w-6 h-6 animate-spin" /> : <Combine className="w-6 h-6 transition-transform group-hover:scale-110" />}
                      <span className="text-lg tracking-tight uppercase">{isMerging ? 'FUSING...' : 'FUSE DOCUMENTS'}</span>
                    </button>
                    <div className="flex items-center justify-center gap-2 text-[8px] font-black uppercase text-neutral-400 tracking-[0.2em]">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                      Client-Side Sandbox Encryption
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <FileGrid 
              items={files}
              onRemove={removeFile}
              onMove={handleMove}
              onAddMore={handleFiles}
              accept="application/pdf"
              maxFiles={MAX_FILES}
            />
          </div>
      )}
      <ToolContent 
        toolId={tool.id}
        toolName="Merge PDF"
        toolType="Merge"
        description="Securely combine multiple PDF documents into a single file directly in your browser. No uploads, maximum privacy."
        longContent={TOOL_SEO_CONTENT.merge}
      />

      <NavigationConfirmModal 
        isOpen={blocker.state === 'blocked'}
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  );
}

