export type UserRole = "admin" | "intern"
export type OnboardingStatus =
  | "invited"
  | "first_login"
  | "docs_uploaded"
  | "ocr_processing"
  | "verified"
  | "company_email_assigned"
  | "inventory_allotted"
  | "completed"
export type DocumentType = "aadhaar" | "pan" | "bank_passbook" | "offer_letter"
export type DocumentStatus = "pending" | "processing" | "verified" | "rejected"
export type StepStatus = "pending" | "in_progress" | "completed" | "failed"

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Intern {
  id: string
  user_id: string | null
  email: string
  full_name: string
  department: string | null
  start_date: string | null
  end_date: string | null
  manager_name: string | null
  onboarding_status: OnboardingStatus
  is_first_login: boolean
  temp_password: string | null
  invited_at: string
  first_login_at: string | null
  verified_at: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  company_email: string | null
  personal_email: string | null
  password_changed: boolean
  offer_letter_signed: boolean
  offer_letter_url: string | null
}

export interface Document {
  id: string
  intern_id: string
  document_type: DocumentType
  file_name: string
  file_url: string
  file_size: number | null
  mime_type: string | null
  status: DocumentStatus
  ocr_raw_text: string | null
  ocr_extracted_data: Record<string, string> | null
  rejection_reason: string | null
  uploaded_at: string
  processed_at: string | null
  created_at: string
}

export interface OnboardingStep {
  id: string
  intern_id: string
  step_name: string
  step_order: number
  status: StepStatus
  completed_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface InventoryItem {
  id: string
  name: string
  description: string | null
  category: string
  stock_count: number
  is_mandatory: boolean
  created_at: string
}

export interface InventoryAllotment {
  id: string
  intern_id: string
  item_id: string
  quantity: number
  allotted_at: string
  returned_at: string | null
  notes: string | null
  created_at: string
  inventory_items?: InventoryItem
}

export interface AgentLog {
  id: string
  intern_id: string | null
  action: string
  details: Record<string, unknown> | null
  status: string
  created_at: string
}

export interface ExtractedDocData {
  id: string
  intern_id: string
  document_type: string
  extracted_fields: Record<string, string>
  confidence_score: number
  verified_at: string | null
  created_at: string
}

export interface EmailLog {
  id: string
  intern_id: string
  email_type: string
  recipient_email: string
  subject: string
  status: string
  resent_id: string | null
  sent_at: string
}

export interface CompanyEmail {
  id: string
  intern_id: string
  company_email: string
  personal_email: string
  auth_user_id: string | null
  old_auth_user_id: string | null
  migration_status: string
  assigned_at: string
  migrated_at: string | null
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>
      }
      interns: {
        Row: Intern
        Insert: Omit<Intern, "id" | "created_at" | "updated_at" | "invited_at">
        Update: Partial<Omit<Intern, "id" | "created_at" | "updated_at" | "invited_at">>
      }
      documents: {
        Row: Document
        Insert: Omit<Document, "id" | "created_at">
        Update: Partial<Omit<Document, "id" | "created_at">>
      }
      onboarding_steps: {
        Row: OnboardingStep
        Insert: Omit<OnboardingStep, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<OnboardingStep, "id" | "created_at" | "updated_at">>
      }
      inventory_items: {
        Row: InventoryItem
        Insert: Omit<InventoryItem, "id" | "created_at">
        Update: Partial<Omit<InventoryItem, "id" | "created_at">>
      }
      inventory_allotments: {
        Row: InventoryAllotment
        Insert: Omit<InventoryAllotment, "id" | "created_at">
        Update: Partial<Omit<InventoryAllotment, "id" | "created_at">>
      }
      agent_logs: {
        Row: AgentLog
        Insert: Omit<AgentLog, "id" | "created_at">
        Update: Partial<Omit<AgentLog, "id" | "created_at">>
      }
      extracted_doc_data: {
        Row: ExtractedDocData
        Insert: Omit<ExtractedDocData, "id" | "created_at">
        Update: Partial<Omit<ExtractedDocData, "id" | "created_at">>
      }
      email_logs: {
        Row: EmailLog
        Insert: Omit<EmailLog, "id" | "sent_at">
        Update: Partial<Omit<EmailLog, "id" | "sent_at">>
      }
      company_emails: {
        Row: CompanyEmail
        Insert: Omit<CompanyEmail, "id" | "assigned_at">
        Update: Partial<Omit<CompanyEmail, "id" | "assigned_at">>
      }
    }
  }
}
