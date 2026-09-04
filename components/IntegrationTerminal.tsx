'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, CheckCircle2, ChevronRight, ChevronDown, Terminal, FileCode2, Search, FileJson, FileKey2, Settings, Folder } from 'lucide-react';
import { API_CATALOG, CATEGORIES, type CodeSnippets } from '@/lib/api-catalog';

type Language = keyof CodeSnippets;

export function IntegrationTerminal() {
  const [mounted, setMounted] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState(API_CATALOG[0].id);
  const [activeLanguage, setActiveLanguage] = useState<Language>('node');
  const [isRunning, setIsRunning] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  
  // Expanded folders in the file explorer
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat.id]: true }), { 'src': true, 'endpoints': true })
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeScenario = API_CATALOG.find(s => s.id === activeScenarioId) || API_CATALOG[0];

  const handleRun = () => {
    if (isRunning) return;
    setIsRunning(true);
    setShowResponse(false);
    setTimeout(() => {
      setIsRunning(false);
      setShowResponse(true);
    }, 1200);
  };

  const handleScenarioChange = (id: string) => {
    setActiveScenarioId(id);
    setShowResponse(false);
    setIsRunning(false);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!mounted) {
    return (
      <div className="rounded-xl overflow-hidden shadow-2xl bg-[#1e1e1e] border border-[#333333] h-[750px]">
        <div className="h-10 bg-[#252526] border-b border-[#333333] flex items-center px-4">
           Loading Workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.6)] bg-[#1e1e1e] border border-[#333333] flex flex-col h-[800px] text-[#cccccc] font-sans">
      
      {/* WINDOW TITLE BAR */}
      <div className="h-10 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center px-4 shrink-0 select-none">
        <div className="flex gap-2 w-20">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <div className="flex-1 text-center text-xs text-[#858585] flex items-center justify-center gap-2">
          <Search className="w-3 h-3" /> zintlr-integration - Visual Studio Code
        </div>
        <div className="w-20" /> {/* Spacer */}
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* ACTIVITY BAR (Leftmost thin strip) */}
        <div className="w-12 bg-[#333333] flex flex-col items-center py-4 gap-6 shrink-0 border-r border-[#1e1e1e]">
          <FileCode2 className="w-6 h-6 text-fg cursor-pointer" />
          <Search className="w-6 h-6 text-[#858585] cursor-pointer hover:text-fg" />
          <Terminal className="w-6 h-6 text-[#858585] cursor-pointer hover:text-fg" />
          <div className="mt-auto pb-2">
            <Settings className="w-6 h-6 text-[#858585] cursor-pointer hover:text-fg" />
          </div>
        </div>

        {/* EXPLORER PANE */}
        <div className="w-64 bg-[#252526] border-r border-[#1e1e1e] flex flex-col shrink-0">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-[#cccccc] px-4 py-3 flex items-center">
            Explorer
          </div>
          
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-[#464646]">
            {/* Root Folder */}
            <div className="px-2">
              <button onClick={() => toggleFolder('root')} className="w-full flex items-center gap-1 hover:bg-[#2a2d2e] px-1 py-1 rounded text-sm font-bold text-[#cccccc]">
                {expandedFolders['root'] !== false ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                zintlr-integration
              </button>
              
              {expandedFolders['root'] !== false && (
                <div className="pl-4 mt-1 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 px-1 py-1 hover:bg-[#2a2d2e] rounded text-sm text-[#cccccc] cursor-pointer">
                    <FileJson className="w-4 h-4 text-[#cbcb41]" /> package.json
                  </div>
                  <div className="flex items-center gap-2 px-1 py-1 hover:bg-[#2a2d2e] rounded text-sm text-[#cccccc] cursor-pointer">
                    <FileKey2 className="w-4 h-4 text-[#858585]" /> .env
                  </div>

                  {/* src folder */}
                  <button onClick={() => toggleFolder('src')} className="w-full flex items-center gap-1 hover:bg-[#2a2d2e] px-1 py-1 rounded text-sm text-[#cccccc]">
                    {expandedFolders['src'] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Folder className="w-4 h-4 text-[#519aba]" /> src
                  </button>
                  
                  {expandedFolders['src'] && (
                    <div className="pl-4 flex flex-col gap-0.5">
                      {/* Dynamic Categories as Folders */}
                      {CATEGORIES.map(category => {
                        const categoryEndpoints = API_CATALOG.filter(e => e.categoryId === category.id);
                        if (categoryEndpoints.length === 0) return null;
                        const isExpanded = expandedFolders[category.id];

                        return (
                          <div key={category.id}>
                            <button onClick={() => toggleFolder(category.id)} className="w-full flex items-center gap-1 hover:bg-[#2a2d2e] px-1 py-1 rounded text-sm text-[#cccccc]">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              <Folder className="w-4 h-4 text-[#519aba]" /> {category.id}
                            </button>
                            
                            {isExpanded && (
                              <div className="pl-6 flex flex-col gap-0.5">
                                {categoryEndpoints.map(scenario => {
                                  const isActive = scenario.id === activeScenarioId;
                                  return (
                                    <button
                                      key={scenario.id}
                                      onClick={() => handleScenarioChange(scenario.id)}
                                      className={`w-full flex items-center gap-2 px-1 py-1 text-sm truncate ${isActive ? 'bg-[#37373d] text-fg' : 'hover:bg-[#2a2d2e] text-[#cccccc]'}`}
                                    >
                                      <FileCode2 className="w-4 h-4 text-[#519aba] shrink-0" />
                                      <span className="truncate">{scenario.id}.ts</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: EDITOR & TERMINAL */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
          
          {/* Editor Tabs */}
          <div className="flex bg-[#252526] h-10 shrink-0">
            <div className="flex items-center gap-2 px-4 bg-[#1e1e1e] border-t-2 border-t-[#007acc] text-[#ffffff] text-sm min-w-[120px]">
              <FileCode2 className="w-4 h-4 text-[#519aba]" />
              {activeScenario.id}.ts
            </div>
            
            {/* Language Switcher (Simulating different file extensions) */}
            <div className="ml-auto flex items-center px-4 gap-2">
              <span className="text-xs text-[#858585]">View as:</span>
              <div className="flex bg-[#333333] rounded">
                {(['node', 'python', 'curl'] as Language[]).map(lang => (
                  <button
                    key={lang}
                    onClick={() => {
                      setActiveLanguage(lang);
                      setShowResponse(false);
                    }}
                    className={`px-3 py-1 text-xs font-mono uppercase ${activeLanguage === lang ? 'bg-[#4d4d4d] text-fg' : 'text-[#858585] hover:text-[#cccccc]'}`}
                  >
                    {lang === 'node' ? 'TS' : lang === 'python' ? 'PY' : 'SH'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Breadcrumbs */}
          <div className="h-7 border-b border-[#2d2d2d] flex items-center px-4 gap-1 text-[13px] text-[#858585]">
            <span>zintlr-integration</span> <ChevronRight className="w-3 h-3" />
            <span>src</span> <ChevronRight className="w-3 h-3" />
            <span>{activeScenario.categoryId}</span> <ChevronRight className="w-3 h-3" />
            <span className="text-[#cccccc]">{activeScenario.id}.{activeLanguage === 'node' ? 'ts' : activeLanguage === 'python' ? 'py' : 'sh'}</span>
          </div>

          {/* Code Editor */}
          <div className="flex-1 overflow-y-auto bg-[#1e1e1e] relative p-4 flex">
            {/* Line Numbers */}
            <div className="w-8 shrink-0 text-right pr-4 text-[#858585] font-mono text-[14px] select-none leading-relaxed flex flex-col">
              {activeScenario.snippets[activeLanguage].split('\n').map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            {/* Code */}
            <div className="flex-1 font-mono text-[14px] leading-relaxed overflow-x-auto">
              <pre className="text-[#d4d4d4]">
                <code dangerouslySetInnerHTML={{
                  __html: activeScenario.snippets[activeLanguage]
                    .replace(/(".*?")/g, '<span style="color: #ce9178">$1</span>') // strings
                    .replace(/'(.*?)'/g, '<span style="color: #ce9178">\'$1\'</span>') // single strings
                    .replace(/(const|await|fetch|import|from|async|function|try|catch|let|var|if|return)/g, '<span style="color: #569cd6">$1</span>') // keywords
                    .replace(/\b(Headers|Response|JSON|console|process|env)\b/g, '<span style="color: #4ec9b0">$1</span>') // classes/objects
                    .replace(/(https?:\/\/[^\s"']+)/g, '<span style="color: #9cdcfe; text-decoration: underline;">$1</span>') // URLs
                }} />
              </pre>
            </div>

            {/* Run Button Overlay */}
            <div className="absolute top-4 right-6">
              <button
                onClick={handleRun}
                disabled={isRunning}
                className="bg-[#007acc] hover:bg-[#0098ff] text-fg px-3 py-1.5 rounded flex items-center gap-2 text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isRunning ? (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Play className="w-3 h-3" fill="currentColor" />
                )}
                {isRunning ? 'Executing...' : 'Run Code'}
              </button>
            </div>
          </div>

          {/* Integrated Terminal Panel */}
          <div className="h-64 border-t border-[#333333] bg-[#1e1e1e] flex flex-col shrink-0">
            {/* Panel Tabs */}
            <div className="flex h-9 border-b border-[#333333] px-4 gap-6 items-center">
              <div className="text-[11px] uppercase tracking-wider text-[#858585] cursor-pointer hover:text-[#cccccc]">Problems</div>
              <div className="text-[11px] uppercase tracking-wider text-[#858585] cursor-pointer hover:text-[#cccccc]">Output</div>
              <div className="text-[11px] uppercase tracking-wider text-[#e7e7e7] border-b-2 border-[#e7e7e7] h-full flex items-center">Terminal</div>
            </div>
            
            {/* Terminal Output */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed">
              {!isRunning && !showResponse && (
                <div className="text-[#cccccc]">
                  <span className="text-[#39a061]">admin@macbook</span> <span className="text-[#c66e95]">~/zintlr-integration</span> $ node src/{activeScenario.categoryId}/{activeScenario.id}.ts
                </div>
              )}

              {isRunning && (
                <div className="text-[#cccccc]">
                  <span className="text-[#39a061]">admin@macbook</span> <span className="text-[#c66e95]">~/zintlr-integration</span> $ node src/{activeScenario.categoryId}/{activeScenario.id}.ts<br/>
                  <span className="text-[#858585]">Running script... establishing secure connection to api.zinbit.zintlr.com...</span>
                </div>
              )}

              <AnimatePresence>
                {showResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[#cccccc]"
                  >
                    <span className="text-[#39a061]">admin@macbook</span> <span className="text-[#c66e95]">~/zintlr-integration</span> $ node src/{activeScenario.categoryId}/{activeScenario.id}.ts<br/>
                    <div className="mt-2 text-[#4fc1ff] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#39a061]" /> [200 OK] Fetched in {activeScenario.latency}
                    </div>
                    <pre className="mt-2 text-[#ce9178] whitespace-pre-wrap">
                      {activeScenario.response}
                    </pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
