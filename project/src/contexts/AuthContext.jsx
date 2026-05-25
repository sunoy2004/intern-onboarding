import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, db } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing local login session
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const authUser = await db.login(email, password);
      setUser(authUser);
      return authUser;
    } catch (err) {
      throw new Error(err.message || 'Invalid email or password');
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    localStorage.removeItem('user');
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthContext.Provider');
  }
  return context;
}
