import { Link, useLocation, useNavigate } from "react-router";
import { Keyboard, LayoutDashboard, LogOut, MonitorUp } from "lucide-react";

import mark from "@/assets/meboard-mark.svg";
import { BufffaceBadge } from "@/components/Buffface";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const links = [
  { to: "/dashboard", label: "Boards", icon: LayoutDashboard },
  { to: "/live", label: "Live", icon: MonitorUp },
  { to: "/lab", label: "Lab", icon: Keyboard },
];

export function AppNav() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <aside className="flex flex-wrap items-center gap-3 border-b border-border bg-card/60 px-4 py-3 md:min-h-screen md:w-56 md:shrink-0 md:flex-col md:items-stretch md:justify-between md:border-r md:border-b-0 md:py-6">
      <div className="flex flex-1 items-center gap-4 md:flex-col md:items-stretch md:gap-6">
        <Link to="/" className="flex items-center gap-2">
          <img src={mark} alt="" className="size-7" />
          <span className="font-bold tracking-tight">Meboard</span>
        </Link>
        <nav className="flex flex-1 gap-1 md:flex-none md:flex-col">
          {links.map((link) => {
            const active = pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <link.icon className="size-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 md:mt-auto md:flex-col md:items-stretch md:gap-2">
        <p className="hidden truncate text-xs text-muted-foreground md:block">
          {user?.email ?? user?.name ?? "Signed in"}
        </p>
        <BufffaceBadge compact className="justify-start" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleSignOut()}
          className="cursor-pointer justify-start gap-2"
        >
          <LogOut className="size-4" />
          <span className="hidden md:inline">Sign out</span>
          <span className="sr-only md:hidden">Sign out</span>
        </Button>
      </div>
    </aside>
  );
}
