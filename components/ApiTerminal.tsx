'use client';

import { useState } from 'react';
import { Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ApiTerminal() {
  const [activeTab, setActiveTab] = useState<'curl' | 'node' | 'python'>('node');

  const snippets = {
    curl: `curl -X POST https://api.apihub.example.com/api/v1/enrich/person \\
  -H "Authorization: Bearer sk_test_..." \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "+91-0000000000"}'`,
    node: `import { Client } from '@apihub/sdk';

const client = new Client({ apiKey: process.env.API_KEY });

const result = await client.enrich.person({
  phone: '+91-0000000000'
});

console.log(result);`,
    python: `import apihub

client = apihub.Client(api_key="sk_test_...")

result = client.enrich.person(
    phone="+91-0000000000"
)

print(result)`
  };

  const responseJson = `{
  "status": "success",
  "cost": {
    "credits_charged": 1
  },
  "data": {
    "person": {
      "name": "Jane Doe",
      "demographics": {
        "gender": "Female"
      },
      "companies": [
        {
          "cin": "U12345MH2024PTC000000",
          "name": "Synthetic Solutions Pvt Ltd",
          "designation": "Director"
        }
      ]
    }
  }
}`;

  return (
    <div className="rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-2xl flex flex-col w-full max-w-4xl mx-auto text-left text-sm mt-12 transform hover:scale-[1.01] transition-transform duration-300">
      {/* Window Header */}
      <div className="bg-[#2D2B3B] px-4 py-3 flex items-center gap-2 border-b border-neutral-800">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-semantic-error" />
          <div className="w-3 h-3 rounded-full bg-semantic-warning" />
          <div className="w-3 h-3 rounded-full bg-semantic-success" />
        </div>
        <div className="ml-4 text-neutral-400 font-mono text-xs flex items-center gap-2">
          <Terminal size={14} /> /api/v1/enrich/person
        </div>
      </div>

      <div className="flex flex-col md:flex-row h-full">
        {/* Left Side: Request */}
        <div className="flex-1 border-b md:border-b-0 md:border-r border-neutral-800 flex flex-col relative group">
          <div className="flex border-b border-neutral-800 bg-[#1A1924]">
            {(['curl', 'node', 'python'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors border-b-2",
                  activeTab === tab 
                    ? "text-brand border-brand bg-[#232231]" 
                    : "text-neutral-500 border-transparent hover:text-neutral-300 hover:bg-[#232231]/50"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="p-6 font-mono text-neutral-300 bg-[#1A1924] overflow-x-auto h-full flex-grow">
            <pre><code>{snippets[activeTab]}</code></pre>
          </div>
        </div>

        {/* Right Side: Response */}
        <div className="flex-1 flex flex-col bg-[#14131E]">
          <div className="px-6 py-2 border-b border-neutral-800 bg-[#14131E] font-mono text-xs text-neutral-500 uppercase tracking-wider h-[38px] flex items-center">
            Response
          </div>
          <div className="p-6 font-mono text-semantic-success overflow-x-auto relative flex-grow">
            <div className="text-neutral-600 mb-4 italic text-xs">
              // ILLUSTRATIVE SCHEMA - PENDING FINAL DEFINITION
            </div>
            <pre><code className="text-neutral-300">{responseJson}</code></pre>
          </div>
        </div>
      </div>
    </div>
  );
}
