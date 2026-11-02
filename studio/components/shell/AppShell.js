'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Menu,
  X,
  Search,
  Bell,
  Sun,
  Moon,
  ChevronsLeft,
  ChevronsRight,
  Activity,
  ExternalLink,
  AlertTriangle,
  Info,
  OctagonAlert,
  Pickaxe,
  LogOut,
} from 'lucide-react';
import { NAV } from './nav';
import CommandPalette from './CommandPalette';
import { ALERTS } from '@/lib/site-data';
import { cn } from '@/lib/utils';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';
import { Badge, BadgeWithIcon } from '@/components/untitledui/base/badges/badges';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // stay on the SSR default until mounted so server and first client render match
  const dark = !mounted || theme !== 'light';
  return (
    <ButtonUtility
      size="sm"
      color="tertiary"
      tooltip={dark ? 'Light theme' : 'Dark theme'}
      icon={mounted && !dark ? Sun : Moon}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    />
  );
}

function Notifications({ open, onClose }) {
  if (!open) return null;
  const ICONS = { bad: OctagonAlert, warn: AlertTriangle, info: Info };
  const COLOR = { bad: 'text-error-primary', warn: 'text-warning-primary', info: 'text-fg-tertiary' };
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-[calc(100%+10px)] w-[340px] rounded-lg border border-border-secondary bg-bg-primary shadow-xl z-50 overflow-hidden pop-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-tertiary">
          <span className="text-sm font-semibold text-fg-primary">Alerts</span>
          <Badge color="warning" size="sm">{ALERTS.length} open</Badge>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {ALERTS.map((a) => {
            const Icon = ICONS[a.level] || Info;
            return (
              <Link key={a.title} href={a.href} onClick={onClose} className="flex gap-3 px-4 py-3 border-b border-border-tertiary last:border-0 hover:bg-bg-secondary transition-colors">
                <Icon size={15} className={cn('shrink-0 mt-0.5', COLOR[a.level] || COLOR.info)} />
                <span>
                  <span className="block text-[12.5px] font-semibold text-fg-primary">{a.title}</span>
                  <span className="block text-[11.5px] text-fg-tertiary mt-0.5 leading-snug">{a.body}</span>
                  <span className="block text-[10.5px] text-fg-quaternary mt-1 font-mono">{a.when}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* 10-15 DREAMS CONVERSION: dark sidebar with custom links (replaces the UUI
   NavList so the always-dark palette is fully controlled). */
function NavGroups({ collapsed, onNavigate }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto pb-4 px-3">
      {NAV.map((g) => (
        <div key={g.group}>
          {collapsed ? (
            <div className="mx-2 my-2.5 h-px bg-white/10" />
          ) : (
            <div className="qs-side-group">{g.group}</div>
          )}
          <div className={cn('space-y-0.5', collapsed && 'qs-rail')}>
            {g.items.map((i) => {
              const active = pathname === i.href;
              const Icon = i.icon;
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={onNavigate}
                  title={collapsed ? i.label : undefined}
                  className={cn('qs-side-link', active && 'active')}
                >
                  <Icon />
                  <span className="truncate">{i.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className={cn('mt-5 pt-4 border-t border-white/10', collapsed ? 'flex justify-center' : '')}>
        <a
          href="https://muzzamilhassan.github.io/quarrystudio/dashboard.html"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-2 text-[12px] text-[#6b7671] hover:text-[#98a2a7] transition-colors"
          title="TikTok dashboard"
        >
          <ExternalLink size={13} />
          {!collapsed ? 'TikTok dashboard' : null}
        </a>
      </div>
    </nav>
  );
}

function Brand({ collapsed }) {
  return (
    <Link href="/" className="flex items-center gap-3 px-5 h-[58px] shrink-0 border-b border-white/10 active:scale-[0.98] transition-transform duration-100 ease-out">
      <span
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{ background: 'var(--accent)' }}
      >
        <Pickaxe size={16} color="#0a0a0a" strokeWidth={2.4} />
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block font-display font-bold text-[15px] tracking-tight text-white leading-none">Quarry Studio</span>
          <span className="block text-[10.5px] text-[#6b7671] mt-0.5">Command Center</span>
        </span>
      ) : null}
    </Link>
  );
}

export default function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('qs-sidebar') === '1');
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('qs-sidebar', collapsed ? '1' : '0');
    } catch {}
  }, [collapsed]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  // Bare pages — no sidebar, no topbar: login, the public /proof sales page,
  // and the DFY client workspace (it has its own minimal chrome).
  if (pathname === '/login' || pathname === '/proof' || pathname === '/client') return <>{children}</>;

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {}
    router.replace('/login');
  };

  const current = NAV.flatMap((g) => g.items).find((i) => i.href === pathname);
  const pageTitle = current ? current.label : 'Quarry Studio';

  const sidebarInner = (collapsedState, isMobile = false) => (
    <>
      <Brand collapsed={collapsedState && !isMobile} />
      <NavGroups collapsed={collapsedState && !isMobile} onNavigate={() => setMobileOpen(false)} />
      <div className={cn('qs-side-foot p-3 shrink-0', collapsedState && !isMobile ? 'flex flex-col items-center gap-2' : 'flex items-center justify-between')}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: '#17b26a' }} />
          {!collapsedState || isMobile ? (
            <span className="text-[11px] text-[#98a2a7] truncate">
              Engine connected <span className="text-[#6b7671]">· 16 brands</span>
            </span>
          ) : null}
        </div>
        {!isMobile ? (
          <button
            className="qs-side-collapse"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsedState ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsedState ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsedState ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-bg-primary">
      {/* desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col sticky top-0 h-screen shrink-0 z-30 qs-side transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? 64 : 246 }}
      >
        {sidebarInner(collapsed)}
      </aside>

      {/* mobile drawer */}
      {mobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[250px] qs-side flex flex-col pop-in">
            <button className="absolute top-2 right-2 z-10 w-11 h-11 flex items-center justify-center rounded-lg text-[#98a2a7] hover:text-white transition-colors" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={16} />
            </button>
            {sidebarInner(false, true)}
          </aside>
        </div>
      ) : null}

      {/* main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 h-[58px] border-b border-border-secondary backdrop-blur-xl bg-bg-primary/85">
          <div className="h-full px-4 md:px-6 flex items-center gap-3">
            <button className="lg:hidden icon-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={16} />
            </button>

            <div className="hidden md:flex items-center gap-2 text-[13px] min-w-0">
              <Activity size={13} className="text-fg-quaternary" />
              <span className="text-fg-quaternary">Quarry Studio</span>
              <span className="text-fg-quaternary">/</span>
              <span className="font-semibold text-fg-primary truncate">{pageTitle}</span>
            </div>

            <div className="flex-1" />

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 h-8 pl-3 pr-2 rounded-lg border border-transparent bg-bg-tertiary text-fg-quaternary hover:text-fg-tertiary transition-colors"
              style={{ width: 210 }}
            >
              <Search size={14} />
              <span className="text-[12.5px]">Search or run…</span>
              <span className="ml-auto font-mono text-[10.5px] text-fg-quaternary border border-border-tertiary rounded px-1 py-px">⌘K</span>
            </button>
            <button className="sm:hidden icon-btn" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search size={15.5} />
            </button>

            <span className="hidden md:inline-flex">
              <BadgeWithIcon color="success" size="sm" icon={<span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'currentColor' }} />}>
                Engine live
              </BadgeWithIcon>
            </span>

            <div className="relative">
              <ButtonUtility
                size="sm"
                color="tertiary"
                tooltip="Alerts"
                icon={Bell}
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Alerts"
              />
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center bg-error-solid text-white pointer-events-none">
                {ALERTS.length}
              </span>
              <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} />
            </div>

            <ThemeToggle />

            <div className="relative">
              <button
                className="flex items-center justify-center w-8 h-8 rounded-full font-display font-bold text-[12px] shrink-0 cursor-pointer relative before:absolute before:-inset-1 before:content-[''] transition-transform duration-100 ease-out hover:scale-105 active:scale-[0.96]"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                onClick={() => setUserOpen((o) => !o)}
                aria-label="Account menu"
                title="Muzzamil — owner"
              >
                MH
              </button>
              {userOpen ? (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+10px)] w-[220px] rounded-lg border border-border-secondary bg-bg-primary shadow-xl overflow-hidden z-50 pop-in">
                    <div className="px-4 py-3 border-b border-border-tertiary">
                      <p className="text-[12.5px] font-semibold text-fg-primary">Muzzamil Hassan</p>
                      <p className="text-[11px] text-fg-quaternary mt-0.5">Studio owner · trusted 30 days</p>
                    </div>
                    <button
                      onClick={logout}
                      disabled={loggingOut}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:bg-bg-secondary disabled:opacity-50 text-error-primary"
                    >
                      <LogOut size={14} />
                      {loggingOut ? 'Signing out…' : 'Log out'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="relative w-full px-4 md:px-6 py-5 md:py-7 max-w-[1240px] mx-auto">
          <div key={pathname} className="fade-up">
            {children}
          </div>
          <footer className="mt-14 pb-6 flex items-center justify-between text-[11px] text-fg-quaternary">
            <span>Quarry Studio · runs on GitHub Actions · nothing lives on this PC</span>
            <span className="font-mono">v4.0 · Dreams UI</span>
          </footer>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
