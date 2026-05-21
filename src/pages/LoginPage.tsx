import * as React from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { AlertCircle, Building2, Shield } from "lucide-react"

export default function LoginPage() {
  const { signIn, user, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!loading && user && profile) {
      if (profile.role === "admin") {
        navigate("/admin", { replace: true })
      } else {
        navigate("/portal", { replace: true })
      }
    }
  }, [loading, user, profile, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError(error)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
            <Building2 className="size-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none text-foreground">InternHub</p>
            <p className="text-xs text-muted-foreground">Onboarding Platform</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="scroll-m-20 text-3xl font-bold tracking-tight text-foreground">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
                <Shield className="size-5 text-muted-foreground" />
              </div>
              <CardTitle className="text-center text-base">Sign in</CardTitle>
              <CardDescription className="text-center text-xs">
                Use the credentials sent to your email
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Spinner className="mr-2 size-4" /> : null}
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            First time? Check your email for your temporary password.
          </p>
        </div>
      </main>
    </div>
  )
}
