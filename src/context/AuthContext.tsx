import * as React from "react"
import type { User, Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import type { Profile, Intern } from "@/lib/database.types"

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  intern: Intern | null
  loading: boolean
  mustChangePassword: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshIntern: () => Promise<void>
  changePassword: (newPassword: string) => Promise<{ error: string | null }>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [intern, setIntern] = React.useState<Intern | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [mustChangePassword, setMustChangePassword] = React.useState(false)

  const loadProfile = React.useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
    setProfile(data)
    return data
  }, [])

  const loadIntern = React.useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("interns")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
    const internData = data as Intern | null
    setIntern(internData)
    if (internData && !internData.password_changed) {
      setMustChangePassword(true)
    } else {
      setMustChangePassword(false)
    }
    return internData
  }, [])

  const refreshIntern = React.useCallback(async () => {
    if (user) await loadIntern(user.id)
  }, [user, loadIntern])

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        Promise.all([
          loadProfile(session.user.id),
          loadIntern(session.user.id),
        ]).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        (async () => {
          setLoading(true)
          await Promise.all([
            loadProfile(session.user.id),
            loadIntern(session.user.id),
          ])
          setLoading(false)
        })()
      } else {
        setProfile(null)
        setIntern(null)
        setMustChangePassword(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile, loadIntern])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setIntern(null)
    setMustChangePassword(false)
  }

  const changePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { error: error.message }

    // Update intern record
    if (user) {
      const { data: internData } = await supabase
        .from("interns")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle()

      const internRecord = internData as Intern | null

      if (internRecord) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("interns") as any)
          .update({
            password_changed: true,
            is_first_login: false,
            first_login_at: new Date().toISOString(),
            onboarding_status: "first_login",
          })
          .eq("id", internRecord.id)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("onboarding_steps") as any)
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("intern_id", internRecord.id)
          .eq("step_name", "password_changed")
      }
    }

    setMustChangePassword(false)
    await refreshIntern()
    return { error: null }
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, intern, loading, mustChangePassword, signIn, signOut, refreshIntern, changePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
