import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function allotInventory(supabase: ReturnType<typeof createClient>, internId: string) {
  // Get mandatory items with stock
  const { data: mandatoryItems } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("is_mandatory", true)
    .gt("stock_count", 0);

  if (!mandatoryItems?.length) {
    await supabase.from("agent_logs").insert({
      intern_id: internId,
      action: "inventory_allotment_skipped",
      details: { reason: "No mandatory items in stock" },
      status: "failure",
    });
    return;
  }

  // Check existing allotments to avoid duplicates
  const { data: existingAllotments } = await supabase
    .from("inventory_allotments")
    .select("item_id")
    .eq("intern_id", internId);

  const existingItemIds = new Set((existingAllotments || []).map((a) => a.item_id));

  const newAllotments = mandatoryItems
    .filter((item) => !existingItemIds.has(item.id))
    .map((item) => ({
      intern_id: internId,
      item_id: item.id,
      quantity: 1,
    }));

  if (newAllotments.length > 0) {
    await supabase.from("inventory_allotments").insert(newAllotments);

    // Decrement stock
    for (const item of mandatoryItems) {
      if (!existingItemIds.has(item.id)) {
        await supabase
          .from("inventory_items")
          .update({ stock_count: item.stock_count - 1 })
          .eq("id", item.id);
      }
    }
  }

  // Update step
  await supabase
    .from("onboarding_steps")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("intern_id", internId)
    .eq("step_name", "inventory_allotment");

  // Update intern status
  await supabase
    .from("interns")
    .update({ onboarding_status: "inventory_allotted" })
    .eq("id", internId);

  await supabase.from("agent_logs").insert({
    intern_id: internId,
    action: "inventory_allotted",
    details: {
      items_allotted: mandatoryItems.map((i) => i.name),
      count: mandatoryItems.length,
    },
    status: "success",
  });

  // Mark onboarding complete
  await completeOnboarding(supabase, internId);
}

async function completeOnboarding(supabase: ReturnType<typeof createClient>, internId: string) {
  await supabase
    .from("onboarding_steps")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("intern_id", internId)
    .eq("step_name", "onboarding_complete");

  await supabase
    .from("interns")
    .update({
      onboarding_status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", internId);

  await supabase.from("agent_logs").insert({
    intern_id: internId,
    action: "onboarding_complete",
    details: { message: "All onboarding steps completed successfully" },
    status: "success",
  });
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

    const { intern_id, action } = await req.json();

    if (!intern_id || !action) {
      return new Response(
        JSON.stringify({ error: "intern_id and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (action) {
      case "allot_inventory":
        await allotInventory(supabase, intern_id);
        return new Response(
          JSON.stringify({ success: true, message: "Inventory allotted and onboarding completed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "complete_onboarding":
        await completeOnboarding(supabase, intern_id);
        return new Response(
          JSON.stringify({ success: true, message: "Onboarding completed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
