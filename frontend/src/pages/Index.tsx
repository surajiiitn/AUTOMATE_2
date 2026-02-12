import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { isAuthenticated, user, isInitializing } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isInitializing) {
      return;
    }

    if (isAuthenticated && user) {
      navigate(`/${user.role}`, { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, isInitializing, user, navigate]);

  return null;
};

export default Index;
