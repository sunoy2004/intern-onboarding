import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import { ThemeProvider } from "@/components/theme-provider"
import { Spinner } from "@/components/ui/spinner"
import LoginPage from "@/pages/LoginPage"
import AdminLayout from "@/pages/admin/AdminLayout"
import AdminDashboard from "@/pages/admin/AdminDashboard"
import InternsPage from "@/pages/admin/InternsPage"
import ITDashboard from "@/pages/admin/ITDashboard"
import InventoryPage from "@/pages/admin/InventoryPage"
import LogsPage from "@/pages/admin/LogsPage"
import PortalLayout from "@/pages/portal/PortalLayout"
import InternPortal from "@/pages/portal/InternPortal"

function RequireAuth({ children, role }: { children: React.ReactNode; role?: "admin" | "intern" }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (role && profile?.role !== role) {
    return <Navigate to={profile?.role === "admin" ? "/admin" : "/portal"} replace />
  }
  return <>{children}</>
}

function RootRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role === "admin") return <Navigate to="/admin" replace />
  return <Navigate to="/portal" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/admin"
        element={
          <RequireAuth role="admin">
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="interns" element={<InternsPage />} />
        <Route path="it" element={<ITDashboard />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="logs" element={<LogsPage />} />
      </Route>

      <Route
        path="/portal"
        element={
          <RequireAuth role="intern">
            <PortalLayout />
          </RequireAuth>
        }
      >
        <Route index element={<InternPortal />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="internhub-theme">
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
