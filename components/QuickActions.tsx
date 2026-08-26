import Link from 'next/link';
import { Key, Play, BookOpen, CreditCard, ArrowRight } from 'lucide-react';

export function QuickActions() {
  const actions = [
    { 
      title: 'Generate API Key', 
      desc: 'Create keys for development or production.', 
      icon: <Key className="w-6 h-6" />, 
      href: '/console/keys',
      color: 'bg-teal/10 text-teal border-teal/20',
      hover: 'hover:border-teal/50 hover:bg-teal/20'
    },
    { 
      title: 'API Explorer', 
      desc: 'Test endpoints in the live sandbox.', 
      icon: <Play className="w-6 h-6" />, 
      href: '/console/explorer',
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      hover: 'hover:border-blue-500/50 hover:bg-blue-500/20'
    },
    { 
      title: 'Documentation', 
      desc: 'Read SDK guides and endpoint specs.', 
      icon: <BookOpen className="w-6 h-6" />, 
      href: '/docs',
      color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      hover: 'hover:border-purple-500/50 hover:bg-purple-500/20'
    },
    { 
      title: 'Billing & Usage', 
      desc: 'View consumption and upgrade plan.', 
      icon: <CreditCard className="w-6 h-6" />, 
      href: '/console/billing',
      color: 'bg-[#C47B0A]/10 text-[#C47B0A] border-[#C47B0A]/20',
      hover: 'hover:border-[#C47B0A]/50 hover:bg-[#C47B0A]/20'
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
      {actions.map((action, idx) => (
        <Link 
          key={idx}
          href={action.href}
          className="group relative flex flex-col p-6 rounded-2xl bg-[#111115] border border-white/10 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 overflow-hidden"
        >
          {/* Subtle hover gradient background */}
          <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${action.color.split(' ')[0]}`} />
          
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${action.color} ${action.hover}`}>
            {action.icon}
          </div>
          
          <h3 className="text-white font-bold text-lg mb-1">{action.title}</h3>
          <p className="text-white/50 text-sm flex-1">{action.desc}</p>
          
          <div className="mt-4 flex items-center gap-1 text-sm font-bold text-white/30 group-hover:text-white transition-colors">
            Go <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      ))}
    </div>
  );
}
