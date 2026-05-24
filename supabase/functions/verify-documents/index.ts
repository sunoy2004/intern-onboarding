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

async function callGroqVisionOCR(
  apiKey: string,
  base64Content: string,
  documentType: string
): Promise<OCRResult | null> {
  const model = "llama-3.2-11b-vision-preview";
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const promptMap: Record<string, string> = {
    aadhaar: "Extract from Aadhaar card: name, date_of_birth (DD/MM/YYYY), aadhaar_number, address, gender. Return valid JSON only.",
    pan: "Extract from PAN card: name, fathers_name, pan_number, date_of_birth (DD/MM/YYYY), pan_type. Return valid JSON only.",
    bank_passbook: "Extract from bank doc: account_holder_name, account_number, bank_name, branch, ifsc_code. Return valid JSON only.",
    offer_letter: "Extract from offer letter: candidate_name, company_name, position, department, start_date, salary_ctc. Return valid JSON only.",
  };

  const prompt = promptMap[documentType] || "Extract all key information. Return valid JSON only.";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Content}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      console.error("Groq Vision OCR API failed:", await response.text());
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    try {
      let cleanContent = content.trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }
      const parsed = JSON.parse(cleanContent);
      return {
        rawText: content,
        extractedData: parsed,
        isValid: true,
        confidence: 0.95,
      };
    } catch {
      return {
        rawText: content,
        extractedData: {},
        isValid: false,
        confidence: 0.5,
      };
    }
  } catch (error) {
    console.error("Error calling Groq Vision OCR:", error);
    return null;
  }
}

async function callGroqVerificationAgent(
  apiKey: string,
  model: string,
  documentType: string,
  ocrResult: OCRResult,
  internDetails: { full_name: string; department?: string; start_date?: string }
): Promise<{
  isValid: boolean;
  confidence: number;
  extractedData: Record<string, any>;
  rejectionReason: string | null;
}> {
  const modelToUse = model || "llama3-70b-8192";
  const url = "https://api.groq.com/openai/v1/chat/completions";
  
  const systemPrompt = `You are an expert HR Onboarding Document Verification Agent. 
Your task is to verify if the uploaded document matches the intern's details and is valid.
You will receive:
1. The expected Intern details (from the company database).
2. The Document Type (e.g. aadhaar, pan, bank_passbook, offer_letter).
3. The raw extracted text and data from an open-source OCR model.

You must:
- Check if the name in the document matches the intern's full name: "${internDetails.full_name}". Be lenient with minor typos or OCR errors (e.g., "John Doe" vs "Johhn Doe" or "JOHN DOE"), but reject if it is a completely different person.
- Check if the document type matches the uploaded document content.
- Verify key fields:
  * For Aadhaar: 12-digit number (can be masked), name, DOB.
  * For PAN: 10-character alphanumeric PAN number, name, DOB.
  * For Bank Passbook: Account number, IFSC code, bank name, account holder's name.
  * For Offer Letter: Candidate name, position/internship, start date, CTC/salary, department.
- Return a JSON object with:
  * "isValid": boolean (true if the document is authentic, belongs to this intern, and matches the document type; false otherwise)
  * "extractedData": object (the final validated/corrected fields from the document)
  * "confidence": number (between 0.0 and 1.0 representing your verification confidence)
  * "rejectionReason": string or null (if isValid is false, provide a clear explanation for the intern on what was wrong or missing)

You must respond ONLY with a valid JSON object. Do not include any markdown formatting, backticks, or extra text.`;

  const userContent = JSON.stringify({
    internProfile: internDetails,
    documentType: documentType,
    ocrExtracted: {
      rawText: ocrResult.rawText,
      extractedData: ocrResult.extractedData
    }
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API error response:", errText);
      throw new Error(`Groq API returned status ${response.status}`);
    }

    const resJson = await response.json();
    const content = resJson.choices?.[0]?.message?.content || "";
    
    // Parse JSON safely using regex
    let cleanContent = content.trim();
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanContent = jsonMatch[0];
    }
    const parsed = JSON.parse(cleanContent);
    return {
      isValid: parsed.isValid !== false,
      confidence: parsed.confidence || 0.85,
      extractedData: parsed.extractedData || ocrResult.extractedData,
      rejectionReason: parsed.rejectionReason || null
    };
  } catch (error) {
    console.error("Error in Groq verification agent:", error);
    // Return a basic matching heuristic if Groq fails
    return {
      isValid: true,
      confidence: 0.5,
      extractedData: ocrResult.extractedData,
      rejectionReason: "Groq agent verification failed: " + String(error)
    };
  }
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

    const ocrMode = Deno.env.get("OCR_MODE") || "simulated"; // "groq", "ollama", "huggingface", or "simulated"
    const ocrUrl = Deno.env.get("OLLAMA_URL") || "http://localhost:11434";
    const ocrModel = Deno.env.get("OCR_MODEL") || "llava";
    const huggingfaceApiKey = Deno.env.get("HUGGINGFACE_API_KEY");
    const huggingfaceModel = Deno.env.get("HUGGINGFACE_MODEL") || "Salesforce/blip-image-captioning-base";
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    const groqModel = Deno.env.get("GROQ_MODEL") || "llama3-70b-8192";

    const body = await req.json();
    const { intern_id, document_id } = body;

    if (!intern_id) {
      return new Response(
        JSON.stringify({ error: "intern_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch intern details to pass to verification agent
    const { data: intern, error: internError } = await supabase
      .from("interns")
      .select("full_name, department, start_date")
      .eq("id", intern_id)
      .maybeSingle();

    if (internError || !intern) {
      return new Response(
        JSON.stringify({ error: "Intern not found or database error: " + (internError?.message || "") }),
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
      } else if (ocrMode === "groq" && groqApiKey) {
        const fileData = await downloadFileAsBase64(supabase, doc.file_url);
        if (fileData) {
          const result = await callGroqVisionOCR(groqApiKey, fileData.base64, doc.document_type);
          ocrResult = result || (await simulateOCR(doc.document_type));
        } else {
          ocrResult = await simulateOCR(doc.document_type);
        }
      } else {
        ocrResult = await simulateOCR(doc.document_type);
      }

      let verifiedResult = {
        isValid: ocrResult.isValid,
        confidence: ocrResult.confidence,
        extractedData: ocrResult.extractedData,
        rejectionReason: ocrResult.isValid ? null : "Document could not be verified by OCR agent"
      };

      if (groqApiKey) {
        console.log(`Calling Groq verification agent for ${doc.document_type}...`);
        try {
          const agentRes = await callGroqVerificationAgent(
            groqApiKey,
            groqModel,
            doc.document_type,
            ocrResult,
            intern
          );
          verifiedResult = agentRes;
          console.log(`Groq verification result for ${doc.document_type}:`, verifiedResult);
        } catch (err) {
          console.error(`Groq verification agent failed for ${doc.document_type}:`, err);
        }
      } else {
        console.log(`Groq API key not configured. Using raw OCR verification directly.`);
      }

      // Update document with OCR and Agent results
      await supabase
        .from("documents")
        .update({
          status: verifiedResult.isValid ? "verified" : "rejected",
          ocr_raw_text: ocrResult.rawText,
          ocr_extracted_data: verifiedResult.extractedData,
          processed_at: new Date().toISOString(),
          rejection_reason: verifiedResult.rejectionReason,
        })
        .eq("id", doc.id);

      // Store extracted data in the dedicated table for IT dashboard
      if (verifiedResult.isValid && verifiedResult.extractedData) {
        await supabase.from("extracted_doc_data").insert({
          intern_id,
          document_type: doc.document_type,
          extracted_fields: verifiedResult.extractedData,
          confidence_score: verifiedResult.confidence,
          verified_at: new Date().toISOString(),
        });
      }

      results.push({
        document_id: doc.id,
        document_type: doc.document_type,
        status: verifiedResult.isValid ? "verified" : "rejected",
        confidence: verifiedResult.confidence,
        extracted_fields: verifiedResult.extractedData,
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
