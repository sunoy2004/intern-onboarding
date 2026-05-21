import * as React from "react"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import type { OnboardingStep, Document, InventoryAllotment } from "@/lib/database.types"
import { statusConfig, stepMeta, documentTypeConfig } from "@/lib/statusConfig"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CheckCircle2,
  Clock,
  Upload,
  FileCheck,
  Package,
  PartyPopper,
  AlertCircle,
  RefreshCw,
  X,
  KeyRound,
  Mail,
  BadgeCheck,
  ScanSearch,
  FileUp,
} from "lucide-react"

const STEP_ICONS: Record<string, React.ElementType> = {
  email_sent: Mail,
  password_changed: KeyRound,
  document_upload: FileUp,
  ocr_verification: ScanSearch,
  company_email_assigned: BadgeCheck,
  inventory_allotment: Package,
  onboarding_complete: PartyPopper,
}

const DOCUMENT_TYPES = Object.entries(documentTypeConfig).map(([key, val]) => ({
  key,
  ...val,
}))

export default function InternPortal() {
  const { intern, refreshIntern, profile, mustChangePassword, changePassword } = useAuth()
  const [steps, setSteps] = React.useState<OnboardingStep[]>([])
  const [documents, setDocuments] = React.useState<Document[]>([])
  const [allotments, setAllotments] = React.useState<InventoryAllotment[]>([])
  const [uploading, setUploading] = React.useState<string | null>(null)
  const [processingOcr, setProcessingOcr] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  // Password change state
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [changingPassword, setChangingPassword] = React.useState(false)
  const [passwordError, setPasswordError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!intern) return
    const [{ data: stpsRaw }, { data: docsRaw }, { data: allotsRaw }] = await Promise.all([
      supabase.from("onboarding_steps").select("*").eq("intern_id", intern.id).order("step_order"),
      supabase.from("documents").select("*").eq("intern_id", intern.id),
      supabase.from("inventory_allotments").select("*, inventory_items(*)").eq("intern_id", intern.id),
    ])
    setSteps((stpsRaw as OnboardingStep[] | null) || [])
    setDocuments((docsRaw as Document[] | null) || [])
    setAllotments((allotsRaw as InventoryAllotment[] | null) || [])
  }, [intern])

  React.useEffect(() => { load() }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshIntern()
    await load()
    setRefreshing(false)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match")
      return
    }
    setChangingPassword(true)
    const { error } = await changePassword(newPassword)
    if (error) {
      setPasswordError(error)
    }
    setChangingPassword(false)
  }

  const handleUpload = async (docType: string, file: File) => {
    if (!intern) return
    setUploading(docType)
    setUploadError(null)

    try {
      const fileName = `${intern.id}/${docType}/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(fileName, file, { upsert: true })

      if (uploadErr) throw new Error(uploadErr.message)

      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName)

      // Remove previous doc of same type
      await supabase.from("documents").delete().eq("intern_id", intern.id).eq("document_type", docType)

      // Create document record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("documents") as any).insert({
        intern_id: intern.id,
        document_type: docType,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
        status: "pending",
      })

      // Update intern status to docs_uploaded if first doc
      if (intern.onboarding_status === "first_login" || intern.onboarding_status === "invited") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("interns") as any).update({ onboarding_status: "docs_uploaded" }).eq("id", intern.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("onboarding_steps") as any)
          .update({ status: "in_progress" })
          .eq("intern_id", intern.id)
          .eq("step_name", "document_upload")
      }

      await load()
      await refreshIntern()
    } catch (err) {
      setUploadError(String(err instanceof Error ? err.message : err))
    } finally {
      setUploading(null)
    }
  }

  const handleRunOcr = async () => {
    if (!intern) return
    setProcessingOcr(true)
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ intern_id: intern.id }),
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("interns") as any)
        .update({ onboarding_status: "ocr_processing" })
        .eq("id", intern.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("onboarding_steps") as any)
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("intern_id", intern.id)
        .eq("step_name", "document_upload")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("onboarding_steps") as any)
        .update({ status: "in_progress" })
        .eq("intern_id", intern.id)
        .eq("step_name", "ocr_verification")

      // Poll for completion
      let attempts = 0
      const poll = async () => {
        attempts++
        await handleRefresh()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("interns") as any).select("onboarding_status").eq("id", intern.id).maybeSingle()
        if (data && ["verified", "company_email_assigned", "inventory_allotted", "completed"].includes(data.onboarding_status)) {
          setProcessingOcr(false)
          await load()
        } else if (attempts < 15) {
          setTimeout(poll, 2000)
        } else {
          setProcessingOcr(false)
        }
      }
      setTimeout(poll, 1500)
    } catch {
      setProcessingOcr(false)
    }
  }

  if (!intern) return null

  const cfg = statusConfig[intern.onboarding_status]
  const completedSteps = steps.filter((s) => s.status === "completed").length
  const totalSteps = steps.length
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  const uploadedTypes = documents.map((d) => d.document_type)
  const requiredUploaded = DOCUMENT_TYPES.filter((t) => t.required).every((t) => uploadedTypes.includes(t.key as Document["document_type"]))
  const canSubmitDocs =
    requiredUploaded &&
    ["docs_uploaded", "first_login", "invited"].includes(intern.onboarding_status) &&
    documents.some((d) => d.status === "pending")

  const isCompleted = intern.onboarding_status === "completed"

  // Password change screen
  if (mustChangePassword) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardContent className="pt-8 pb-8">
            <div className="text-center mb-6">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60">
                <KeyRound className="size-7 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Change Your Password</h2>
              <p className="text-sm text-muted-foreground mt-1">
                For security, you must change your temporary password before continuing.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={changingPassword}>
                {changingPassword ? <Spinner className="mr-2 size-4" /> : <KeyRound className="mr-2 size-4" />}
                {changingPassword ? "Changing..." : "Change Password & Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      {/* Welcome header */}
      <div className="space-y-1">
        <h1 className="scroll-m-20 text-2xl font-bold tracking-tight text-foreground">
          {isCompleted ? "Welcome aboard!" : `Welcome, ${profile?.full_name?.split(" ")[0] || "Intern"}!`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isCompleted
            ? "Your onboarding is complete. You're all set to start your internship."
            : "Complete the steps below to finish your onboarding process."}
        </p>
        {intern.company_email && (
          <div className="flex items-center gap-2 mt-2">
            <BadgeCheck className="size-4 text-cyan-600 dark:text-cyan-400" />
            <span className="text-sm text-cyan-600 dark:text-cyan-400 font-medium">Company Email: {intern.company_email}</span>
          </div>
        )}
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-foreground">Onboarding Progress</p>
              <p className="text-xs text-muted-foreground">{completedSteps} of {totalSteps} steps completed</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
              <Button variant="ghost" size="icon-sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          <Progress value={progressPct} className="h-2" />
          <p className="mt-2 text-right text-xs text-muted-foreground">{progressPct}%</p>
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step) => {
          const meta = stepMeta[step.step_name]
          const Icon = STEP_ICONS[step.step_name] || CheckCircle2
          const isActive = step.status === "in_progress"
          const isDone = step.status === "completed"
          const isFailed = step.status === "failed"

          return (
            <Card key={step.id} className={`transition-all ${isActive ? "ring-2 ring-ring" : ""} ${isDone ? "opacity-80" : ""}`}>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                    isDone ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400" :
                    isActive ? "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400" :
                    isFailed ? "bg-destructive/10 text-destructive" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {isDone ? <CheckCircle2 className="size-4" /> :
                     isActive ? <Clock className="size-4" /> :
                     isFailed ? <X className="size-4" /> :
                     <Icon className="size-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{meta?.label ?? step.step_name.replaceAll("_", " ")}</p>
                      <Badge
                        variant={isDone ? "default" : isActive ? "secondary" : "outline"}
                        className={`text-xs capitalize shrink-0 ${isDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-0" : ""}`}
                      >
                        {step.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta?.description}</p>

                    {/* Document Upload Panel */}
                    {step.step_name === "document_upload" && !isDone && (
                      <div className="mt-4 space-y-3">
                        {uploadError && (
                          <Alert variant="destructive">
                            <AlertCircle className="size-4" />
                            <AlertDescription>{uploadError}</AlertDescription>
                          </Alert>
                        )}
                        <div className="grid gap-2 sm:grid-cols-2">
                          {DOCUMENT_TYPES.map((docType) => {
                            const existing = documents.find((d) => d.document_type === docType.key)
                            const isUploading = uploading === docType.key
                            return (
                              <DocumentUploadCard
                                key={docType.key}
                                docType={docType}
                                existing={existing}
                                isUploading={isUploading}
                                onUpload={(file) => handleUpload(docType.key, file)}
                              />
                            )
                          })}
                        </div>
                        {canSubmitDocs && (
                          <Button
                            className="w-full"
                            onClick={handleRunOcr}
                            disabled={processingOcr}
                          >
                            {processingOcr ? <Spinner className="mr-2 size-4" /> : <FileCheck className="mr-2 size-4" />}
                            {processingOcr ? "Running verification..." : "Submit for Verification"}
                          </Button>
                        )}
                        {!requiredUploaded && (
                          <p className="text-xs text-muted-foreground text-center">
                            Upload all required documents (marked *) to proceed
                          </p>
                        )}
                      </div>
                    )}

                    {/* OCR processing */}
                    {step.step_name === "ocr_verification" && isActive && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3">
                        <Spinner className="size-4 text-amber-600 dark:text-amber-400" />
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Our AI agent is verifying your documents. This takes a moment...
                        </p>
                      </div>
                    )}

                    {/* Verified docs */}
                    {step.step_name === "ocr_verification" && isDone && documents.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {documents.map((doc) => (
                          <Badge key={doc.id} variant={doc.status === "verified" ? "default" : "destructive"} className="text-xs capitalize">
                            {doc.status === "verified" ? <CheckCircle2 className="mr-1 size-3" /> : <AlertCircle className="mr-1 size-3" />}
                            {doc.document_type.replaceAll("_", " ")}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Company email info */}
                    {step.step_name === "company_email_assigned" && isDone && intern.company_email && (
                      <div className="mt-3 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 p-3">
                        <p className="text-xs text-cyan-700 dark:text-cyan-300">
                          <BadgeCheck className="inline size-3 mr-1" />
                          Your company email <strong>{intern.company_email}</strong> has been created. Check your personal email for credentials.
                        </p>
                      </div>
                    )}

                    {/* Inventory allotments */}
                    {step.step_name === "inventory_allotment" && isDone && allotments.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-medium text-foreground">Items allotted to you:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {allotments.map((a) => (
                            <Badge key={a.id} variant="outline" className="text-xs">
                              {a.inventory_items?.name} x {a.quantity}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Completed state */}
      {isCompleted && (
        <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30">
          <CardContent className="pt-6 pb-6 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60">
              <PartyPopper className="size-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Onboarding Complete!</h3>
            <p className="text-sm text-muted-foreground">
              All steps are done. Your manager will reach out with your first day details.
            </p>
            {intern.company_email && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 px-4 py-2">
                <BadgeCheck className="size-4 text-cyan-600 dark:text-cyan-400" />
                <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300">{intern.company_email}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function DocumentUploadCard({
  docType,
  existing,
  isUploading,
  onUpload,
}: {
  docType: { key: string; label: string; description: string; required: boolean }
  existing: Document | undefined
  isUploading: boolean
  onUpload: (file: File) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)

  const handleFile = (file: File) => {
    if (!file) return
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) return
    onUpload(file)
  }

  const statusIcon = existing?.status === "verified"
    ? <CheckCircle2 className="size-4 text-emerald-500" />
    : existing?.status === "rejected"
    ? <AlertCircle className="size-4 text-destructive" />
    : existing
    ? <Clock className="size-4 text-amber-500" />
    : null

  return (
    <div
      className={`relative rounded-lg border-2 border-dashed p-3 transition-all cursor-pointer hover:bg-muted/40 ${
        dragOver ? "border-ring bg-muted/60" : existing ? "border-border bg-muted/20" : "border-muted-foreground/30"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
          {isUploading ? <Spinner className="size-3.5" /> : statusIcon || <Upload className="size-3.5 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">
            {docType.label}
            {docType.required && <span className="text-destructive ml-0.5">*</span>}
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 truncate">
            {existing ? existing.file_name : docType.description}
          </p>
          {existing && (
            <Badge
              variant={existing.status === "verified" ? "default" : existing.status === "rejected" ? "destructive" : "secondary"}
              className="mt-1 text-[10px] capitalize"
            >
              {existing.status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
