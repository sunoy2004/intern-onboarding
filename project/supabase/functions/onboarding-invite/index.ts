import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 587;
const SMTP_USER = "khushichouksey20@gmail.com";
const SMTP_PASS = "igbc dfxo hgwj vjym";
const SMTP_FROM = "khushichouksey20@gmail.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const { createClient } = await import("npm:@supabase/supabase-js@2");

    const url = new URL(req.url);
    const pathParts = url.pathname.replace(/^\/+/, "").split("/");
    const action = pathParts[pathParts.length - 1];

    // seed-demo uses service_role key directly (bootstrap operation)
    if (req.method === "POST" && action === "seed-demo") {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const demoUsers = [
        { email: "admin@company.com", name: "Admin User", role: "admin", password: "Admin@123" },
        { email: "hr1@company.com", name: "HR Manager", role: "hr", password: "Hr@12345" },
        { email: "it1@company.com", name: "IT Staff", role: "it", password: "It@12345" },
        { email: "manager1@company.com", name: "Team Manager", role: "manager", password: "Manager@123" },
        { email: "candidate1@company.com", name: "John Candidate", role: "candidate", password: "Candidate@123" },
      ];

      const results = [];

      for (const demo of demoUsers) {
        const { data: existingUser } = await adminClient
          .from("users")
          .select("id, email, role, auth_user_id")
          .eq("email", demo.email)
          .maybeSingle();

        if (!existingUser) {
          results.push({ email: demo.email, status: "no_record" });
          continue;
        }

        if (existingUser.auth_user_id) {
          results.push({ email: demo.email, status: "already_linked", auth_user_id: existingUser.auth_user_id });
          continue;
        }

        const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
          email: demo.email,
          password: demo.password,
          email_confirm: true,
          user_metadata: { name: demo.name, role: demo.role },
        });

        if (authErr) {
          results.push({ email: demo.email, status: "auth_error", error: authErr.message });
          continue;
        }

        const { error: linkErr } = await adminClient
          .from("users")
          .update({ auth_user_id: authData.user.id })
          .eq("id", existingUser.id);

        if (linkErr) {
          results.push({ email: demo.email, status: "link_error", error: linkErr.message });
        } else {
          results.push({ email: demo.email, status: "linked", auth_user_id: authData.user.id });
        }
      }

      return jsonResponse(200, { success: true, results });
    }

    // For /invite and /send-docs-reminder, verify caller is authenticated staff
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    const token = authHeader.replace("Bearer ", "");
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(token);

    if (callerError || !caller) {
      return jsonResponse(401, { error: "Invalid token" });
    }

    const { data: callerProfile } = await adminClient
      .from("users")
      .select("id, role")
      .eq("auth_user_id", caller.id)
      .maybeSingle();

    if (!callerProfile || !["admin", "hr", "manager"].includes(callerProfile.role)) {
      return jsonResponse(403, { error: "Only HR, Admin, or Manager can invite new hires" });
    }

    if (req.method === "POST" && action === "invite") {
      const body = await req.json();
      const { name, email, department, job_title, start_date } = body;

      if (!name || !email || !department || !job_title) {
        return jsonResponse(400, { error: "name, email, department, and job_title are required" });
      }

      const tempPassword = generateTempPassword();

      // Create auth user
      const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name, role: "candidate" },
      });

      if (authError) {
        if (authError.message.includes("already been registered")) {
          return jsonResponse(409, { error: "A user with this email already exists" });
        }
        return jsonResponse(500, { error: "Failed to create auth user: " + authError.message });
      }

      // Create users record
      const { data: newUser, error: userError } = await adminClient
        .from("users")
        .insert({
          name,
          email,
          hashed_password: "managed_by_supabase_auth",
          role: "candidate",
          is_active: true,
          auth_user_id: authUser.user.id,
        })
        .select()
        .maybeSingle();

      if (userError) {
        await adminClient.auth.admin.deleteUser(authUser.user.id);
        return jsonResponse(500, { error: "Failed to create user record: " + userError.message });
      }

      // Create candidate record
      const { data: newCandidate, error: candError } = await adminClient
        .from("candidates")
        .insert({
          user_id: newUser.id,
          department,
          job_title,
          start_date: start_date || null,
          status: "applied",
        })
        .select()
        .maybeSingle();

      if (candError) {
        return jsonResponse(500, { error: "Failed to create candidate: " + candError.message });
      }

      // Create the 4 required document records (pending upload)
      const requiredDocs = [
        { candidate_id: newCandidate.id, doc_type: "aadhaar_card", original_filename: null, file_path: null, status: "pending", uploaded_at: null },
        { candidate_id: newCandidate.id, doc_type: "pan_card", original_filename: null, file_path: null, status: "pending", uploaded_at: null },
        { candidate_id: newCandidate.id, doc_type: "10th_certificate", original_filename: null, file_path: null, status: "pending", uploaded_at: null },
        { candidate_id: newCandidate.id, doc_type: "12th_certificate", original_filename: null, file_path: null, status: "pending", uploaded_at: null },
      ];
      await adminClient.from("documents").insert(requiredDocs);

      // Send offer letter email with login credentials via SMTP
      const emailSent = await sendOfferEmail(
        email,
        name,
        department,
        job_title,
        tempPassword,
        start_date
      );

      // Create audit logs
      await adminClient.from("audit_logs").insert([
        {
          user_id: callerProfile.id,
          action: "new_hire_invited",
          entity_type: "candidate",
          entity_id: newCandidate.id,
          details: { name, email, department, job_title, email_sent: emailSent },
        },
      ]);

      return jsonResponse(200, {
        success: true,
        user: { id: newUser.id, name, email, role: "candidate" },
        candidate: newCandidate,
        temp_password: tempPassword,
        email_sent: emailSent,
      });
    }

    // Send document upload reminder email
    if (req.method === "POST" && action === "send-docs-reminder") {
      const body = await req.json();
      const { candidate_id } = body;

      if (!candidate_id) {
        return jsonResponse(400, { error: "candidate_id is required" });
      }

      // Get candidate + user info
      const { data: candidate } = await adminClient
        .from("candidates")
        .select("*, user:users(*)")
        .eq("id", candidate_id)
        .maybeSingle();

      if (!candidate || !candidate.user) {
        return jsonResponse(404, { error: "Candidate not found" });
      }

      // Get pending documents
      const { data: pendingDocs } = await adminClient
        .from("documents")
        .select("doc_type")
        .eq("candidate_id", candidate_id)
        .eq("status", "pending");

      if (!pendingDocs || pendingDocs.length === 0) {
        return jsonResponse(200, { success: true, message: "All documents already uploaded" });
      }

      const docNames = pendingDocs.map(d => formatDocType(d.doc_type));
      const emailSent = await sendDocsReminderEmail(
        candidate.user.email,
        candidate.user.name,
        docNames
      );

      return jsonResponse(200, { success: true, email_sent: emailSent, pending_documents: docNames });
    }

    return jsonResponse(404, { error: "Not found. Use /invite, /seed-demo, or /send-docs-reminder" });
  } catch (err) {
    console.error("Edge function error:", err);
    return jsonResponse(500, { error: "Internal server error: " + (err as Error).message });
  }
});

function jsonResponse(status: number, data: object) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const nums = "23456789";
  const special = "!@#$";
  const all = upper + lower + nums + special;
  let pw = "";
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += nums[Math.floor(Math.random() * nums.length)];
  pw += special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < 12; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }
  return pw;
}

function formatDocType(type: string): string {
  const map: Record<string, string> = {
    aadhaar_card: "Aadhaar Card",
    pan_card: "PAN Card",
    "10th_certificate": "10th Mark Sheet / Certificate",
    "12th_certificate": "12th Mark Sheet / Certificate",
  };
  return map[type] || type;
}

async function sendOfferEmail(
  toEmail: string,
  name: string,
  department: string,
  jobTitle: string,
  tempPassword: string,
  startDate: string | null
): Promise<boolean> {
  try {
    const nodemailer = await import("npm:nodemailer@6.9.16");

    const transporter = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const startDateFormatted = startDate
      ? new Date(startDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })
      : "To be confirmed";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Offer Letter</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Confidential</p>
        </div>
        <div style="padding: 32px; background: white; border: 1px solid #e5e7eb; border-top: none;">
          <p style="color: #6b7280; font-size: 13px;">Date: ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</p>

          <p>Dear <strong>${name}</strong>,</p>

          <p>We are delighted to extend an offer of employment for the position of <strong>${jobTitle}</strong> in the <strong>${department}</strong> department at our company.</p>

          <p>Your anticipated start date is <strong>${startDateFormatted}</strong>.</p>

          <p>We believe your skills and experience will be a valuable addition to our team. This offer is contingent upon the successful completion of the onboarding process, including document verification and IT provisioning.</p>

          <p>Please log in to the onboarding portal to complete your onboarding steps, upload required documents, and complete your training modules.</p>

          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0 0 12px; font-weight: 600; color: #92400e;">Your Login Credentials</p>
            <table style="width: 100%; font-size: 14px;">
              <tr>
                <td style="padding: 4px 0; color: #92400e; width: 120px;">Email:</td>
                <td style="padding: 4px 0; font-family: monospace; font-weight: 600; color: #1a1a1a;">${toEmail}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #92400e;">Password:</td>
                <td style="padding: 4px 0; font-family: monospace; font-weight: 600; color: #1a1a1a;">${tempPassword}</td>
              </tr>
            </table>
            <p style="margin: 12px 0 0; font-size: 12px; color: #92400e;">Please change your password after logging in. Keep these credentials secure.</p>
          </div>

          <p style="margin-top: 24px;">We look forward to welcoming you aboard!</p>
          <p>Best regards,<br/><strong>Human Resources Team</strong></p>
        </div>
        <div style="background: #f9fafb; padding: 16px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #9ca3af;">This is an automated message from the AI Onboarding System</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"HR Team" <${SMTP_FROM}>`,
      to: toEmail,
      subject: "Welcome to the team! Your Offer Letter & Login Credentials",
      html,
    });

    console.log("Email sent:", info.messageId);
    return true;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
  }
}

async function sendDocsReminderEmail(
  toEmail: string,
  name: string,
  pendingDocs: string[]
): Promise<boolean> {
  try {
    const nodemailer = await import("npm:nodemailer@6.9.16");

    const transporter = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const docList = pendingDocs.map(d => `<li style="padding: 4px 0;">${d}</li>`).join("");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Document Upload Reminder</h1>
        </div>
        <div style="padding: 32px; background: white; border: 1px solid #e5e7eb; border-top: none;">
          <p>Dear <strong>${name}</strong>,</p>

          <p>This is a reminder that the following documents are still pending upload in your onboarding portal:</p>

          <ul style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px 16px 16px 36px; margin: 16px 0;">
            ${docList}
          </ul>

          <p>Please log in to the onboarding portal and upload these documents at your earliest convenience. Your onboarding process cannot proceed until all required documents are submitted.</p>

          <p>Best regards,<br/><strong>Human Resources Team</strong></p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"HR Team" <${SMTP_FROM}>`,
      to: toEmail,
      subject: "Reminder: Pending Document Uploads for Onboarding",
      html,
    });

    console.log("Reminder email sent:", info.messageId);
    return true;
  } catch (err) {
    console.error("Failed to send reminder email:", err);
    return false;
  }
}
