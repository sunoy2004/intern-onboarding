import * as React from "react"
import { supabase } from "@/lib/supabase"
import type { Intern, ExtractedDocData } from "@/lib/database.types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import {
  Search,
  RefreshCw,
  Eye,
  Database,
  User,
  CreditCard,
  Building,
  FileText,
  Shield,
} from "lucide-react"

export default function ITDashboard() {
  const [interns, setInterns] = React.useState<Intern[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [selectedIntern, setSelectedIntern] = React.useState<Intern | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("interns")
      .select("*")
      .order("created_at", { ascending: false })
    setInterns(data || [])
    setLoading(false)
  }, [])

  React.useEffect(() => { load() }, [load])

  const filtered = interns.filter((intern) => {
    const matchesSearch =
      intern.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (intern.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (intern.company_email || "").toLowerCase().includes(search.toLowerCase()) ||
      (intern.department || "").toLowerCase().includes(search.toLowerCase())
    return matchesSearch
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="scroll-m-20 text-2xl font-bold tracking-tight text-foreground">IT Dashboard</h1>
          <p className="text-sm text-muted-foreground">View extracted document data for all verified interns</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-foreground">{interns.filter((i) => i.company_email).length}</p>
                <p className="text-sm text-muted-foreground">Company Emails Assigned</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-full bg-cyan-50 dark:bg-cyan-950/50">
                <Shield className="size-5 text-cyan-600 dark:text-cyan-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-foreground">{interns.filter((i) => i.password_changed).length}</p>
                <p className="text-sm text-muted-foreground">Passwords Changed</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/50">
                <Database className="size-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-foreground">{interns.filter((i) => i.onboarding_status === "completed").length}</p>
                <p className="text-sm text-muted-foreground">Fully Onboarded</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/50">
                <User className="size-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or department..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-0 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32 ml-auto" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Database className="size-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No interns found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>PAN</TableHead>
                  <TableHead>Aadhaar</TableHead>
                  <TableHead>Bank Account</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((intern) => (
                  <TableRow key={intern.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {intern.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-foreground block">{intern.full_name}</span>
                          <span className="text-xs text-muted-foreground">{intern.personal_email || intern.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {intern.company_email ? (
                        <span className="text-sm text-cyan-600 dark:text-cyan-400 font-medium">{intern.company_email}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{intern.department || "--"}</TableCell>
                    <TableCell className="text-sm">--</TableCell>
                    <TableCell className="text-sm">--</TableCell>
                    <TableCell className="text-sm">--</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setSelectedIntern(intern)}
                      >
                        <Eye className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      {selectedIntern && (
        <ITDetailDialog intern={selectedIntern} onClose={() => setSelectedIntern(null)} />
      )}
    </div>
  )
}

function ITDetailDialog({ intern, onClose }: { intern: Intern; onClose: () => void }) {
  const [extractedData, setExtractedData] = React.useState<ExtractedDocData[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from("extracted_doc_data")
        .select("*")
        .eq("intern_id", intern.id)
        .order("created_at", { ascending: true })
      setExtractedData(data || [])
      setLoading(false)
    }
    load()
  }, [intern.id])

  const docTypeIcon: Record<string, React.ElementType> = {
    aadhaar: Shield,
    pan: CreditCard,
    bank_passbook: Building,
    offer_letter: FileText,
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              {intern.full_name.charAt(0).toUpperCase()}
            </div>
            {intern.full_name}
          </DialogTitle>
          <DialogDescription>
            Extracted document data for IT records
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Intern Info */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Company Email</p>
              <p className="text-sm font-medium text-foreground">{intern.company_email || "Not assigned"}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Department</p>
              <p className="text-sm font-medium text-foreground">{intern.department || "--"}</p>
            </div>
          </div>

          <Separator />

          {/* Extracted Data */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : extractedData.length === 0 ? (
            <div className="text-center py-8">
              <Database className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No extracted document data available yet</p>
              <p className="text-xs text-muted-foreground">Data will appear after OCR verification is complete</p>
            </div>
          ) : (
            <div className="space-y-3">
              {extractedData.map((ext) => {
                const Icon = docTypeIcon[ext.document_type] || FileText
                return (
                  <Card key={ext.id}>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Icon className="size-4 text-muted-foreground" />
                          {ext.document_type.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </CardTitle>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(ext.confidence_score * 100)}% confidence
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {Object.entries(ext.extracted_fields).map(([key, value]) => (
                          <div key={key} className="rounded-md bg-muted/50 px-3 py-2">
                            <p className="text-[11px] text-muted-foreground capitalize">{key.replaceAll("_", " ")}</p>
                            <p className="text-sm font-medium text-foreground">{value}</p>
                          </div>
                        ))}
                      </div>
                      {ext.verified_at && (
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Verified: {new Date(ext.verified_at).toLocaleString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
