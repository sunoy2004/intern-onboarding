import logging
import os

logger = logging.getLogger(__name__)


class OCRService:
    """Tesseract OCR with confidence scoring and document validation."""

    async def extract_text(self, file_path: str) -> dict:
        result = {"text": "", "confidence": 0.0, "word_count": 0}
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return result

        ext = os.path.splitext(file_path)[1].lower()

        try:
            if ext == ".pdf":
                return await self._extract_from_pdf(file_path)
            else:
                return await self._extract_from_image(file_path)
        except Exception as e:
            logger.error(f"OCR extraction failed for {file_path}: {e}")
            return result

    async def _extract_from_image(self, file_path: str) -> dict:
        try:
            import pytesseract
            from PIL import Image

            img = Image.open(file_path)
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

            texts = []
            confidences = []
            for i, txt in enumerate(data["text"]):
                conf = int(data["conf"][i])
                if txt.strip() and conf > 0:
                    texts.append(txt)
                    confidences.append(conf)

            full_text = " ".join(texts)
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0

            return {
                "text": full_text,
                "confidence": round(avg_confidence, 2),
                "word_count": len(texts),
            }
        except ImportError:
            logger.warning("pytesseract/Pillow not available, returning mock OCR result")
            return {"text": "[OCR unavailable - tesseract not installed]", "confidence": 50.0, "word_count": 5}
        except Exception as e:
            logger.error(f"Image OCR failed: {e}")
            return {"text": "", "confidence": 0.0, "word_count": 0}

    async def _extract_from_pdf(self, file_path: str) -> dict:
        try:
            from pdf2image import convert_from_path
            import pytesseract

            images = convert_from_path(file_path)
            all_text = []
            all_confidences = []

            for img in images:
                data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
                for i, txt in enumerate(data["text"]):
                    conf = int(data["conf"][i])
                    if txt.strip() and conf > 0:
                        all_text.append(txt)
                        all_confidences.append(conf)

            full_text = " ".join(all_text)
            avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0

            return {
                "text": full_text,
                "confidence": round(avg_confidence, 2),
                "word_count": len(all_text),
            }
        except ImportError:
            logger.warning("pdf2image/pytesseract not available, trying PyPDF2")
            return await self._extract_pdf_text_only(file_path)
        except Exception as e:
            logger.error(f"PDF OCR failed: {e}")
            return await self._extract_pdf_text_only(file_path)

    async def _extract_pdf_text_only(self, file_path: str) -> dict:
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(file_path)
            all_text = []
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    all_text.append(text)

            full_text = " ".join(all_text)
            words = full_text.split()

            return {
                "text": full_text,
                "confidence": 60.0,
                "word_count": len(words),
            }
        except Exception as e:
            logger.error(f"PDF text extraction failed: {e}")
            return {"text": "", "confidence": 0.0, "word_count": 0}

    async def validate_document(self, doc_type: str, ocr_result: dict) -> dict:
        text = ocr_result.get("text", "").lower()
        confidence = ocr_result.get("confidence", 0)
        issues = []

        import re

        if doc_type == "pan_card":
            pan_pattern = r"[a-z]{5}\d{4}[a-z]"
            if not re.search(pan_pattern, text):
                issues.append("PAN number pattern not found (expected 10-char alphanumeric)")
        elif doc_type == "id_proof":
            if not any(kw in text for kw in ["aadhaar", "passport", "driver", "voter", "identity", "id card"]):
                issues.append("No recognized ID proof type found")
        elif doc_type == "address_proof":
            if not any(kw in text for kw in ["address", "residence", "utility", "bank statement"]):
                issues.append("No address-related content found")
        elif doc_type == "education_certificate":
            if not any(kw in text for kw in ["degree", "diploma", "certificate", "university", "college", "school", "gpa", "grade"]):
                issues.append("No education-related content found")
        elif doc_type == "experience_letter":
            if not any(kw in text for kw in ["experience", "employment", "worked", "company", "position", "role"]):
                issues.append("No experience-related content found")

        is_valid = len(issues) == 0 and confidence >= 50

        return {
            "is_valid": is_valid,
            "confidence": confidence,
            "issues": issues,
        }
