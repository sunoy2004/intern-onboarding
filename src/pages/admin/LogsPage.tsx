import * as React from "react"
import { supabase } from "@/lib/supabase"
import type { AgentLog } from "@/lib/database.types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RefreshCw, Search, Bot, CheckCircle2, XCircle } from "lucide-react"
import { format } from "date-fns"

export default function LogsPage() {
  const [logs, setLogs] = React.useState<AgentLog[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("agent_logs")
      .select("*")
      .order("created_at", { ascending: false })
    setLogs(data || [])
    setLoading(false)
  }, [])

  React.useEffect(() => { load() }, [load])

  const filtered = logs.filter((log) =>
    log.action.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="scroll-m-20 text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bot className="size-6 text-muted-foreground" />
            Agent Logs
          </h1>
          <p className="text-sm text-muted-foreground">Automated actions performed by the onboarding agents</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search actions…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-0 p-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-start gap-4 py-4 border-b last:border-0">
                  <Skeleton className="mt-0.5 size-5 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Bot className="size-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No agent activity yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((log) => (
                <div key={log.id} className="flex items-start gap-4 px-6 py-4 hover:bg-muted/30 transition-colors">
                  <div className="mt-0.5 shrink-0">
                    {log.status === "success" ? (
                      <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="size-5 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground capitalize">
                      {log.action.replaceAll("_", " ")}
                    </p>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {Object.entries(log.details).slice(0, 3).map(([key, val]) => (
                          <span key={key} className="text-xs text-muted-foreground">
                            <span className="font-medium capitalize">{key.replaceAll("_", " ")}:</span>{" "}
                            {Array.isArray(val) ? val.join(", ") : String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "dd MMM yyyy, HH:mm:ss")}
                    </p>
                  </div>
                  <Badge
                    variant={log.status === "success" ? "default" : "destructive"}
                    className="text-xs shrink-0 capitalize"
                  >
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
