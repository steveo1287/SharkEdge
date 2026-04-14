import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-400/20 bg-sky-500/10 shadow-[0_0_25px_rgba(68,164,255,0.2)]">
        <svg viewBox="0 0 64 64" className="h-7 w-7" fill="none">
          <path d="M13 37c8-16 21-25 38-28-6 7-10 15-12 23 6 0 11 2 15 6-11 1-20 4-27 9-3 2-7 5-11 9 1-5 0-10-3-14z" fill="#44a4ff" />
          <path d="M35 19c5 4 8 9 9 14-5 0-9 1-12 4 0-6 1-12 3-18z" fill="#d1ac63" opacity=".95" />
          <path d="M18 34c10-10 22-16 35-18-9 6-15 13-19 22-5 1-10 4-16 10 0-5-1-9-4-14 1 0 2 0 4 0z" fill="#f7fbff" opacity=".12" />
        </svg>
      </div>
      <div className={cn('min-w-0', compact && 'hidden xl:block')}>
        <div className="font-display text-[1.02rem] font-bold tracking-[0.16em] text-white">SHARKEDGE</div>
        <div className="text-[0.62rem] uppercase tracking-[0.32em] text-slate-500">Quant sports intelligence</div>
      </div>
    </Link>
  );
}
