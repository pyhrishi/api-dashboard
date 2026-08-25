import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HealthCardProps {
  title: string;
  value: string | number;
  delta: number;
  invertDeltaColor?: boolean;
}

export function HealthCard({ title, value, delta, invertDeltaColor = false }: HealthCardProps) {
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  
  let colorClass = 'text-neutral-500';
  if (isPositive) {
    colorClass = invertDeltaColor ? 'text-semantic-error' : 'text-semantic-success';
  } else if (isNegative) {
    colorClass = invertDeltaColor ? 'text-semantic-success' : 'text-semantic-error';
  }

  return (
    <div className="glass-inner p-6 rounded-2xl flex flex-col justify-between hover:border-white/20 transition-all hover:-translate-y-1 hover:shadow-2xl">
      <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">{title}</h3>
      <div className="flex items-end justify-between">
        <div className="text-4xl font-extrabold text-white tracking-tight">{value}</div>
        <div className={cn("flex items-center text-sm font-bold bg-white/5 px-2 py-1 rounded-md border border-white/10", colorClass)}>
          {isPositive ? <ArrowUp className="w-4 h-4 mr-1" /> : (isNegative ? <ArrowDown className="w-4 h-4 mr-1" /> : null)}
          {Math.abs(delta)}%
        </div>
      </div>
    </div>
  );
}
