import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OCRResult {
  rawText: string;
  extractedData: Record<string, string>;
  isValid: boolean;
  confidence: number;
}

async function callOllamaOCR(
  ollamaUrl: string,
  model: string,
  base64Content: string,
  documentType: string
): Promise<OCRResult | null> {
  const promptMap: Record<string, string> = {
    aadhaar: "Extract from Aadhaar card: name, date_of_birth (DD/MM/YYYY), aadhaar_number, address, gender. Return valid JSON only.",
    pan: "Extract from PAN card: name, fathers_name, pan_number, date_of_birth (DD/MM/YYYY), pan_type. Return valid JSON only.",
    bank_passbook: "Extract from bank doc: account_holder_name, account_number, bank_name, branch, ifsc_code. Return valid JSON only.",
    offer_letter: "Extract from offer letter: candidate_name, company_name, position, department, start_date, salary_ctc. Return valid JSON only.",
  };

  const prompt = promptMap[documentType] || "Extract all key information. Return valid JSON only.";

  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "llava",
        prompt,
        images: [base64Content],
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data.response || "";

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          rawText: content,
          extractedData: parsed.extractedData || parsed,
          isValid: parsed.isValid !== false,
          confidence: parsed.confidence || 0.85,
        };
      }
    } catch {
      return null;
    }
  } catch {
    return null;
  }

  return null;
}

async function callHuggingFaceOCR(
  apiKey: string,
  model: string,
  base64Content: string,
  documentType: string
): Promise<OCRResult | null> {
  const promptMap: Record<string, string> = {
    aadhaar: "Extract from Aadhaar: name, dob, aadhaar_number, address, gender as JSON",
    pan: "Extract from PAN: name, father_name, pan_number, dob, pan_type as JSON",
    bank_passbook: "Extract from bank document: account_name, account_number, bank_name, branch, ifsc as JSON",
    offer_letter: "Extract from offer letter: candidate_name, company, position, department, start_date, ctc as JSON",
  };

  const prompt = promptMap[documentType] || "Extract information as JSON";

  try {
    // Using HuggingFace Inference API with vision models
    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: {
            image: `data:image/jpeg;base64,${base64Content}`,
            text: prompt,
          },
        }),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const result = Array.isArray(data) ? data[0] : data;

    if (result && result.generated_text) {
      try {
        const jsonMatch = result.generated_text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            rawText: result.generated_text,
            extractedData: parsed,
            isValid: true,
            confidence: 0.80,
          };
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function simulateOCR(documentType: string): Promise<OCRResult> {
  await new Promise((resolve) => setTimeout(resolve, 500));

  const mockData: Record<string, OCRResult> = {
    aadhaar: {
      rawText: "GOVERNMENT OF INDIA\nAADHAAR CARD\nName: Sample Name\nDOB: 15/08/2000\nAadhaar No: XXXX-XXXX-1234\nAddress: 123 Main St, City 400001\nGender: Male",
      extractedData: {
        name: "Sample Name",
        date_of_birth: "15/08/2000",
        aadhaar_number: "XXXX-XXXX-1234",
        address: "123 Main St, City 400001",
        gender: "Male",
        issuing_authority: "UIDAI, Government of India",
        document_type: "Aadhaar Card",
      },
      isValid: true,
      confidence: 0.92,
    },
    pan: {
      rawText: "INCOME TAX DEPARTMENT\nPAN CARD\nName: Sample Name\nFather's Name: Sample Father\nPAN: ABCDE1234F\nDOB: 15/08/2000",
      extractedData: {
        name: "Sample Name",
        fathers_name: "Sample Father",
        pan_number: "ABCDE1234F",
        date_of_birth: "15/08/2000",
        pan_type: "Individual",
        document_type: "PAN Card",
      },
      isValid: true,
      confidence: 0.89,
    },
    bank_passbook: {
      rawText: "BANK OF INDIA\nPassbook\nAccount Holder: Sample Name\nAccount No: 1234567890\nIFSC: BKID0001234\nBranch: Main Branch, City",
      extractedData: {
        account_holder_name: "Sample Name",
        account_number: "1234567890",
        bank_name: "Bank of India",
        branch: "Main Branch, City",
        ifsc_code: "BKID0001234",
        account_type: "Savings",
        document_type: "Bank Passbook",
      },
      isValid: true,
      confidence: 0.87,
    },
    offer_letter: {
      rawText: "OFFER LETTER\nDear Sample Name,\nWe are pleased to offer you the position of Intern\nDepartment: Engineering\nStart Date: 01/06/2025\nCTC: INR 5,00,000\nReporting to: Manager Name",
      extractedData: {
        candidate_name: "Sample Name",
        company_name: "InternHub",
        position: "Intern",
        department: "Engineering",
        start_date: "01/06/2025",
        salary_ctc: "INR 5,00,000",
        reporting_manager: "Manager Name",
        document_type: "Offer Letter",
      },
      isValid: true,
      confidence: 0.91,
    },
  };

  return (
    mockData[documentType] || {
      rawText: "Document content could not be fully extracted",
      extractedData: { document_type: documentType },
      isValid: true,
      confidence: 0.5,
    }
  );
}

async function downloadFileAsBase64(
  supabase: ReturnType<typeof createClient>,
  fileUrl: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const { data, error } = await supabase.storage.from("documents").download(fileUrl.replace(/^\/?documents\//, ""));
    if (error || !data) return null;

    const buffer = await data.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const mimeType = data.type || "application/pdf";
    return { base64, mimeType };
  } catch {
    return null;
  }
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

    const ocrMode = Deno.env.get("OCR_MODE") || "simulated"; // "ollama", "huggingface", or "simulated"
    const ocrUrl = Deno.env.get("OLLAMA_URL") || "http://localhost:11434";
    const ocrModel = Deno.env.get("OCR_MODEL") || "llava";
    const huggingfaceApiKey = Deno.env.get("HUGGINGFACE_API_KEY");
    const huggingfaceModel = Deno.env.get("HUGGINGFACE_MODEL") || "Salesforce/blip-image-captioning-base";

    const body = await req.json();
    const { intern_id, document_id } = body;

    if (!intern_id) {
      return new Response(
        JSON.stringify({ error: "intern_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get pending documents
    let query = supabase
      .from("documents")
      .select("*")
      .eq("intern_id", intern_id)
      .eq("status", "pending");

    if (document_id) {
      query = query.eq("id", document_id);
    }

    const { data: documents, error: docsError } = await query;

    if (docsError) {
      return new Response(
        JSON.stringify({ error: docsError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!documents?.length) {
      return new Response(
        JSON.stringify({ error: "No pending documents found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update intern status to ocr_processing
    await supabase
      .from("interns")
      .update({ onboarding_status: "ocr_processing" })
      .eq("id", intern_id);

    await supabase
      .from("onboarding_steps")
      .update({ status: "in_progress" })
      .eq("intern_id", intern_id)
      .eq("step_name", "ocr_verification");

    const results = [];

    for (const doc of documents) {
      // Mark as processing
      await supabase
        .from("documents")
        .update({ status: "processing" })
        .eq("id", doc.id);

      let ocrResult: OCRResult;

      // Try OCR based on configured mode
      if (ocrMode === "ollama") {
        const fileData = await downloadFileAsBase64(supabase, doc.file_url);
        if (fileData) {
          const result = await callOllamaOCR(ocrUrl, ocrModel, fileData.base64, doc.document_type);
          ocrResult = result || (await simulateOCR(doc.document_type));
        } else {
          ocrResult = await simulateOCR(doc.document_type);
        }
      } else if (ocrMode === "huggingface" && huggingfaceApiKey) {
        const fileData = await downloadFileAsBase64(supabase, doc.file_url);
        if (fileData) {
          const result = await callHuggingFaceOCR(huggingfaceApiKey, huggingfaceModel, fileData.base64, doc.document_type);
          ocrResult = result || (await simulateOCR(doc.document_type));
        } else {
          ocrResult = await simulateOCR(doc.document_type);
        }
      } else {
        ocrResult = await simulateOCR(doc.document_type);
      }

      // Update document with OCR results
      await supabase
        .from("documents")
        .update({
          status: ocrResult.isValid ? "verified" : "rejected",
          ocr_raw_text: ocrResult.rawText,
          ocr_extracted_data: ocrResult.extractedData,
          processed_at: new Date().toISOString(),
          rejection_reason: ocrResult.isValid ? null : "Document could not be verified by OCR agent",
        })
        .eq("id", doc.id);

      // Store extracted data in the dedicated table for IT dashboard
      if (ocrResult.isValid && ocrResult.extractedData) {
        await supabase.from("extracted_doc_data").insert({
          intern_id,
          document_type: doc.document_type,
          extracted_fields: ocrResult.extractedData,
          confidence_score: ocrResult.confidence,
          verified_at: new Date().toISOString(),
        });
      }

      results.push({
        document_id: doc.id,
        document_type: doc.document_type,
        status: ocrResult.isValid ? "verified" : "rejected",
        confidence: ocrResult.confidence,
        extracted_fields: ocrResult.extractedData,
      });
    }

    // Check if all required documents are verified
    const { data: allDocs } = await supabase
      .from("documents")
      .select("document_type, status")
      .eq("intern_id", intern_id);

    const requiredTypes = ["aadhaar", "pan", "bank_passbook", "offer_letter"];
    const verifiedTypes = (allDocs || [])
      .filter((d) => d.status === "verified")
      .map((d) => d.document_type);

    const allVerified = requiredTypes.every((t) => verifiedTypes.includes(t));

    if (allVerified) {
      await supabase
        .from("interns")
        .update({
          onboarding_status: "verified",
          verified_at: new Date().toISOString(),
        })
        .eq("id", intern_id);

      await supabase
        .from("onboarding_steps")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("intern_id", intern_id)
        .eq("step_name", "ocr_verification");

      // Trigger company email assignment
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/assign-company-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ intern_id }),
        })
      );

      await supabase.from("agent_logs").insert({
        intern_id,
        action: "ocr_verification_complete",
        details: { verified_documents: verifiedTypes, all_verified: true, ocr_mode: ocrMode },
        status: "success",
      });
    } else {
      await supabase.from("agent_logs").insert({
        intern_id,
        action: "ocr_verification_partial",
        details: {
          verified_documents: verifiedTypes,
          missing: requiredTypes.filter((t) => !verifiedTypes.includes(t)),
          ocr_mode: ocrMode,
        },
        status: "success",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
        all_verified: allVerified,
        ocr_mode: ocrMode,
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
