import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Simulated OCR extraction - in production integrate with Google Vision / AWS Textract
async function simulateOCR(fileUrl: string, documentType: string): Promise<{
  rawText: string;
  extractedData: Record<string, string>;
  isValid: boolean;
}> {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  const mockData: Record<string, { rawText: string; extractedData: Record<string, string> }> = {
    id_proof: {
      rawText: "GOVERNMENT OF INDIA\nADHAAR CARD\nName: John Doe\nDOB: 01/01/2000\nID: XXXX-XXXX-1234",
      extractedData: {
        document_number: "XXXX-XXXX-1234",
        name: "John Doe",
        date_of_birth: "01/01/2000",
        issuing_authority: "Government of India",
        document_type: "Aadhaar Card",
      },
    },
    address_proof: {
      rawText: "UTILITY BILL\nAccount Holder: John Doe\nAddress: 123 Main St, City 400001\nDate: 01/2025",
      extractedData: {
        name: "John Doe",
        address: "123 Main St, City 400001",
        bill_date: "01/2025",
        document_type: "Utility Bill",
      },
    },
    education_certificate: {
      rawText: "UNIVERSITY OF TECHNOLOGY\nDEGREE CERTIFICATE\nThis is to certify that John Doe\nhas completed B.Tech in Computer Science\nYear: 2024",
      extractedData: {
        name: "John Doe",
        degree: "Bachelor of Technology",
        specialization: "Computer Science",
        year_of_passing: "2024",
        institution: "University of Technology",
      },
    },
    offer_acceptance: {
      rawText: "OFFER ACCEPTANCE\nI, John Doe, accept the internship offer\nStart Date: 01/06/2025\nDepartment: Engineering\nSigned: John Doe",
      extractedData: {
        name: "John Doe",
        acceptance_date: "01/06/2025",
        department: "Engineering",
        document_type: "Offer Acceptance Letter",
      },
    },
  };

  const data = mockData[documentType] || mockData.id_proof;
  return {
    rawText: data.rawText,
    extractedData: data.extractedData,
    isValid: true,
  };
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

    const { intern_id, document_id } = await req.json();

    if (!intern_id) {
      return new Response(
        JSON.stringify({ error: "intern_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all pending documents for this intern
    const query = supabase
      .from("documents")
      .select("*")
      .eq("intern_id", intern_id)
      .eq("status", "pending");

    if (document_id) {
      query.eq("id", document_id);
    }

    const { data: documents, error: docsError } = await query;

    if (docsError) {
      return new Response(
        JSON.stringify({ error: docsError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const doc of documents || []) {
      // Mark as processing
      await supabase
        .from("documents")
        .update({ status: "processing" })
        .eq("id", doc.id);

      // Run OCR
      const ocrResult = await simulateOCR(doc.file_url, doc.document_type);

      // Update document with OCR results
      await supabase
        .from("documents")
        .update({
          status: ocrResult.isValid ? "verified" : "rejected",
          ocr_raw_text: ocrResult.rawText,
          ocr_extracted_data: ocrResult.extractedData,
          processed_at: new Date().toISOString(),
          rejection_reason: ocrResult.isValid ? null : "Document could not be verified",
        })
        .eq("id", doc.id);

      results.push({ document_id: doc.id, status: ocrResult.isValid ? "verified" : "rejected" });
    }

    // Check if all required documents are verified
    const { data: allDocs } = await supabase
      .from("documents")
      .select("document_type, status")
      .eq("intern_id", intern_id);

    const requiredTypes = ["id_proof", "address_proof"];
    const verifiedTypes = (allDocs || [])
      .filter((d) => d.status === "verified")
      .map((d) => d.document_type);

    const allVerified = requiredTypes.every((t) => verifiedTypes.includes(t));

    if (allVerified) {
      // Update intern status
      await supabase
        .from("interns")
        .update({
          onboarding_status: "verified",
          verified_at: new Date().toISOString(),
        })
        .eq("id", intern_id);

      // Update steps
      await supabase
        .from("onboarding_steps")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("intern_id", intern_id)
        .eq("step_name", "ocr_verification");

      // Trigger onboarding agent
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/onboarding-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ intern_id, action: "send_onboarding_docs" }),
        })
      );

      await supabase.from("agent_logs").insert({
        intern_id,
        action: "ocr_verification_complete",
        details: { verified_documents: verifiedTypes },
        status: "success",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
        all_verified: allVerified,
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
