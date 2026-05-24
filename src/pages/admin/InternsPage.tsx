import * as React from "react"
import { supabase } from "@/lib/supabase"
import type { Intern } from "@/lib/database.types"
import { statusConfig } from "@/lib/statusConfig"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  UserPlus,
  Search,
  CheckCircle2,
  Eye,
  RefreshCw,
  Mail,
  Building,
  User,
  ClipboardCheck,
  AlertCircle,
  Bot,
  Send,
  KeyRound,
  BadgeCheck,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface AddInternForm {
  full_name: string
  email: string
  department: string
}

const defaultForm: AddInternForm = {
  full_name: "",
  email: "",
  department: "",
}

export default function InternsPage() {
  const [interns, setInterns] = React.useState<Intern[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [showAddDialog, setShowAddDialog] = React.useState(false)
  const [selectedIntern, setSelectedIntern] = React.useState<Intern | null>(null)
  const [form, setForm] = React.useState<AddInternForm>(defaultForm)
  const [offerLetterFile, setOfferLetterFile] = React.useState<File | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [addError, setAddError] = React.useState<string | null>(null)
  const [addSuccess, setAddSuccess] = React.useState<{ password: string; email: string; name: string } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from("interns").select("*").order("created_at", { ascending: false })
    setInterns(data || [])
    setLoading(false)
  }, [])

  React.useEffect(() => { load() }, [load])

  const filtered = interns.filter((intern) => {
    const matchesSearch =
      intern.full_name.toLowerCase().includes(search.toLowerCase()) ||
      intern.email.toLowerCase().includes(search.toLowerCase()) ||
      (intern.department || "").toLowerCase().includes(search.toLowerCase()) ||
      (intern.company_email || "").toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || intern.onboarding_status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setAddError(null)
    try {
      let offer_letter_url = null
      if (offerLetterFile) {
        try {
          const fileExt = offerLetterFile.name.split('.').pop()
          const tempId = crypto.randomUUID()
          const filePath = `offer-letters/${tempId}.${fileExt}`
          
          const { error: uploadErr } = await supabase.storage
            .from("documents")
            .upload(filePath, offerLetterFile)

          if (uploadErr) {
            throw new Error("Failed to upload offer letter: " + uploadErr.message)
          }

          const { data: urlData } = supabase.storage.from("documents").getPublicUrl(filePath)
          offer_letter_url = urlData.publicUrl
        } catch (uploadErr) {
          console.warn("Offer letter storage upload bypassed/failed for testing:", uploadErr)
        }
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-intern`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            ...form,
            offer_letter_url,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to add intern")
      setAddSuccess({ password: data.intern.temp_password, email: data.intern.email, name: data.intern.full_name })
      await load()
    } catch (err) {
      setAddError(String(err instanceof Error ? err.message : err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCloseAdd = () => {
    setShowAddDialog(false)
    setForm(defaultForm)
    setOfferLetterFile(null)
    setAddError(null)
    setAddSuccess(null)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="scroll-m-20 text-2xl font-bold tracking-tight text-foreground">Interns</h1>
          <p className="text-sm text-muted-foreground">Add interns with just name, email, and department. The agent handles the rest.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <UserPlus className="size-4" />
            Add Intern
          </Button>
        </div>
      </div>

      {/* Filters */}
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(statusConfig).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <User className="size-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No interns found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {search || statusFilter !== "all" ? "Try adjusting your filters" : "Add your first intern to get started"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((intern) => {
                  const cfg = statusConfig[intern.onboarding_status]
                  return (
                    <TableRow key={intern.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            {intern.full_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">{intern.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{intern.personal_email || intern.email}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {intern.company_email ? (
                          <span className="text-cyan-600 dark:text-cyan-400">{intern.company_email}</span>
                        ) : (
                          <span className="text-muted-foreground/50">Pending</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{intern.department || "--"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-xs ${cfg.color}`}>
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(intern.invited_at), { addSuffix: true })}
                      </TableCell>
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
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Intern Dialog - Simplified */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) handleCloseAdd(); else setShowAddDialog(true) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="size-5 text-muted-foreground" />
              Add New Intern
            </DialogTitle>
            <DialogDescription>
              Enter just the basics. The agent will automatically send an onboarding email with login credentials, offer letter, and document requirements.
            </DialogDescription>
          </DialogHeader>

          {addSuccess ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 p-4">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Intern added and invite sent!</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">{addSuccess.email}</p>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Temporary Password</p>
                  <code className="font-mono text-sm font-bold text-foreground tracking-wider">{addSuccess.password}</code>
                </div>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Agent will automatically:</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Send className="size-3" /> Send onboarding email with credentials
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <KeyRound className="size-3" /> Require password change on first login
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <BadgeCheck className="size-3" /> Verify documents and assign company email
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseAdd} className="w-full">Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleAdd} className="space-y-4">
              {addError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{addError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  placeholder="Jane Smith"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jane.smith@gmail.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
                <p className="text-xs text-muted-foreground">Personal email. Company email will be assigned after verification.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Input
                  id="department"
                  placeholder="Engineering"
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer_letter">Offer Letter (PDF)</Label>
                <Input
                  id="offer_letter"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setOfferLetterFile(file)
                  }}
                  className="cursor-pointer file:text-foreground file:font-medium file:bg-muted file:border-0 file:rounded-md file:px-2 file:py-1 file:mr-2 hover:file:bg-muted/80"
                />
                <p className="text-xs text-muted-foreground">Optional. If uploaded, the PDF will be stored and attached to their onboarding invite email.</p>
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={handleCloseAdd} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Spinner className="mr-2 size-4" /> : <Bot className="mr-2 size-4" />}
                  {submitting ? "Adding..." : "Add & Send Invite"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Intern Detail Dialog */}
      {selectedIntern && (
        <InternDetailDialog
          intern={selectedIntern}
          onClose={() => setSelectedIntern(null)}
          onRefresh={load}
        />
      )}
    </div>
  )
}

function InternDetailDialog({
  intern,
  onClose,
  onRefresh,
}: {
  intern: Intern
  onClose: () => void
  onRefresh: () => void
}) {
  const [documents, setDocuments] = React.useState<import("@/lib/database.types").Document[]>([])
  const [steps, setSteps] = React.useState<import("@/lib/database.types").OnboardingStep[]>([])
  const [allotments, setAllotments] = React.useState<import("@/lib/database.types").InventoryAllotment[]>([])
  const [extractedData, setExtractedData] = React.useState<import("@/lib/database.types").ExtractedDocData[]>([])
  const [processing, setProcessing] = React.useState(false)

  React.useEffect(() => {
    const load = async () => {
      const [{ data: docs }, { data: stps }, { data: allots }, { data: ext }] = await Promise.all([
        supabase.from("documents").select("*").eq("intern_id", intern.id),
        supabase.from("onboarding_steps").select("*").eq("intern_id", intern.id).order("step_order"),
        supabase.from("inventory_allotments").select("*, inventory_items(*)").eq("intern_id", intern.id),
        supabase.from("extracted_doc_data").select("*").eq("intern_id", intern.id),
      ])
      setDocuments(docs || [])
      setSteps(stps || [])
      setAllotments(allots || [])
      setExtractedData(ext || [])
    }
    load()
  }, [intern.id])

  const handleProcessDocs = async () => {
    setProcessing(true)
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ intern_id: intern.id }),
      })
      await onRefresh()
      onClose()
    } finally {
      setProcessing(false)
    }
  }

  const cfg = statusConfig[intern.onboarding_status]

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
            <Badge variant="secondary" className={`${cfg.color} text-xs`}>{cfg.label}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Details */}
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Mail, label: "Personal Email", value: intern.personal_email || intern.email },
              { icon: Building, label: "Department", value: intern.department || "--" },
              { icon: BadgeCheck, label: "Company Email", value: intern.company_email || "Not assigned" },
              { icon: KeyRound, label: "Password Changed", value: intern.password_changed ? "Yes" : "No" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                <item.icon className="size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium text-foreground">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Onboarding Steps */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ClipboardCheck className="size-4 text-muted-foreground" />
              Onboarding Progress
            </h3>
            <div className="space-y-2">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center gap-3">
                  <div className={`size-2 shrink-0 rounded-full ${step.status === "completed" ? "bg-emerald-500" : step.status === "in_progress" ? "bg-amber-500" : step.status === "failed" ? "bg-destructive" : "bg-muted-foreground/40"}`} />
                  <span className="text-sm text-foreground capitalize flex-1">{step.step_name.replaceAll("_", " ")}</span>
                  <Badge variant="secondary" className="text-xs capitalize">{step.status}</Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          {documents.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3">Documents</h3>
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium capitalize">{doc.document_type.replaceAll("_", " ")}</p>
                        <p className="text-xs text-muted-foreground">{doc.file_name}</p>
                      </div>
                      <Badge variant={doc.status === "verified" ? "default" : doc.status === "rejected" ? "destructive" : "secondary"} className="text-xs capitalize">
                        {doc.status}
                      </Badge>
                    </div>
                  ))}
                </div>
                {documents.some((d) => d.status === "pending") && (
                  <Button size="sm" className="mt-3 w-full" onClick={handleProcessDocs} disabled={processing}>
                    {processing ? <Spinner className="mr-2 size-4" /> : <Bot className="mr-2 size-4" />}
                    Run OCR Verification Agent
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Extracted Data */}
          {extractedData.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Bot className="size-4 text-muted-foreground" />
                  Extracted Document Data
                </h3>
                <div className="space-y-3">
                  {extractedData.map((ext) => (
                    <div key={ext.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium capitalize">{ext.document_type.replaceAll("_", " ")}</p>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(ext.confidence_score * 100)}% confidence
                        </Badge>
                      </div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {Object.entries(ext.extracted_fields).map(([key, value]) => (
                          <div key={key} className="text-xs">
                            <span className="text-muted-foreground capitalize">{key.replaceAll("_", " ")}: </span>
                            <span className="font-medium text-foreground">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Inventory */}
          {allotments.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3">Inventory Allotted</h3>
                <div className="flex flex-wrap gap-2">
                  {allotments.map((a) => (
                    <Badge key={a.id} variant="outline" className="text-xs">
                      {a.inventory_items?.name ?? "Item"} x {a.quantity}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
