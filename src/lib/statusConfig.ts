import type { OnboardingStatus } from "./database.types"

export const statusConfig: Record<OnboardingStatus, { label: string; color: string; step: number }> = {
  invited: { label: "Invited", color: "text-sky-600 dark:text-sky-400", step: 0 },
  first_login: { label: "First Login", color: "text-blue-600 dark:text-blue-400", step: 1 },
  docs_uploaded: { label: "Docs Uploaded", color: "text-amber-600 dark:text-amber-400", step: 2 },
  ocr_processing: { label: "OCR Processing", color: "text-orange-600 dark:text-orange-400", step: 3 },
  verified: { label: "Verified", color: "text-teal-600 dark:text-teal-400", step: 4 },
  company_email_assigned: { label: "Company Email", color: "text-cyan-600 dark:text-cyan-400", step: 5 },
  inventory_allotted: { label: "Inventory Set", color: "text-fuchsia-600 dark:text-fuchsia-400", step: 6 },
  completed: { label: "Completed", color: "text-emerald-600 dark:text-emerald-400", step: 7 },
}

export const stepMeta: Record<string, { label: string; description: string; icon: string }> = {
  email_sent: { label: "Invite Email Sent", description: "Onboarding email with credentials sent to intern", icon: "Mail" },
  password_changed: { label: "Password Changed", description: "Intern changed initial password on first login", icon: "KeyRound" },
  document_upload: { label: "Documents Uploaded", description: "Intern uploaded Aadhaar, PAN, bank passbook, offer letter", icon: "FileUp" },
  ocr_verification: { label: "OCR Verification", description: "AI agent verified all uploaded documents", icon: "ScanSearch" },
  company_email_assigned: { label: "Company Email Assigned", description: "Company email created and credentials sent", icon: "BadgeCheck" },
  inventory_allotment: { label: "Inventory Allotted", description: "Laptop, access card, and other items assigned", icon: "Package" },
  onboarding_complete: { label: "Onboarding Complete", description: "All steps completed successfully", icon: "PartyPopper" },
}

export const documentTypeConfig: Record<string, { label: string; description: string; required: boolean }> = {
  aadhaar: { label: "Aadhaar Card", description: "Government-issued Aadhaar card for identity verification", required: true },
  pan: { label: "PAN Card", description: "Permanent Account Number card for tax identification", required: true },
  bank_passbook: { label: "Bank Passbook", description: "Bank passbook or statement for salary account setup", required: true },
  offer_letter: { label: "Offer Letter", description: "Signed offer letter / acceptance letter", required: true },
}
