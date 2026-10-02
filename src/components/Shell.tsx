import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { adminToken } from '../lib/api';
import { BrandMark } from './BrandMark';

export function Shell({ children }: { children: ReactNode }) {
  function signOut() {
    adminToken.clear();
    location.reload();
  }
  return (
    <div className="flex h-full flex-col bg-spaceGrey">
      <header className="flex h-12 flex-none items-center gap-2.5 px-4 text-white">
        <BrandMark className="size-7 text-[13px]" />
        <span className="select-none text-[15px] font-extrabold tracking-[-0.03em]">
          Prototype<span className="text-brand">.</span>
        </span>
        <button
          onClick={signOut}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      </header>
      <main className="mx-2 mb-2 min-h-0 flex-1 overflow-auto rounded-xl bg-background">{children}</main>
    </div>
  );
}
