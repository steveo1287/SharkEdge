import { cn } from '@/lib/utils/cn';

export function TeamBadge({ code, logo, name, size = 'md' }: { code: string; logo: string; name?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <div className={cn('flex items-center gap-3', name && 'min-w-0')}>
      <div className={cn('overflow-hidden rounded-xl border border-white/10 bg-white/5 p-1.5', dims)}>
        <img src={logo} alt={code} className="h-full w-full object-contain" />
      </div>
      {name ? (
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold text-white">{code}</div>
          <div className="truncate text-[0.68rem] uppercase tracking-[0.2em] text-slate-500">{name}</div>
        </div>
      ) : null}
    </div>
  );
}
