import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "react-router-dom";
import { Car, LogOut, Bell, Wifi, WifiOff, Home, BookOpen, Clock, MessageSquare, Users, AlertTriangle, BarChart3, Navigation } from "lucide-react";
import { useState, useEffect } from "react";

const roleNavItems = {
  student: [
    { path: "/student", label: "Home", icon: Home },
    { path: "/student/book", label: "Book", icon: Navigation },
    { path: "/student/history", label: "History", icon: Clock },
    { path: "/student/chat", label: "Chat", icon: MessageSquare },
  ],
  driver: [
    { path: "/driver", label: "Home", icon: Home },
    { path: "/driver/rides", label: "Rides", icon: Car },
    { path: "/driver/chat", label: "Chat", icon: MessageSquare },
  ],
  admin: [
    { path: "/admin", label: "Home", icon: Home },
    { path: "/admin/users", label: "Users", icon: Users },
    { path: "/admin/complaints", label: "Issues", icon: AlertTriangle },
    { path: "/admin/logs", label: "Logs", icon: BarChart3 },
  ],
};

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!user) return null;
  const navItems = roleNavItems[user.role] || [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-destructive text-destructive-foreground text-center py-2 text-sm font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />
          You're offline — some features may be unavailable
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/60">
        <div className="container flex items-center justify-between h-16 px-4">
          <Link to={`/${user.role}`} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl btn-primary flex items-center justify-center shadow-sm">
              <Car className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">AutoMate</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted/60 text-xs font-medium">
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3 text-success" />
                  <span className="text-success hidden sm:inline">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-destructive" />
                  <span className="text-destructive hidden sm:inline">Offline</span>
                </>
              )}
            </div>
            <button className="relative p-2.5 rounded-xl hover:bg-muted transition-colors">
              <Bell className="w-[18px] h-[18px] text-muted-foreground" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-destructive ring-2 ring-card" />
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-border/60">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                {user.name.charAt(0)}
              </div>
              <button onClick={logout} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Sign out">
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 container px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/60 md:hidden safe-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`p-1 rounded-lg transition-colors ${isActive ? "bg-primary/10" : ""}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
