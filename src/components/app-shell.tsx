import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import {
  LogOut,
  Menu,
  PanelLeftClose,
  Loader2,
  Search,
} from "lucide-react";
import { apiClient } from "@/integrations/api/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/global-search";
import { AiChat } from "@/components/ai-chat";
import { MiniPlayer } from "@/components/mini-player";
import { GlobalAudioPlayer } from "@/components/global-audio-player";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationPoller } from "@/components/notification-poller";
import { SidebarNotebookTree } from "@/components/sidebar-notebook-tree";
import { useSidebarPreferences, ALL_SIDEBAR_ITEMS } from "@/hooks/use-sidebar-preferences";
import { SettingsDialog } from "@/components/settings-dialog";
import { SidebarUserProfile } from "@/components/sidebar-user-profile";

const STORAGE_KEY = "lifepulse.sidebar.open";
const THEME_STORAGE_KEY = "lifepulse.theme";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<boolean>(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const { isVisible, items: navItems } = useSidebarPreferences();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const pageTitle = (() => {
    const found = ALL_SIDEBAR_ITEMS.find((n) => pathname === n.to || pathname.startsWith(n.to + "/"));
    return found?.label ?? "LifePulse";
  })();

  useEffect(() => {
    const savedTheme = (localStorage.getItem(THEME_STORAGE_KEY) as "dark" | "light") || "dark";
    setTheme(savedTheme);
    if (savedTheme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeMode(next);
  };

  const setThemeMode = (next: "dark" | "light") => {
    setTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    if (next === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setOpen(saved === "1");
    else setOpen(window.innerWidth >= 1024);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) setOpen(false);
  }, [pathname]);

  const signOut = async () => {
    await apiClient.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const isFetching = useIsFetching();
  const isNavigating = useRouterState({ select: (s) => s.status === "pending" });
  const isLoading = isNavigating || isFetching > 0;

  return (
    <div className="relative flex min-h-screen bg-cozy-grain">
      {isLoading && (
        <div className="fixed top-4 right-4 z-[9999] flex items-center gap-2 rounded-full border border-white/10 bg-background/80 px-3 py-1.5 text-xs text-foreground shadow-soft backdrop-blur-xl animate-in fade-in duration-200 pointer-events-none">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="font-medium text-[11px]">Loading…</span>
        </div>
      )}
      {!open && (
        <div className="fixed inset-x-4 top-3 z-50 flex items-center justify-between gap-2 pointer-events-none">
          <button
            onClick={() => setOpen(true)}
            aria-label="Show sidebar"
            className="pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-background/80 text-foreground shadow-soft backdrop-blur-xl transition-all hover:bg-white/10 hover:text-primary"
            title="Show sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>

          <span className="flex-1 text-center text-sm font-semibold text-foreground truncate px-2 pointer-events-none lg:hidden">
            {pageTitle}
          </span>

          {/* Visible ONLY on mobile screens (<1024px) */}
          <div className="pointer-events-auto flex items-center gap-1.5 lg:hidden">
            <NotificationBell />
            <img
              src="/logo.png"
              alt="LifePulse"
              className="h-8 w-8 rounded-xl object-cover border border-white/10 shadow-soft"
            />
          </div>
        </div>
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar/70 backdrop-blur-xl transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Sidebar Top Header */}
        <div className="relative flex h-16 items-center gap-2.5 px-4">
          <img
            src="/logo.png"
            alt="LifePulse Logo"
            className="h-8 w-8 rounded-xl object-cover border border-white/10 shrink-0"
          />
          <span className="font-display text-base font-semibold text-foreground truncate">LifePulse</span>

          {/* Notifications + Hide Sidebar */}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <NotificationBell />
            <button
              onClick={() => setOpen(false)}
              aria-label="Hide sidebar"
              className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              title="Hide sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative px-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="group flex w-full items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left text-sm text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-white/[0.06] hover:text-foreground"
          >
            <Search className="h-4 w-4 transition-colors group-hover:text-primary" />
            <span className="flex-1">Search everything…</span>
            <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">⌘K</kbd>
          </button>
        </div>

        <nav className="relative mt-4 flex-1 space-y-1 overflow-y-auto px-3">
          {navItems
            .filter((item) => isVisible(item.to))
            .map(({ to, label, icon: Icon }) => {
              if (to === "/notebooks") {
                return <SidebarNotebookTree key={to} currentPath={pathname} />;
              }
              const active = pathname === to || pathname.startsWith(to + "/");
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-foreground font-semibold"
                      : "text-sidebar-foreground/80 hover:bg-white/[0.04] hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                    )}
                    strokeWidth={active ? 2 : 1.75}
                  />
                  {label}
                </Link>
              );
            })}
        </nav>

        <SidebarUserProfile
          onSignOut={signOut}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </aside>

      {open && isMobile && (
        <div
          className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[margin,padding] duration-300",
          open ? "lg:ml-64" : "lg:ml-0",
        )}
      >
        <div
          className={cn(
            "min-w-0 flex-1 pt-12 lg:pt-0 transition-[padding] duration-300",
            !open && "pl-0 lg:pl-14",
          )}
        >
          {children}
        </div>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        theme={theme}
        onSetTheme={setThemeMode}
      />
      <AiChat />
      <MiniPlayer />
      <GlobalAudioPlayer />
      <NotificationPoller />
    </div>
  );
}
