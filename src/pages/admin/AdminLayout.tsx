import { Outlet, NavLink, useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  LayoutDashboard,
  Users,
  Package,
  ClipboardList,
  LogOut,
  Building2,
  Database,
} from "lucide-react"

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/admin" },
  { label: "Interns", icon: Users, to: "/admin/interns" },
  { label: "IT Dashboard", icon: Database, to: "/admin/it" },
  { label: "Inventory", icon: Package, to: "/admin/inventory" },
  { label: "Agent Logs", icon: ClipboardList, to: "/admin/logs" },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate("/login")
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "AD"

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <div className="flex items-center gap-2 cursor-default">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Building2 className="size-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold text-sm">InternHub</span>
                    <span className="text-xs text-muted-foreground">Admin Panel</span>
                  </div>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <NavLink to={item.to} end={item.to === "/admin"}>
                      {({ isActive }) => (
                        <SidebarMenuButton isActive={isActive} tooltip={item.label}>
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none overflow-hidden">
                    <span className="truncate text-sm font-medium">{profile?.full_name || "Admin"}</span>
                    <span className="truncate text-xs text-muted-foreground">{profile?.email}</span>
                  </div>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleSignOut} tooltip="Sign out">
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <Badge variant="secondary" className="text-xs">Admin</Badge>
        </header>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
