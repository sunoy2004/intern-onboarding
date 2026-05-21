import { Outlet, useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Building2, LogOut } from "lucide-react"
import { statusConfig } from "@/lib/statusConfig"

export default function PortalLayout() {
  const { profile, intern, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate("/login")
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "IN"

  const statusCfg = intern ? statusConfig[intern.onboarding_status] : null

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Building2 className="size-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none text-foreground">InternHub</p>
              <p className="text-xs text-muted-foreground">Onboarding Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {statusCfg && (
              <Badge variant="secondary" className={`hidden sm:flex text-xs ${statusCfg.color}`}>
                {statusCfg.label}
              </Badge>
            )}
            <Avatar size="sm">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon-sm" onClick={handleSignOut} title="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
