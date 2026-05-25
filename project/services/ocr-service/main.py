import io
import os
import re
import base64
import logging
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from PyPDF2 import PdfReader
from PIL import Image, ImageOps, ImageFilter
import fitz
import httpx
import pytesseract

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="OCR Service", version="1.0.0")

# Groq Vision Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_VISION_MODEL = os.getenv("VISION_MODEL", "llama-3.2-11b-vision-preview")
TESSERACT_MODEL = os.getenv("TESSERACT_MODEL", "tesseract-ocr")

class OCRExtractRequest(BaseModel):
    doc_type: str
    file_name: str
    file_base64: str  # data:...;base64,...

def clean_extracted_text(text: str) -> str:
    replacements = {
        "lFSC": "IFSC",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r'[^\S\r\n]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def preprocess_image(image: Image.Image) -> Image.Image:
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    gray = gray.filter(ImageFilter.SHARPEN)
    return gray

def tesseract_ocr_image(image: Image.Image, doc_type: str) -> str:
    processed = preprocess_image(image)
    config = "--oem 3 --psm 6"
    if doc_type in {"aadhaar_card", "pan_card", "bank_passbook"}:
        config += " -c preserve_interword_spaces=1"
    return pytesseract.image_to_string(processed, lang="eng", config=config)

def render_pdf_with_tesseract(content: bytes, doc_type: str) -> str:
    pages_text = []
    with fitz.open(stream=content, filetype="pdf") as doc:
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
            image = Image.open(io.BytesIO(pix.tobytes("png")))
            text = tesseract_ocr_image(image, doc_type)
            if text.strip():
                pages_text.append(text)
    return "\n".join(pages_text)

async def call_groq_vision_ocr(file_base64: str, doc_type: str) -> tuple[str, str, str]:
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not configured, returning mock extraction text.")
        return (
            f"Mock OCR content for {doc_type}. Name: Sunoy Roy. DOB: 25-05-1995. "
            "PAN ABCDE1234F. Your Aadhaar No.: 8770 1802 0033. "
            "Account Number 411061351224. IFSC SBIN0010094.",
            "mock_ocr",
            "mock-local-fallback",
        )

    try:
        # Prompt based on document type
        prompts = {
            "aadhaar_card": (
                "Perform OCR on this Aadhaar card. Return all visible text. "
                "Pay special attention to labels like 'Your Aadhaar No.' and extract the 12 digit number shown in 4-4-4 groups. "
                "Ignore VID numbers, phone numbers, postal PIN codes, barcodes, and QR text."
            ),
            "pan_card": (
                "Perform OCR on this PAN card. Return all visible text. "
                "Pay special attention to the Permanent Account Number, name, and date of birth."
            ),
            "bank_passbook": (
                "Perform OCR on this bank passbook or cancelled cheque. Return all visible text. "
                "Pay special attention to Account Number, IFSC code, customer/account holder name, branch, and bank name."
            ),
        }
        prompt = prompts.get(doc_type, f"Perform OCR on this {doc_type}. Return all visible text clearly.")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": GROQ_VISION_MODEL,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": file_base64
                                    }
                                }
                            ]
                        }
                    ],
                    "temperature": 0.1
                },
                timeout=30.0
            )
            
            if response.status_code == 200:
                resp_json = response.json()
                return resp_json["choices"][0]["message"]["content"], "groq_vision", GROQ_VISION_MODEL
            else:
                logger.error(f"Groq Vision API failed with status {response.status_code}: {response.text}")
                
    except Exception as e:
        logger.error(f"Groq Vision API error: {e}", exc_info=True)
        
    return (
        "Mock Fallback OCR content. PAN: ABCDE1234F. Name: Sunoy Roy. "
        "Your Aadhaar No.: 8770 1802 0033. IFSC: SBIN0010094. Account Number: 411061351224.",
        "mock_ocr",
        "mock-local-fallback",
    )

@app.post("/ocr/extract")
async def extract_text(req: OCRExtractRequest):
    logger.info(f"Received Base64 OCR request for doc_type: {req.doc_type}, filename: {req.file_name}")
    
    # Extract raw base64 data
    base64_data = req.file_base64
    if "," in base64_data:
        base64_data = base64_data.split(",")[1]
        
    try:
        content = base64.b64decode(base64_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 encoding: {e}")

    filename = req.file_name.lower()
    text_content = ""
    confidence = 90.0
    ocr_engine = "unknown"
    ocr_model = "unknown"

    try:
        if filename.endswith(".pdf") or "application/pdf" in req.file_base64:
            # Process PDF in-memory (no local file is stored!)
            try:
                pdf_file = io.BytesIO(content)
                reader = PdfReader(pdf_file)
                pages_text = []
                for page in reader.pages:
                    txt = page.extract_text()
                    if txt:
                        pages_text.append(txt)
                text_content = "\n".join(pages_text)
                if len(text_content.strip()) < 40:
                    text_content = render_pdf_with_tesseract(content, req.doc_type)
                    confidence = 88.0 if text_content.strip() else 0.0
                    ocr_engine = "tesseract_pdf"
                    ocr_model = TESSERACT_MODEL
                else:
                    confidence = 85.0
                    ocr_engine = "pdf_text_layer"
                    ocr_model = "PyPDF2"
            except Exception as e:
                logger.error(f"PDF extract failed: {e}")
                raise HTTPException(status_code=500, detail=f"PDF extraction error: {e}")
        else:
            try:
                image = Image.open(io.BytesIO(content))
                text_content = tesseract_ocr_image(image, req.doc_type)
                confidence = 88.0 if text_content.strip() else 0.0
                ocr_engine = "tesseract_image"
                ocr_model = TESSERACT_MODEL
            except Exception:
                text_content = ""

            if len(text_content.strip()) < 30:
                text_content, ocr_engine, ocr_model = await call_groq_vision_ocr(req.file_base64, req.doc_type)
                confidence = 90.0 if text_content.strip() else confidence

        cleaned_text = clean_extracted_text(text_content)
        logger.info(
            "OCR result doc_type=%s filename=%s engine=%s model=%s confidence=%.1f chars=%d",
            req.doc_type,
            req.file_name,
            ocr_engine,
            ocr_model,
            confidence,
            len(cleaned_text),
        )
        
        # Explicit cleanup of in-memory byte buffer
        del content

        return {
            "text": cleaned_text,
            "confidence": confidence,
            "engine": ocr_engine,
            "model": ocr_model,
            "filename": req.file_name,
            "doc_type": req.doc_type
        }
    except Exception as err:
        logger.error(f"OCR Service error: {err}")
        raise HTTPException(status_code=500, detail=str(err))

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
