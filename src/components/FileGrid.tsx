import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trash2, 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  Plus, 
  Eye, 
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  Settings2
} from 'lucide-react';
import { cn, formatBytes } from '../lib/utils';

export interface GridItem {
  id: string;
  file: File;
  thumbnail?: string;
  rotation?: number;
  status: 'ready' | 'processing';
  size: number;
}

interface FileGridProps {
  items: GridItem[];
  onRemove: (id: string) => void;
  onMove: (id: string, direction: 'left' | 'right') => void;
  onRotate?: (id: string) => void;
  onPreview?: (item: GridItem) => void;
  onAddMore: (files: File[]) => void;
  accept: string;
  maxFiles: number;
  onOpenConfig?: () => void;
}

const GridItemComponent = React.memo(({ 
  item, 
  idx, 
  onMove, 
  onRemove, 
  onRotate, 
  onPreview,
  useLayout = false
}: { 
  item: GridItem; 
  idx: number; 
  onMove: (id: string, direction: 'left' | 'right') => void;
  onRemove: (id: string) => void;
  onRotate?: (id: string) => void;
  onPreview?: (item: GridItem) => void;
  useLayout?: boolean;
}) => (
  <motion.div
    layout={useLayout}
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={useLayout ? { type: 'spring', damping: 25, stiffness: 200 } : { duration: 0.2 }}
    className={cn(
      "group relative bg-white dark:bg-neutral-950 rounded-[32px] border border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden transition-all hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-500/5",
      item.status === 'processing' && "opacity-80"
    )}
  >
    {/* Header - Filename & Size */}
    <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-900 bg-neutral-50/50 dark:bg-neutral-900/50">
      <div className="flex items-center justify-between gap-2">
         <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[8px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-1 py-0.5 rounded">#{idx + 1}</span>
            <p className="text-[9px] font-black truncate text-neutral-600 dark:text-neutral-400 uppercase tracking-tight">{item.file.name}</p>
         </div>
         <span className="text-[7px] font-black text-neutral-400 uppercase shrink-0">{formatBytes(item.size)}</span>
      </div>
    </div>

    {/* Thumbnail / Body */}
    <div 
      onClick={() => item.status === 'ready' && onPreview?.(item)}
      className={cn(
        "w-full aspect-square relative flex items-center justify-center bg-white dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-900 overflow-hidden",
        onPreview && item.status === 'ready' && "cursor-zoom-in"
      )}
    >
      {item.status === 'processing' ? (
        <div className="flex flex-col items-center gap-3 p-12">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin relative z-10" />
          <span className="text-[8px] font-black uppercase text-blue-500 tracking-[0.2em]">Processing...</span>
        </div>
      ) : item.thumbnail ? (
        <div className="w-full h-full flex items-center justify-center relative bg-white dark:bg-black">
          <motion.div 
            className="w-full h-full flex items-center justify-center"
            animate={{ rotate: item.rotation || 0 }}
            transition={useLayout ? { type: 'spring', damping: 25, stiffness: 200 } : { duration: 0.2 }}
          >
            <img 
              src={item.thumbnail} 
              className="max-w-full max-h-full object-contain pointer-events-none"
              alt="Preview"
              loading="lazy"
            />
          </motion.div>
          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-16">
          <FileText className="w-16 h-16 text-neutral-200 dark:text-neutral-800 opacity-20" />
          <span className="text-[8px] font-black uppercase text-neutral-400 dark:text-neutral-600 tracking-widest">No Preview</span>
        </div>
      )}
      
      {onPreview && item.status === 'ready' && (
        <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-all flex items-center justify-center z-10">
          <div className="w-12 h-12 rounded-full bg-white dark:bg-neutral-800 shadow-2xl flex items-center justify-center scale-0 group-hover:scale-100 transition-all duration-300 border border-neutral-100 dark:border-neutral-700">
              <Eye className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      )}
      
      {item.rotation !== undefined && item.rotation !== 0 && (
        <div className="absolute top-3 right-3 bg-blue-600 backdrop-blur-md text-white text-[9px] font-black px-2.5 py-1 rounded-xl uppercase tracking-widest italic shadow-xl z-20 border border-white/10">
          {item.rotation}°
        </div>
      )}
    </div>

    {/* Footer Actions */}
    <div className="px-3 py-1.5 flex items-center justify-between gap-1 bg-white dark:bg-neutral-950">
      <div className="flex items-center gap-1">
        <button 
          onClick={() => onMove(item.id, 'left')}
          disabled={idx === 0 || item.status === 'processing'}
          className="p-2 text-neutral-400 hover:text-blue-600 disabled:opacity-0 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
          title="Move Left"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onMove(item.id, 'right')}
          disabled={false /* Handled by parent check */}
          className="p-2 text-neutral-400 hover:text-blue-600 disabled:opacity-0 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
          title="Move Right"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1">
        {onRotate && (
           <button 
             onClick={() => onRotate(item.id)}
             disabled={item.status === 'processing'}
             className="p-2 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
             title="Rotate"
           >
             <RotateCw className="w-4 h-4" />
           </button>
        )}
        <button 
          onClick={() => onRemove(item.id)}
          disabled={item.status === 'processing'}
          className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  </motion.div>
));

GridItemComponent.displayName = 'GridItemComponent';

export function FileGrid({ 
  items, 
  onRemove, 
  onMove, 
  onRotate, 
  onPreview,
  onAddMore,
  accept,
  maxFiles,
  onOpenConfig
}: FileGridProps) {
  const [showUploads, setShowUploads] = useState(false);
  const isLargeBatch = items.length > 40;
  const processingItems = items.filter(item => item.status === 'processing');
  const processingTotalSize = processingItems.reduce((acc, item) => acc + item.size, 0);
  const estimatedSeconds = processingTotalSize ? Math.max(3, Math.round(processingTotalSize / (14 * 1024 * 1024))) : 0;
  const hasReachedLimit = items.length >= maxFiles;
  const showUploadsPanel = hasReachedLimit || showUploads;

  return (
    <div className="space-y-6">
      {!hasReachedLimit && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowUploads(!showUploads)}
              className="flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-blue-500 text-neutral-600 dark:text-neutral-400 hover:text-blue-600 rounded-xl transition-all text-xs font-black uppercase tracking-widest shadow-sm active:scale-95"
            >
              {showUploads ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showUploads ? 'Hide Uploads' : 'Show Uploads'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500">{items.length}/{maxFiles}</span>
            {onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                className="p-3 bg-neutral-100 dark:bg-neutral-900 rounded-2xl text-neutral-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all"
                aria-label="Open PDF configuration"
              >
                <Settings2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {processingItems.length > 0 && (
        <div className="px-4 py-4 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-[28px] shadow-sm shadow-blue-500/10 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <div>
                <p className="text-sm font-black uppercase tracking-[0.35em] text-blue-600">Loading files</p>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
                  {processingItems.length} file{processingItems.length > 1 ? 's' : ''} • {formatBytes(processingTotalSize)}
                </p>
              </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-700">
              Est. {estimatedSeconds} sec
            </p>
          </div>
          <div className="h-2 w-full bg-blue-200 rounded-full overflow-hidden">
            <div className="h-full w-full bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 animate-[pulse_2.5s_ease-in-out_infinite]" />
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {showUploadsPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={isLargeBatch ? { duration: 0.1 } : { type: 'spring', damping: 25, stiffness: 200 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
              {items.map((item, idx) => (
                <GridItemComponent
                  key={item.id}
                  item={item}
                  idx={idx}
                  onMove={onMove}
                  onRemove={onRemove}
                  onRotate={onRotate}
                  onPreview={onPreview}
                  useLayout={!isLargeBatch}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
