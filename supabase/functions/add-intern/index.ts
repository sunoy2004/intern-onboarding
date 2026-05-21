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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { full_name, email, department } = body;

    if (!full_name || !email) {
      return new Response(
        JSON.stringify({ error: "full_name and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if intern already exists
    const { data: existingIntern } = await supabase
      .from("interns")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingIntern) {
      return new Response(
        JSON.stringify({ error: "An intern with this email already exists" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tempPassword = generatePassword();

    // Create auth user via SQL function
    const { data: userId, error: createError } = await supabase
      .rpc("create_intern_user", {
        p_email: email,
        p_password: tempPassword,
        p_full_name: full_name,
      });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create intern record with new agentic flow fields
    const { data: internData, error: internError } = await supabase
      .from("interns")
      .insert({
        user_id: userId,
        email,
        personal_email: email,
        full_name,
        department: department || null,
        temp_password: tempPassword,
        onboarding_status: "invited",
        is_first_login: true,
        password_changed: false,
      })
      .select()
      .single();

    if (internError) {
      return new Response(
        JSON.stringify({ error: internError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize onboarding steps for agentic flow
    const steps = [
      { intern_id: internData.id, step_name: "email_sent", step_order: 1, status: "pending" },
      { intern_id: internData.id, step_name: "password_changed", step_order: 2, status: "pending" },
      { intern_id: internData.id, step_name: "document_upload", step_order: 3, status: "pending" },
      { intern_id: internData.id, step_name: "ocr_verification", step_order: 4, status: "pending" },
      { intern_id: internData.id, step_name: "company_email_assigned", step_order: 5, status: "pending" },
      { intern_id: internData.id, step_name: "inventory_allotment", step_order: 6, status: "pending" },
      { intern_id: internData.id, step_name: "onboarding_complete", step_order: 7, status: "pending" },
    ];

    await supabase.from("onboarding_steps").insert(steps);

    // Log agent action
    await supabase.from("agent_logs").insert({
      intern_id: internData.id,
      action: "intern_invited",
      details: { email, full_name, department, temp_password_sent: true },
      status: "success",
    });

    // Trigger onboarding invite email via send-email function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    EdgeRuntime.waitUntil(
      fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          action: "send_onboarding_invite",
          intern_id: internData.id,
        }),
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        intern: {
          id: internData.id,
          email,
          full_name,
          temp_password: tempPassword,
        },
        message: `Intern ${full_name} invited. Onboarding email with credentials will be sent to ${email}.`,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
