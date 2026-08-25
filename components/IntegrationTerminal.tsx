'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneCall, Building2, SearchCheck, Play, CheckCircle2 } from 'lucide-react';

const scenarios = [
  {
    id: 'email-to-phone',
    name: 'Resolve Email to Phone',
    icon: <PhoneCall className="w-4 h-4" />,
    desc: 'Input a corporate email, get a direct-dial phone number.',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/b2b2b/v1/email-to-phone/ \\
  -H "Access-Token: sk_live_••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "emails": ["ceo@example.com"]
  }'`,
      node: `const response = await fetch('https://api.zintlr.com/b2b2b/v1/email-to-phone/', {
  method: 'POST',
  headers: {
    'Access-Token': 'sk_live_••••••',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    emails: ['ceo@example.com']
  })
});
const data = await response.json();
console.log(data);`,
      python: `import requests

url = "https://api.zintlr.com/b2b2b/v1/email-to-phone/"
headers = {
    "Access-Token": "sk_live_••••••",
    "Content-Type": "application/json"
}
payload = {
    "emails": ["ceo@example.com"]
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`
    },
    response: `{
  "status": "success",
  "data": [
    {
      "email": "ceo@example.com",
      "person_name": "Jane Doe",
      "direct_dial": "+1 (555) 123-4567",
      "confidence_score": 0.99
    }
  ],
  "meta": { "credits_used": 1 }
}`
  },
  {
    id: 'domain-to-cin',
    name: 'Verify Company (Domain to CIN)',
    icon: <Building2 className="w-4 h-4" />,
    desc: 'Input a domain, get verified MCA registry data.',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/b2b2b/v1/domain-to-cin/ \\
  -H "Access-Token: sk_live_••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "domain_list": ["example.in"]
  }'`,
      node: `const response = await fetch('https://api.zintlr.com/b2b2b/v1/domain-to-cin/', {
  method: 'POST',
  headers: {
    'Access-Token': 'sk_live_••••••',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    domain_list: ['example.in']
  })
});
const data = await response.json();`,
      python: `import requests

url = "https://api.zintlr.com/b2b2b/v1/domain-to-cin/"
headers = {
    "Access-Token": "sk_live_••••••",
    "Content-Type": "application/json"
}
payload = {
    "domain_list": ["example.in"]
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`
    },
    response: `{
  "status": "success",
  "data": [
    {
      "domain": "example.in",
      "cin": "U72900KA2021PTC142000",
      "legal_name": "Example India Pvt Ltd",
      "status": "Active"
    }
  ]
}`
  },
  {
    id: 'person-search',
    name: 'Graph Search',
    icon: <SearchCheck className="w-4 h-4" />,
    desc: 'Query 400M+ profiles using natural criteria.',
    snippets: {
      curl: `curl -X POST https://api.zintlr.com/b2b2b/v1/person-search/ \\
  -H "Access-Token: sk_live_••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "CTO",
    "location": "Bangalore"
  }'`,
      node: `const response = await fetch('https://api.zintlr.com/b2b2b/v1/person-search/', {
  method: 'POST',
  headers: {
    'Access-Token': 'sk_live_••••••',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'CTO',
    location: 'Bangalore'
  })
});
const data = await response.json();`,
      python: `import requests

url = "https://api.zintlr.com/b2b2b/v1/person-search/"
headers = {
    "Access-Token": "sk_live_••••••",
    "Content-Type": "application/json"
}
payload = {
    "title": "CTO",
    "location": "Bangalore"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`
    },
    response: `{
  "status": "success",
  "data": [
    {
      "name": "John Smith",
      "title": "CTO",
      "company": "TechCorp",
      "location": "Bangalore, India"
    }
  ],
  "meta": { "total_results": 1450 }
}`
  }
];

type Language = 'curl' | 'node' | 'python';

export function IntegrationTerminal() {
  const [activeScenarioId, setActiveScenarioId] = useState(scenarios[0].id);
  const [activeLanguage, setActiveLanguage] = useState<Language>('curl');
  const [isRunning, setIsRunning] = useState(false);
  const [showResponse, setShowResponse] = useState(false);

  const activeScenario = scenarios.find(s => s.id === activeScenarioId)!;

  const handleRun = () => {
    if (isRunning || showResponse) {
      setShowResponse(false);
      setIsRunning(false);
      return;
    }
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setShowResponse(true);
    }, 800); // simulate network latency
  };

  const handleScenarioChange = (id: string) => {
    setActiveScenarioId(id);
    setShowResponse(false);
    setIsRunning(false);
  };

  return (
    <div className="glass rounded-3xl overflow-hidden border-gradient shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
      <div className="grid lg:grid-cols-[300px_1fr] h-[600px]">
        
        {/* LEFT PANE: Endpoints */}
        <div className="bg-ink/60 border-r border-white/10 flex flex-col">
          <div className="p-6 border-b border-white/5">
            <h3 className="text-white font-bold mb-1">Endpoints</h3>
            <p className="text-white/40 text-sm">Select an endpoint to view integration code.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {scenarios.map(scenario => {
              const isActive = scenario.id === activeScenarioId;
              return (
                <button
                  key={scenario.id}
                  onClick={() => handleScenarioChange(scenario.id)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-300 ${
                    isActive 
                      ? 'bg-teal/10 border border-teal/30 shadow-[inset_0_0_20px_rgba(70,189,198,0.1)]' 
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <div className={`flex items-center gap-3 font-semibold mb-2 ${isActive ? 'text-teal' : 'text-white'}`}>
                    {scenario.icon} {scenario.name}
                  </div>
                  <div className={`text-xs ${isActive ? 'text-white/70' : 'text-white/40'}`}>
                    {scenario.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: Code & Response */}
        <div className="bg-[#09090B] flex flex-col relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-teal/10 blur-[100px] pointer-events-none rounded-full" />
          
          {/* Header / Language Switcher */}
          <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#111115]">
            <div className="flex space-x-1 p-1 bg-white/5 rounded-lg">
              {(['curl', 'node', 'python'] as Language[]).map(lang => (
                <button
                  key={lang}
                  onClick={() => setActiveLanguage(lang)}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                    activeLanguage === lang 
                      ? 'bg-white/10 text-white shadow-sm' 
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {lang === 'node' ? 'Node.js' : lang}
                </button>
              ))}
            </div>
            <button 
              onClick={handleRun}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                showResponse 
                  ? 'bg-white/10 text-white hover:bg-white/20' 
                  : 'bg-teal text-ink shadow-[0_0_15px_rgba(70,189,198,0.4)] hover:bg-teal-ice hover:shadow-[0_0_20px_rgba(70,189,198,0.6)] hover:-translate-y-0.5'
              }`}
            >
              {showResponse ? (
                'Reset'
              ) : isRunning ? (
                <>
                  <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" fill="currentColor" />
                  Run Request
                </>
              )}
            </button>
          </div>

          {/* Editor Area */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <AnimatePresence mode="popLayout">
              {/* REQUEST SNIPPET */}
              <motion.div
                key={`req-${activeScenarioId}-${activeLanguage}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className={`flex-1 p-6 overflow-y-auto font-mono text-sm ${showResponse ? 'pb-2' : ''}`}
              >
                <div className="text-white/30 text-xs font-bold mb-3 uppercase tracking-widest">
                  {activeLanguage} Request
                </div>
                <pre className="text-white/80 leading-relaxed whitespace-pre-wrap">
                  <code dangerouslySetInnerHTML={{
                    __html: activeScenario.snippets[activeLanguage]
                      .replace(/(".*?")/g, '<span class="text-teal-ice">$1</span>')
                      .replace(/(const|await|fetch|import|requests|method|headers|body|json)/g, '<span class="text-teal">$1</span>')
                  }} />
                </pre>
              </motion.div>

              {/* RESPONSE PANEL */}
              {showResponse && (
                <motion.div
                  key={`res-${activeScenarioId}`}
                  initial={{ opacity: 0, y: "100%" }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: "100%" }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute bottom-0 left-0 right-0 h-[55%] bg-[#111115] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col"
                >
                  <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#18181B]">
                    <div className="text-semantic-success text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      200 OK
                    </div>
                    <div className="text-white/30 text-xs font-mono">124ms</div>
                  </div>
                  <div className="flex-1 p-6 overflow-y-auto font-mono text-sm">
                    <pre className="text-white/70 leading-relaxed">
                      <code dangerouslySetInnerHTML={{
                        __html: activeScenario.response
                          .replace(/"(.*?)":/g, '<span class="text-teal">"$1"</span>:')
                          .replace(/"(.*?)"/g, (match, p1) => match.includes(':') ? match : `<span class="text-teal-ice">"${p1}"</span>`)
                          .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-semantic-success">$1</span>')
                      }} />
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
