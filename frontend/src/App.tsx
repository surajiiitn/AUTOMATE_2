import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Login from "./pages/Login";
import StudentDashboard from "./pages/student/StudentDashboard";
import BookRide from "./pages/student/BookRide";
import StudentHistory from "./pages/student/StudentHistory";
import ChatPage from "./pages/ChatPage";
import DriverDashboard from "./pages/driver/DriverDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedLayout = ({ children, roles }: { children: React.ReactNode; roles?: ("student" | "driver" | "admin")[] }) => (
  <ProtectedRoute allowedRoles={roles}>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />

            {/* Student */}
            <Route path="/student" element={<ProtectedLayout roles={["student"]}><StudentDashboard /></ProtectedLayout>} />
            <Route path="/student/book" element={<ProtectedLayout roles={["student"]}><BookRide /></ProtectedLayout>} />
            <Route path="/student/history" element={<ProtectedLayout roles={["student"]}><StudentHistory /></ProtectedLayout>} />
            <Route path="/student/chat" element={<ProtectedLayout roles={["student"]}><ChatPage /></ProtectedLayout>} />

            {/* Driver */}
            <Route path="/driver" element={<ProtectedLayout roles={["driver"]}><DriverDashboard /></ProtectedLayout>} />
            <Route path="/driver/rides" element={<ProtectedLayout roles={["driver"]}><DriverDashboard /></ProtectedLayout>} />
            <Route path="/driver/chat" element={<ProtectedLayout roles={["driver"]}><ChatPage /></ProtectedLayout>} />

            {/* Admin */}
            <Route path="/admin" element={<ProtectedLayout roles={["admin"]}><AdminDashboard /></ProtectedLayout>} />
            <Route path="/admin/users" element={<ProtectedLayout roles={["admin"]}><AdminDashboard /></ProtectedLayout>} />
            <Route path="/admin/complaints" element={<ProtectedLayout roles={["admin"]}><AdminDashboard /></ProtectedLayout>} />
            <Route path="/admin/logs" element={<ProtectedLayout roles={["admin"]}><AdminDashboard /></ProtectedLayout>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
