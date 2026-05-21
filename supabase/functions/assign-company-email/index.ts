import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function generateCompanyEmail(fullName: string, domain: string): string {
  const nameParts = fullName.toLowerCase().split(/\s+/);
  let username: string;
  if (nameParts.length >= 2) {
    username = `${nameParts[0]}.${nameParts[nameParts.length - 1]}`;
  } else {
    username = nameParts[0];
  }
  // Remove special characters
  username = username.replace(/[^a-z0-9.]/g, "");
  return `${username}@${domain}`;
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

    const companyDomain = Deno.env.get("COMPANY_EMAIL_DOMAIN") || "internhub.com";

    const body = await req.json();
    const { intern_id } = body;

    if (!intern_id) {
      return new Response(
        JSON.stringify({ error: "intern_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get intern details
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

    if (intern.onboarding_status !== "verified") {
      return new Response(
        JSON.stringify({ error: "Intern documents not yet verified" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if company email already assigned
    if (intern.company_email) {
      return new Response(
        JSON.stringify({ error: "Company email already assigned", company_email: intern.company_email }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyEmail = generateCompanyEmail(intern.full_name, companyDomain);
    const newPassword = generatePassword();

    // Check for email uniqueness - append number if taken
    const { data: existingCompanyEmail } = await supabase
      .from("interns")
      .select("id")
      .eq("company_email", companyEmail)
      .maybeSingle();

    let finalCompanyEmail = companyEmail;
    if (existingCompanyEmail) {
      const baseEmail = companyEmail.split("@")[0];
      let counter = 2;
      while (true) {
        finalCompanyEmail = `${baseEmail}${counter}@${companyDomain}`;
        const { data: taken } = await supabase
          .from("interns")
          .select("id")
          .eq("company_email", finalCompanyEmail)
          .maybeSingle();
        if (!taken) break;
        counter++;
      }
    }

    // Migrate to company email using the database function
    const { data: newUserId, error: migrateError } = await supabase.rpc(
      "migrate_to_company_email",
      {
        p_intern_id: intern_id,
        p_company_email: finalCompanyEmail,
        p_password: newPassword,
      }
    );

    if (migrateError) {
      await supabase.from("agent_logs").insert({
        intern_id,
        action: "company_email_assignment_failed",
        details: { error: migrateError.message, company_email: finalCompanyEmail },
        status: "failure",
      });

      return new Response(
        JSON.stringify({ error: "Failed to assign company email", details: migrateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update onboarding step
    await supabase
      .from("onboarding_steps")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("intern_id", intern_id)
      .eq("step_name", "company_email_assigned");

    await supabase.from("agent_logs").insert({
      intern_id,
      action: "company_email_assigned",
      details: {
        company_email: finalCompanyEmail,
        personal_email: intern.email,
        new_user_id: newUserId,
      },
      status: "success",
    });

    // Send company credentials email
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    EdgeRuntime.waitUntil(
      fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          action: "send_company_credentials",
          intern_id,
        }),
      })
    );

    // Trigger inventory allotment
    EdgeRuntime.waitUntil(
      fetch(`${supabaseUrl}/functions/v1/onboarding-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ intern_id, action: "allot_inventory" }),
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        company_email: finalCompanyEmail,
        new_user_id: newUserId,
        message: `Company email ${finalCompanyEmail} assigned. Credentials email and inventory allotment triggered.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
