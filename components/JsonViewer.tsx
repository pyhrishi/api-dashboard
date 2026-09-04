import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Unlock, Key, Check } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { checkIsPii, applySmartMask, PIIType } from '@/lib/redaction-engine';

const RedactedChip = ({ originalValue, type, logId }: { originalValue: string, type: PIIType | 'key', logId?: string }) => {
  const { user, addAuditLog } = useStore();
  const [isDecrypted, setIsDecrypted] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [denied, setDenied] = useState(false);

  const handleDecrypt = () => {
    if (isDecrypted) {
      setIsDecrypted(false);
      return;
    }
    
    // RBAC Check
    if (user?.role !== 'admin') {
      setDenied(true);
      setTimeout(() => setDenied(false), 2000);
      return;
    }

    setIsDecrypting(true);
    // Simulate decryption delay
    setTimeout(() => {
      setIsDecrypting(false);
      setIsDecrypted(true);
      if (logId) {
        addAuditLog('Decrypted PII Payload', `Log ID: ${logId}`);
      }
    }, 600);
  };

  if (isDecrypted) {
    return (
      <span className="relative group inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded ml-1 cursor-pointer" onClick={handleDecrypt}>
        <Unlock className="w-3 h-3" />
        <span className="font-mono text-emerald-400">&quot;{originalValue}&quot;</span>
      </span>
    );
  }

  return (
    <motion.button
      onClick={handleDecrypt}
      disabled={isDecrypting}
      animate={denied ? { x: [-5, 5, -5, 5, 0] } : {}}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative inline-flex items-center gap-1.5 px-2 py-0.5 rounded ml-1 font-black text-[10px] uppercase tracking-widest transition-all overflow-hidden border",
        isDecrypting 
          ? "bg-amber-500/10 border-amber-500/30 text-amber-500 w-24 justify-center" 
          : denied 
            ? "bg-semantic-error/10 border-semantic-error/30 text-semantic-error"
            : "bg-glass border-border text-fg-muted hover:bg-glass-2 hover:text-fg-muted hover:border-border-strong shadow-inner"
      )}
    >
      {isDecrypting ? (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <Key className="w-3 h-3" />
        </motion.div>
      ) : denied ? (
        <Lock className="w-3 h-3" />
      ) : (
        <Lock className="w-3 h-3" />
      )}
      {isDecrypting ? 'Decrypting' : denied ? 'Access Denied' : `Redacted: ${applySmartMask(originalValue, type)}`}
    </motion.button>
  );
};

const JsonNode = ({ data, nodeKey, isLast, depth = 0, logId }: { data: unknown, nodeKey?: string, isLast: boolean, depth?: number, logId?: string }) => {
  const { privacySettings } = useStore();
  
  if (data === null) {
    return <span><span className="text-purple-400">null</span>{isLast ? '' : ','}</span>;
  }
  
  if (typeof data === 'boolean') {
    return <span><span className="text-blue-400">{data ? 'true' : 'false'}</span>{isLast ? '' : ','}</span>;
  }
  
  if (typeof data === 'number') {
    return <span><span className="text-emerald-400">{data}</span>{isLast ? '' : ','}</span>;
  }
  
  if (typeof data === 'string') {
    let piiType: PIIType | null = null;
    let isKeyRedacted = false;

    // Check custom keys
    if (nodeKey && privacySettings.customKeys.includes(nodeKey.toLowerCase())) {
      isKeyRedacted = true;
    }

    // Check auto PII
    if (!isKeyRedacted && privacySettings.autoRedactPII) {
      piiType = checkIsPii(data);
    }

    const chipType: PIIType | 'key' | null = isKeyRedacted ? 'key' : piiType;
    if (chipType) {
      return (
        <span>
          <RedactedChip originalValue={data} type={chipType} logId={logId} />
          {isLast ? '' : ','}
        </span>
      );
    }

    return <span><span className="text-amber-300">&quot;{data}&quot;</span>{isLast ? '' : ','}</span>;
  }
  
  if (Array.isArray(data)) {
    if (data.length === 0) return <span>[]{isLast ? '' : ','}</span>;
    
    return (
      <span className="text-fg">
        [
        <div className="pl-4 border-l border-border-subtle ml-1">
          {data.map((item, i) => (
            <div key={i}>
              <JsonNode data={item} isLast={i === data.length - 1} depth={depth + 1} logId={logId} />
            </div>
          ))}
        </div>
        ]{isLast ? '' : ','}
      </span>
    );
  }
  
  if (typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length === 0) return <span>{'{ }'}{isLast ? '' : ','}</span>;
    
    return (
      <span className="text-fg">
        {'{'}
        <div className="pl-4 border-l border-border-subtle ml-1">
          {keys.map((k, i) => (
            <div key={k}>
              <span className="text-indigo-300">&quot;{k}&quot;</span>: <JsonNode data={rec[k]} nodeKey={k} isLast={i === keys.length - 1} depth={depth + 1} logId={logId} />
            </div>
          ))}
        </div>
        {'}'}{isLast ? '' : ','}
      </span>
    );
  }
  
  return <span>{String(data)}{isLast ? '' : ','}</span>;
};

export function JsonViewer({ data, className, logId }: { data: unknown, className?: string, logId?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className={cn("relative group rounded-xl overflow-hidden border border-border-subtle bg-surface shadow-inner font-mono text-xs", className)}>
      <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
      
      <div className="absolute right-3 top-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-border text-fg-muted hover:text-fg transition-all shadow-sm"
          title="Copy raw JSON"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-teal" /> : <span className="text-[10px] font-bold uppercase tracking-widest px-1">Copy</span>}
        </button>
      </div>
      
      <div className="overflow-x-auto p-5">
        <JsonNode data={data} isLast={true} logId={logId} />
      </div>
    </div>
  );
}
