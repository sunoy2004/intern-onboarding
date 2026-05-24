import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RESEND_API_URL = "https://api.resend.com/emails";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  type: "onboarding_invite" | "company_credentials" | "offer_letter";
  intern_id: string;
}

async function sendViaResend(
  apiKey: string,
  params: { from: string; to: string[]; subject: string; html: string; attachments?: any[] }
) {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  return response;
}

async function sendViaSMTP(params: {
  from?: string;
  to: string[];
  subject: string;
  html: string;
  attachments?: any[];
}) {
  const host = Deno.env.get("SMTP_HOST");
  const port = parseInt(Deno.env.get("SMTP_PORT") || "587");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  const secure = Deno.env.get("SMTP_SECURE") === "true";
  const defaultFrom = Deno.env.get("SMTP_FROM") || Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";

  if (!host || !user || !pass) {
    throw new Error("SMTP credentials are not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS are required)");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  const mailOptions = {
    from: params.from || defaultFrom,
    to: params.to.join(", "),
    subject: params.subject,
    html: params.html,
    attachments: params.attachments,
  };

  return await transporter.sendMail(mailOptions);
}

async function fetchFileAsUint8Array(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file from URL: ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
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

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
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

      let attachments = undefined;
      const isSmtpConfigured = !!Deno.env.get("SMTP_HOST");

      if (isSmtpConfigured) {
        const smtpAttachments = [];
        if (intern.offer_letter_url) {
          try {
            console.log(`SMTP: Fetching offer letter from: ${intern.offer_letter_url}`);
            const fileContent = await fetchFileAsUint8Array(intern.offer_letter_url);
            smtpAttachments.push({
              filename: "Offer_Letter.pdf",
              content: fileContent,
            });
            console.log("SMTP: Successfully prepared offer letter attachment");
          } catch (err) {
            console.error("SMTP: Failed to attach offer letter:", err);
            await supabase.from("agent_logs").insert({
              intern_id: intern.id,
              action: "offer_letter_attachment_failed",
              details: { error: String(err), offer_letter_url: intern.offer_letter_url },
              status: "warning",
            });
          }
        }

        try {
          console.log(`SMTP: Sending invite email to ${intern.email}`);
          const fromName = Deno.env.get("SMTP_FROM") || `MAQ Onboarding <${fromEmail}>`;
          const info = await sendViaSMTP({
            from: fromName,
            to: [intern.email],
            subject: emailSubject,
            html: emailHtml,
            attachments: smtpAttachments,
          });

          await supabase.from("email_logs").insert({
            intern_id,
            email_type: "onboarding_invite",
            recipient_email: intern.email,
            subject: emailSubject,
            status: "sent",
            resent_id: info.messageId || "smtp",
          });
        } catch (smtpErr) {
          console.error("SMTP Error:", smtpErr);
          await supabase.from("email_logs").insert({
            intern_id,
            email_type: "onboarding_invite",
            recipient_email: intern.email,
            subject: emailSubject,
            status: "failed",
          });

          await supabase.from("agent_logs").insert({
            intern_id,
            action: "email_send_failed",
            details: { error: String(smtpErr), email_type: "onboarding_invite" },
            status: "failure",
          });

          return new Response(
            JSON.stringify({ error: "Failed to send SMTP email", details: String(smtpErr) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // Fallback to Resend API
        if (intern.offer_letter_url) {
          try {
            console.log(`Resend: Fetching offer letter from: ${intern.offer_letter_url}`);
            const fileContent = await fetchFileAsUint8Array(intern.offer_letter_url);
            let binary = "";
            for (let i = 0; i < fileContent.byteLength; i++) {
              binary += String.fromCharCode(fileContent[i]);
            }
            const base64Content = btoa(binary);
            attachments = [
              {
                content: base64Content,
                filename: "Offer_Letter.pdf",
              },
            ];
            console.log("Resend: Successfully prepared offer letter attachment");
          } catch (err) {
            console.error("Resend: Failed to attach offer letter:", err);
            await supabase.from("agent_logs").insert({
              intern_id: intern.id,
              action: "offer_letter_attachment_failed",
              details: { error: String(err), offer_letter_url: intern.offer_letter_url },
              status: "warning",
            });
          }
        }

        if (resendApiKey) {
          const response = await sendViaResend(resendApiKey, {
            from: `MAQ Onboarding <${fromEmail}>`,
            to: [intern.email],
            subject: emailSubject,
            html: emailHtml,
            attachments,
          });

          const resendData = await response.json();

          if (!response.ok) {
            await supabase.from("email_logs").insert({
              intern_id,
              email_type: "onboarding_invite",
              recipient_email: intern.email,
              subject: emailSubject,
              status: "failed",
            });

            await supabase.from("agent_logs").insert({
              intern_id,
              action: "email_send_failed",
              details: { error: resendData, email_type: "onboarding_invite" },
              status: "failure",
            });

            return new Response(
              JSON.stringify({ error: "Failed to send email", details: resendData }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          await supabase.from("email_logs").insert({
            intern_id,
            email_type: "onboarding_invite",
            recipient_email: intern.email,
            subject: emailSubject,
            status: "sent",
            resent_id: resendData.id,
          });
        } else {
          await supabase.from("email_logs").insert({
            intern_id,
            email_type: "onboarding_invite",
            recipient_email: intern.email,
            subject: emailSubject,
            status: "sent",
          });
        }
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

      // Send to personal email so they can still receive it
      const recipientEmail = intern.personal_email || intern.email;

      const isSmtpConfigured = !!Deno.env.get("SMTP_HOST");

      if (isSmtpConfigured) {
        try {
          console.log(`SMTP: Sending company credentials email to ${recipientEmail}`);
          const fromName = Deno.env.get("SMTP_FROM") || `Mac Onboarding <${fromEmail}>`;
          const info = await sendViaSMTP({
            from: fromName,
            to: [recipientEmail],
            subject: emailSubject,
            html: emailHtml,
          });

          await supabase.from("email_logs").insert({
            intern_id,
            email_type: "company_credentials",
            recipient_email: recipientEmail,
            subject: emailSubject,
            status: "sent",
            resent_id: info.messageId || "smtp",
          });
        } catch (smtpErr) {
          console.error("SMTP Error:", smtpErr);
          await supabase.from("email_logs").insert({
            intern_id,
            email_type: "company_credentials",
            recipient_email: recipientEmail,
            subject: emailSubject,
            status: "failed",
          });

          return new Response(
            JSON.stringify({ error: "Failed to send SMTP email", details: String(smtpErr) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        if (resendApiKey) {
          const response = await sendViaResend(resendApiKey, {
            from: `Mac Onboarding <${fromEmail}>`,
            to: [recipientEmail],
            subject: emailSubject,
            html: emailHtml,
          });

          const resendData = await response.json();

          if (!response.ok) {
            await supabase.from("email_logs").insert({
              intern_id,
              email_type: "company_credentials",
              recipient_email: recipientEmail,
              subject: emailSubject,
              status: "failed",
            });

            return new Response(
              JSON.stringify({ error: "Failed to send email", details: resendData }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          await supabase.from("email_logs").insert({
            intern_id,
            email_type: "company_credentials",
            recipient_email: recipientEmail,
            subject: emailSubject,
            status: "sent",
            resent_id: resendData.id,
          });
        } else {
          await supabase.from("email_logs").insert({
            intern_id,
            email_type: "company_credentials",
            recipient_email: recipientEmail,
            subject: emailSubject,
            status: "sent",
          });
        }
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

      const isSmtpConfigured = !!Deno.env.get("SMTP_HOST");

      if (isSmtpConfigured) {
        try {
          console.log(`SMTP: Sending custom email to ${to}`);
          const fromName = Deno.env.get("SMTP_FROM") || `Mac Onboarding <${fromEmail}>`;
          const info = await sendViaSMTP({
            from: fromName,
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
          });

          if (intern_id) {
            await supabase.from("email_logs").insert({
              intern_id,
              email_type: email_type || "custom",
              recipient_email: Array.isArray(to) ? to.join(",") : to,
              subject,
              status: "sent",
              resent_id: info.messageId || "smtp",
            });
          }

          return new Response(
            JSON.stringify({ success: true, data: info }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (smtpErr) {
          console.error("SMTP Error:", smtpErr);
          if (intern_id) {
            await supabase.from("email_logs").insert({
              intern_id,
              email_type: email_type || "custom",
              recipient_email: Array.isArray(to) ? to.join(",") : to,
              subject,
              status: "failed",
            });
          }

          return new Response(
            JSON.stringify({ error: "Failed to send SMTP email", details: String(smtpErr) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        if (!resendApiKey) {
          return new Response(
            JSON.stringify({ error: "RESEND_API_KEY not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const response = await sendViaResend(resendApiKey, {
          from: `Mac Onboarding <${fromEmail}>`,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
        });

        const resendData = await response.json();

        if (intern_id) {
          await supabase.from("email_logs").insert({
            intern_id,
            email_type: email_type || "custom",
            recipient_email: Array.isArray(to) ? to.join(",") : to,
            subject,
            status: response.ok ? "sent" : "failed",
            resent_id: resendData.id,
          });
        }

        return new Response(
          JSON.stringify({ success: response.ok, data: resendData }),
          { status: response.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
