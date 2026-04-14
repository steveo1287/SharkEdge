import { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { Statusbar } from './statusbar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell-grid min-h-screen text-white">
      <div className="mx-auto flex min-h-screen max-w-[1760px] gap-0 xl:px-6 xl:py-6">
        <aside className="hidden w-[290px] shrink-0 xl:block">
          <div className="workspace-frame h-full overflow-hidden">
            <Sidebar />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col xl:pl-6">
          <div className="workspace-frame flex min-h-screen flex-col xl:min-h-[calc(100vh-3rem)]">
            <Topbar />
            <main className="workspace-main flex-1 overflow-y-auto">
              <div className="page-shell">{children}</div>
            </main>
            <Statusbar />
          </div>
        </div>
      </div>
    </div>
  );
}
