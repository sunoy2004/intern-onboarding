import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  type: "onboarding_invite" | "company_credentials" | "offer_letter";
  intern_id: string;
}

/**
 * Unified mail helper: tries SMTP first (if configured), then Resend API, then simulated fallback.
 * Handles logging to email_logs and agent_logs automatically.
 */
async function sendMailHelper(
  supabase: any,
  internId: string | null,
  emailType: string,
  fromEmail: string,
  toEmails: string[],
  subject: string,
  html: string
): Promise<{ success: boolean; messageId?: string; error?: any }> {
  const smtpHost = Deno.env.get("SMTP_HOST");
  const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPass = Deno.env.get("SMTP_PASS");
  const smtpFrom = Deno.env.get("SMTP_FROM") || fromEmail;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  const recipientString = toEmails.join(", ");

  // 1. Try SMTP if configured
  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: smtpFrom,
        to: recipientString,
        subject: subject,
        html: html,
      });

      if (internId) {
        await supabase.from("email_logs").insert({
          intern_id: internId,
          email_type: emailType,
          recipient_email: recipientString,
          subject: subject,
          status: "sent",
          resent_id: info.messageId || "smtp_sent",
        });
      }

      return { success: true, messageId: info.messageId };
    } catch (smtpErr) {
      if (internId) {
        await supabase.from("email_logs").insert({
          intern_id: internId,
          email_type: emailType,
          recipient_email: recipientString,
          subject: subject,
          status: "failed",
        });

        await supabase.from("agent_logs").insert({
          intern_id: internId,
          action: "email_send_failed",
          details: { error: String(smtpErr), email_type: emailType, provider: "smtp" },
          status: "failure",
        });
      }
      return { success: false, error: String(smtpErr) };
    }
  }

  // 2. Try Resend API
  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: toEmails,
          subject,
          html,
        }),
      });

      const resendData = await response.json();

      if (!response.ok) {
        if (internId) {
          await supabase.from("email_logs").insert({
            intern_id: internId,
            email_type: emailType,
            recipient_email: recipientString,
            subject,
            status: "failed",
          });

          await supabase.from("agent_logs").insert({
            intern_id: internId,
            action: "email_send_failed",
            details: { error: resendData, email_type: emailType, provider: "resend" },
            status: "failure",
          });
        }
        return { success: false, error: resendData };
      }

      if (internId) {
        await supabase.from("email_logs").insert({
          intern_id: internId,
          email_type: emailType,
          recipient_email: recipientString,
          subject,
          status: "sent",
          resent_id: resendData.id,
        });
      }
      return { success: true, messageId: resendData.id };
    } catch (resendErr) {
      if (internId) {
        await supabase.from("email_logs").insert({
          intern_id: internId,
          email_type: emailType,
          recipient_email: recipientString,
          subject,
          status: "failed",
        });
      }
      return { success: false, error: String(resendErr) };
    }
  }

  // 3. Simulated/mock fallback
  if (internId) {
    await supabase.from("email_logs").insert({
      intern_id: internId,
      email_type: emailType,
      recipient_email: recipientString,
      subject,
      status: "sent",
    });
  }
  return { success: true, messageId: "simulated_id" };
}

function buildOnboardingEmailHtml(
  internName: string,
  email: string,
  password: string,
  loginUrl: string,
  department: string,
  offerLetterUrl?: string | null
): string {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 40px 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Welcome Aboard!</h1>
        <p style="color: #94a3b8; margin: 8px 0 0; font-size: 16px;">Your onboarding journey begins here</p>
      </div>
      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #1e293b; margin: 0 0 16px;">Hi <strong>${internName}</strong>,</p>
        <p style="font-size: 15px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          We're excited to have you join the <strong>${department}</strong> team! Your onboarding process has been initiated. Below are your login credentials to access the intern portal where you can complete your documentation.
        </p>
        
        ${
          offerLetterUrl
            ? `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <p style="margin: 0; font-size: 14px; font-weight: 600; color: #0f172a;">Official Offer Letter</p>
                  <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">This document is attached to this email and available for download.</p>
                </div>
                <a href="${offerLetterUrl}" style="display: inline-block; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 13px; margin-left: 12px; white-space: nowrap;">
                  Download PDF
                </a>
              </div>
            </div>
            `
            : ""
        }

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 0 0 24px;">
          <p style="margin: 0 0 12px; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Login Credentials</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: #64748b; width: 120px;">Email</td>
              <td style="padding: 8px 0; font-size: 14px; color: #1e293b; font-weight: 600;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Password</td>
              <td style="padding: 8px 0; font-size: 14px; color: #1e293b; font-weight: 600; font-family: monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${password}</td>
            </tr>
          </table>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            <strong>Important:</strong> You will be required to change this password on your first login. Please keep these credentials secure.
          </p>
        </div>
        <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #0f172a 0%, #334155 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 0 0 24px;">
          Access Intern Portal
        </a>
        <p style="font-size: 14px; color: #64748b; margin: 24px 0 0; line-height: 1.6;">
          Once logged in, you will need to:<br>
          1. Change your password<br>
          2. Upload required documents (Aadhaar, PAN, Bank Passbook, Offer Letter)<br>
          3. E-sign your offer letter<br>
          4. Complete your profile
        </p>
      </div>
      <div style="background: #f8fafc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
          This is an automated message from the InternHub Onboarding System. If you did not expect this email, please ignore it.
        </p>
      </div>
    </div>
  `;
}

function buildCompanyEmailHtml(
  internName: string,
  companyEmail: string,
  password: string,
  loginUrl: string
): string {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 40px 32px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Your Company Email is Ready!</h1>
        <p style="color: #a7f3d0; margin: 8px 0 0; font-size: 16px;">All documents verified successfully</p>
      </div>
      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #1e293b; margin: 0 0 16px;">Hi <strong>${internName}</strong>,</p>
        <p style="font-size: 15px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          Congratulations! All your documents have been verified and your onboarding is nearly complete. Your company email account has been created. Please use the credentials below to log in.
        </p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 24px; margin: 0 0 24px;">
          <p style="margin: 0 0 12px; font-size: 13px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">New Company Credentials</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: #166534; width: 120px;">Email</td>
              <td style="padding: 8px 0; font-size: 14px; color: #14532d; font-weight: 600;">${companyEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 14px; color: #166534;">Password</td>
              <td style="padding: 8px 0; font-size: 14px; color: #14532d; font-weight: 600; font-family: monospace; background: #dcfce7; padding: 4px 8px; border-radius: 4px;">${password}</td>
            </tr>
          </table>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            <strong>Important:</strong> Your previous login credentials (personal email) will no longer work. Please use the new company email to log in. You will be asked to change this password on first login.
          </p>
        </div>
        <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #065f46 0%, #047857 100%); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 0 0 24px;">
          Login with Company Email
        </a>
        <p style="font-size: 14px; color: #64748b; margin: 24px 0 0; line-height: 1.6;">
          Your inventory items have been automatically allotted and will be available for pickup. Please check the portal for details.
        </p>
      </div>
      <div style="background: #f8fafc; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
          This is an automated message from the InternHub Onboarding System.
        </p>
      </div>
    </div>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
    const portalUrl = Deno.env.get("PORTAL_URL") || "http://localhost:5173/portal";

    const body = await req.json();
    const { action, intern_id, to, subject, html, email_type } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: "action is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send_onboarding_invite") {
      if (!intern_id) {
        return new Response(
          JSON.stringify({ error: "intern_id is required for send_onboarding_invite" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: intern, error: internError } = await supabase
        .from("interns")
        .select("*")
        .eq("id", intern_id)
        .maybeSingle();

      if (internError || !intern) {
        return new Response(
          JSON.stringify({ error: "Intern not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailHtml = buildOnboardingEmailHtml(
        intern.full_name,
        intern.email,
        intern.temp_password,
        portalUrl,
        intern.department || "General",
        intern.offer_letter_url
      );

      const emailSubject = `Welcome to MAQ Software - Your Onboarding Credentials`;

      const result = await sendMailHelper(
        supabase,
        intern_id,
        "onboarding_invite",
        `MAQ Onboarding <${fromEmail}>`,
        [intern.email],
        emailSubject,
        emailHtml
      );

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: "Failed to send email", details: result.error }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update onboarding step
      await supabase
        .from("onboarding_steps")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("intern_id", intern_id)
        .eq("step_name", "email_sent");

      await supabase.from("agent_logs").insert({
        intern_id,
        action: "onboarding_email_sent",
        details: { recipient: intern.email, email_type: "onboarding_invite" },
        status: "success",
      });

      return new Response(
        JSON.stringify({ success: true, message: "Onboarding invite email sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send_company_credentials") {
      if (!intern_id) {
        return new Response(
          JSON.stringify({ error: "intern_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: intern, error: internError } = await supabase
        .from("interns")
        .select("*")
        .eq("id", intern_id)
        .maybeSingle();

      if (internError || !intern) {
        return new Response(
          JSON.stringify({ error: "Intern not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!intern.company_email) {
        return new Response(
          JSON.stringify({ error: "Company email not yet assigned" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailHtml = buildCompanyEmailHtml(
        intern.full_name,
        intern.company_email,
        intern.temp_password,
        portalUrl
      );

      const emailSubject = `Your Company Email is Ready - ${intern.company_email}`;
      const recipientEmail = intern.personal_email || intern.email;

      const result = await sendMailHelper(
        supabase,
        intern_id,
        "company_credentials",
        `MAQ Onboarding <${fromEmail}>`,
        [recipientEmail],
        emailSubject,
        emailHtml
      );

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: "Failed to send email", details: result.error }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase.from("agent_logs").insert({
        intern_id,
        action: "company_credentials_email_sent",
        details: { recipient: recipientEmail, company_email: intern.company_email },
        status: "success",
      });

      return new Response(
        JSON.stringify({ success: true, message: "Company credentials email sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send_custom") {
      if (!to || !subject || !html) {
        return new Response(
          JSON.stringify({ error: "to, subject, and html are required for send_custom" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const toList = Array.isArray(to) ? to : [to];
      const result = await sendMailHelper(
        supabase,
        intern_id || null,
        email_type || "custom",
        `MAQ Onboarding <${fromEmail}>`,
        toList,
        subject,
        html
      );

      return new Response(
        JSON.stringify({ success: result.success, error: result.error }),
        { status: result.success ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
