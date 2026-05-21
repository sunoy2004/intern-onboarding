import * as React from "react"
import { Link } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import type { Intern, AgentLog } from "@/lib/database.types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  Bot,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { statusConfig } from "@/lib/statusConfig"

interface Stats {
  total: number
  completed: number
  inProgress: number
  pending: number
}

export default function AdminDashboard() {
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [recentInterns, setRecentInterns] = React.useState<Intern[]>([])
  const [recentLogs, setRecentLogs] = React.useState<AgentLog[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const load = async () => {
      const [{ data: internsRaw }, { data: logsRaw }] = await Promise.all([
        supabase.from("interns").select("*").order("created_at", { ascending: false }),
        supabase.from("agent_logs").select("*").order("created_at", { ascending: false }).limit(8),
      ])

      const interns = internsRaw as Intern[] | null
      const logs = logsRaw as AgentLog[] | null
      const all = interns || []
      setStats({
        total: all.length,
        completed: all.filter((i) => i.onboarding_status === "completed").length,
        inProgress: all.filter((i) =>
          ["first_login", "docs_uploaded", "ocr_processing", "verified", "company_email_assigned", "inventory_allotted"].includes(i.onboarding_status)
        ).length,
        pending: all.filter((i) => i.onboarding_status === "invited").length,
      })
      setRecentInterns(all.slice(0, 5))
      setRecentLogs(logs || [])
      setLoading(false)
    }
    load()
  }, [])

  const statCards = [
    { label: "Total Interns", value: stats?.total, icon: Users, color: "text-foreground", bg: "bg-muted" },
    { label: "Completed", value: stats?.completed, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/50" },
    { label: "In Progress", value: stats?.inProgress, icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/50" },
    { label: "Invited / Pending", value: stats?.pending, icon: AlertCircle, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/50" },
  ]

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="scroll-m-20 text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Agentic onboarding pipeline overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {loading ? (
                    <Skeleton className="h-8 w-16 mb-1" />
                  ) : (
                    <p className="text-3xl font-bold text-foreground">{card.value ?? 0}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                </div>
                <div className={`flex size-10 items-center justify-center rounded-full ${card.bg}`}>
                  <card.icon className={`size-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Interns */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-base">Recent Interns</CardTitle>
              <CardDescription className="text-xs">Latest additions to the pipeline</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/interns">
                View all <ChevronRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {loading ? (
              <div className="space-y-0 px-6 pb-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentInterns.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground">No interns yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {recentInterns.map((intern) => {
                  const cfg = statusConfig[intern.onboarding_status]
                  return (
                    <div key={intern.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40 transition-colors">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {intern.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{intern.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{intern.company_email || intern.email}</p>
                      </div>
                      <Badge variant="secondary" className={`shrink-0 text-xs ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Activity Log */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="size-4 text-muted-foreground" />
                Agent Activity
              </CardTitle>
              <CardDescription className="text-xs">Recent automated actions</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/logs">
                View all <ChevronRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-0 px-6 pb-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-start gap-3 py-3">
                    <Skeleton className="mt-0.5 size-2 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="px-6 pb-6 text-sm text-muted-foreground">No agent activity yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-6 py-3">
                    <div className={`mt-1.5 size-2 shrink-0 rounded-full ${log.status === "success" ? "bg-emerald-500" : "bg-destructive"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground capitalize">{log.action.replaceAll("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
