import React, { useCallback, useState } from 'react';
import { Upload, File, FileText, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatBytes } from '../lib/utils';

interface InvalidFileInfo {
  name: string;
  reason: string;
}

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxFiles?: number;
  existingFilesCount?: number;
  maxFilesMessage?: string;
  invalidTypeMessage?: string;
  maxFilesStrict?: boolean;
  label?: string;
  className?: string;
  isProcessing?: boolean;
  processingFilesCount?: number;
  processingTotalSize?: number;
  onError?: (message: string) => void;
}

export function Dropzone({ 
  onFilesSelected, 
  accept = { 'application/pdf': ['.pdf'] }, 
  maxFiles = 1,
  existingFilesCount = 0,
  maxFilesMessage,
  invalidTypeMessage,
  maxFilesStrict = false,
  label = "Click to upload or drag and drop",
  className,
  isProcessing = false,
  processingFilesCount,
  processingTotalSize,
  onError
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [invalidFiles, setInvalidFiles] = useState<InvalidFileInfo[]>([]);

  const totalSelectedSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const acceptedLabel = Object.keys(accept).includes('application/pdf') ? 'PDF' : 'file(s)';
  const supportedFormats = Object.values(accept).flat().join(', ');
  const remainingSlots = Math.max(0, maxFiles - existingFilesCount);

  const estimatedSeconds = processingTotalSize ? Math.max(3, Math.round(processingTotalSize / (16 * 1024 * 1024))) : 0;
  const processingSummary = processingFilesCount ? `${processingFilesCount} file${processingFilesCount > 1 ? 's' : ''}` : null;
  const processingSizeLabel = processingTotalSize ? formatBytes(processingTotalSize) : null;

  const preparationLabel = () => {
    if (selectedFiles.length === 0) {
      return label;
    }
    if (isProcessing) {
      return remainingSlots === 1 && acceptedLabel === 'PDF'
        ? 'Analyzing PDF...'
        : `Preparing ${selectedFiles.length} ${selectedFiles.length === 1 ? 'file' : 'files'}...`;
    }
    return 'Ready to process';
  };

  const preparationSubtext = () => {
    if (selectedFiles.length === 0) {
      return maxFiles === 1 ? 'Single file mode enabled.' : `Batch mode: up to ${maxFiles} files allowed.`;
    }
    if (isProcessing) {
      return acceptedLabel === 'PDF'
        ? 'Generating previews and validating upload.'
        : 'Verifying selected files before conversion.';
    }
    return `${selectedFiles.length} selected • ${formatBytes(totalSelectedSize)}`;
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    setSuccess(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    validateAndProcess(files);
  };

  const onHandleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(false);
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      validateAndProcess(files);
      e.target.value = '';
    }
  };

  const validateAndProcess = (files: File[]) => {
    if (isProcessing) return;
    setInvalidFiles([]);
    setSelectedFiles([]);

    if (files.length === 0) {
      return;
    }

    const allowedTypes = Object.keys(accept);
    const allowedExts = Object.values(accept).flat();

    const invalid: InvalidFileInfo[] = [];
    const validFiles = files.filter((file) => {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      const isAllowedType = allowedTypes.includes(file.type);
      const isAllowedExt = allowedExts.includes(extension);
      if (!isAllowedType && !isAllowedExt) {
        invalid.push({
          name: file.name,
          reason: invalidTypeMessage ?? `Only ${supportedFormats} ${acceptedLabel.toLowerCase()} are supported.`
        });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      const message = invalid.length > 0
        ? invalid[0].reason
        : `No valid files detected. Please check the file formats and try again.`;
      setError(message);
      onError?.(message);
      setInvalidFiles(invalid);
      return;
    }

    if (remainingSlots === 0) {
      const message = maxFilesMessage ?? `Maximum ${maxFiles} ${acceptedLabel.toLowerCase()} allowed.`;
      setError(message);
      onError?.(message);
      setInvalidFiles(validFiles.map((file) => ({ name: file.name, reason: 'Upload limit reached.' })));
      return;
    }

    const selected = validFiles.slice(0, remainingSlots);
    const rejectedByLimit = validFiles.slice(remainingSlots).map((file) => ({
      name: file.name,
      reason: maxFilesStrict
        ? maxFilesMessage ?? `Maximum ${maxFiles} ${acceptedLabel.toLowerCase()} allowed.`
        : 'This file was skipped because it exceeds the upload limit.'
    }));

    if (validFiles.length > remainingSlots) {
      const message = maxFilesMessage ?? `Maximum ${maxFiles} ${acceptedLabel.toLowerCase()} allowed.`;
      setError(message);
      onError?.(message);
      setInvalidFiles([...invalid, ...rejectedByLimit]);
      if (maxFilesStrict && existingFilesCount === 0) {
        return;
      }
    } else {
      setInvalidFiles(invalid);
    }

    if (selected.length > 0) {
      setSelectedFiles(selected);
      setSuccess(true);
      onFilesSelected(selected);
      window.setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <div className={cn("w-full transition-all duration-500", className)}>
      <label 
        className={cn(
          "relative flex flex-col items-center justify-center w-full h-[400px] border-2 border-dashed rounded-[32px] cursor-pointer transition-all duration-300 group overflow-hidden",
          isDragging 
            ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 scale-[0.99] shadow-inner" 
            : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm",
          isProcessing && "pointer-events-none opacity-80"
        )}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <AnimatePresence mode="wait">
          {(selectedFiles.length > 0 || isProcessing) ? (
            <motion.div
              key="selected"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col justify-between h-full w-full p-8"
            >
              <div className="space-y-5 text-center">
                <div className="mx-auto inline-flex items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20 w-20 h-20">
                  <FileText className="w-10 h-10 text-blue-600" />
                </div>
                <div className="space-y-2">
                  <p className="text-2xl font-black tracking-tighter text-neutral-900 dark:text-neutral-100">{preparationLabel()}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">{preparationSubtext()}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Selected files</p>
                    <p className="text-sm font-black text-neutral-900 dark:text-white">{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Total size</p>
                    <p className="text-sm font-black text-neutral-900 dark:text-white">{formatBytes(totalSelectedSize)}</p>
                  </div>
                </div>

                <div className="grid gap-3 max-h-52 overflow-y-auto pr-2 text-left">
                  {selectedFiles.map((file, index) => (
                    <div key={file.name + index} className="flex items-center justify-between gap-3 px-4 py-3 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-black text-neutral-900 dark:text-white">{file.name}</p>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">{formatBytes(file.size)}</p>
                      </div>
                      <span className="text-[10px] font-black uppercase text-blue-600">{index + 1}</span>
                    </div>
                  ))}
                </div>

                {invalidFiles.length > 0 && (
                  <div className="space-y-2 rounded-3xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-200">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">Rejected files</p>
                    <div className="space-y-2">
                      {invalidFiles.map((file) => (
                        <div key={file.name} className="flex items-start gap-3">
                          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-600">•</span>
                          <div className="min-w-0">
                            <p className="truncate font-black">{file.name}</p>
                            <p className="text-[10px] text-red-500">{file.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-4">
                {isProcessing ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-blue-600/10 px-4 py-2 text-blue-600 text-xs font-black uppercase tracking-[0.2em]">
                    <Loader2 className="w-4 h-4 animate-spin" /> Preparing upload
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full bg-green-600/10 px-4 py-2 text-green-700 text-xs font-black uppercase tracking-[0.2em]">
                    <CheckCircle2 className="w-4 h-4" /> Ready to process
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center pt-5 pb-6 px-10 text-center"
            >
              <div className="w-24 h-24 mb-8 bg-neutral-100 dark:bg-neutral-800 rounded-[32px] flex items-center justify-center text-neutral-400 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 relative">
                {maxFiles > 1 ? <FileText className="w-12 h-12" /> : <File className="w-12 h-12" />}
                <div className="absolute inset-0 bg-blue-500/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <h3 className="mb-4 text-2xl font-black tracking-tighter text-neutral-900 dark:text-neutral-100 italic">
                {label}
              </h3>
              
              <div className="flex flex-col gap-2 mb-10">
                <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium max-w-xs mx-auto">
                  {maxFiles === 1 ? 'Single file mode enabled.' : `Batch mode: up to ${maxFiles} files allowed.`}
                </p>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500">Supported formats: {supportedFormats}</p>
              </div>
              
              <div className="px-8 py-4 bg-blue-600 group-hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all active:scale-95 flex items-center gap-3">
                <Upload className="w-5 h-5" />
                Select Files
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Messages */}
        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-2">
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-red-500 text-xs font-bold bg-white dark:bg-neutral-900 border border-red-100 dark:border-red-900/30 px-6 py-2.5 rounded-2xl shadow-xl shadow-red-500/10"
              >
                <AlertCircle className="w-4 h-4" />
                {error}
              </motion.div>
            )}
            
            {success && !error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-green-500 text-xs font-bold bg-white dark:bg-neutral-900 border border-green-100 dark:border-green-900/30 px-6 py-2.5 rounded-2xl shadow-xl shadow-green-500/10"
              >
                <CheckCircle2 className="w-4 h-4" />
                Files analyzed successfully.
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <input 
          type="file" 
          className="hidden" 
          accept={Object.values(accept).flat().join(',')} 
          multiple={maxFiles > 1}
          onChange={onHandleChange}
        />
      </label>
    </div>
  );
}
