import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { isWebAuthnSupported } from "@/lib/webauthn";
import { Car, Loader2, Shield, GraduationCap, Fingerprint } from "lucide-react";
import { motion } from "framer-motion";

const roles: { value: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    value: "student",
    label: "Student",
    icon: <GraduationCap className="w-5 h-5" />,
    desc: "Book rides",
  },
  { value: "driver", label: "Driver", icon: <Car className="w-5 h-5" />, desc: "Manage trips" },
  { value: "admin", label: "Admin", icon: <Shield className="w-5 h-5" />, desc: "Full access" },
];

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [localError, setLocalError] = useState<string | null>(null);

  const { login, loginWithBiometric, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const canUseBiometric = isWebAuthnSupported();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    try {
      await login(email, password, role);
      navigate(`/${role}`);
    } catch (loginError) {
      if (loginError instanceof Error) {
        setLocalError(loginError.message);
      } else {
        setLocalError("Unable to login");
      }
    }
  };

  const handleBiometricLogin = async () => {
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError("Enter your email to use fingerprint login");
      return;
    }

    try {
      await loginWithBiometric(email, role);
      navigate(`/${role}`);
    } catch (loginError) {
      if (loginError instanceof Error) {
        setLocalError(loginError.message);
      } else {
        setLocalError("Unable to login with fingerprint");
      }
    }
  };

  const shownError = localError || error;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/4 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[400px] h-[400px] rounded-full bg-primary/8 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[400px] space-y-8 relative z-10"
      >
        <div className="text-center space-y-3">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center btn-primary shadow-lg"
          >
            <Car className="w-8 h-8 text-primary-foreground" />
          </motion.div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">AutoMate</h1>
            <p className="text-muted-foreground text-sm mt-1">
              College Auto Management System
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {roles.map((r) => (
            <button
              key={r.value}
              onClick={() => {
                setRole(r.value);
                setLocalError(null);
                clearError();
              }}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 ${
                role === r.value
                  ? "border-primary bg-primary/5 text-primary shadow-sm"
                  : "border-transparent bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {r.icon}
              <span className="text-xs font-semibold">{r.label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setLocalError(null);
                clearError();
              }}
              placeholder="you@university.edu"
              className="w-full h-12 px-4 rounded-xl bg-card border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setLocalError(null);
                clearError();
              }}
              placeholder="••••••••"
              className="w-full h-12 px-4 rounded-xl bg-card border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
              required
            />
          </div>

          {shownError ? (
            <div className="text-xs rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2">
              {shownError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-xl btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Sign In
          </button>

          {canUseBiometric ? (
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={isLoading || !email.trim()}
              className="w-full h-12 rounded-xl border border-input bg-card text-foreground text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted transition-colors"
            >
              <Fingerprint className="w-4 h-4" />
              Sign In with Fingerprint
            </button>
          ) : null}
        </form>

        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>Use seeded accounts from backend `.env` to login.</p>
          {canUseBiometric ? (
            <p>
              First-time setup: login once with password, then tap the fingerprint icon in the app header.
            </p>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
