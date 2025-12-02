
import io
import re
from fastapi import UploadFile, HTTPException, status

# append to utils.py (paste at end of file)
import re
from typing import Optional

def clean_text(s: str) -> str:
    """Cleans raw text by removing excessive newlines, spaces, and hyphenation."""
    if not s:
        return ""
    s = s.replace("\r", "\n")
    s = re.sub(r"-\n(?=\w)", "", s)      # de-hyphenate linebreaks
    s = re.sub(r"\n{3,}", "\n\n", s)     # collapse blank lines
    s = re.sub(r"[ \t]{2,}", " ", s)     # collapse spaces
    return s.strip()

def read_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extracts text from PDF bytes using pypdf."""
    try:
        import pypdf
        bio = io.BytesIO(pdf_bytes)
        reader = pypdf.PdfReader(bio)
        out = [page.extract_text() or "" for page in reader.pages]
        return "".join(out)
    except Exception as e:
        # This makes the error message more user-friendly in the API response
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to extract text from PDF. Error: {e}. Please ensure pypdf is installed."
        )

async def get_text_from_upload(file: UploadFile) -> str:
    """Reads and processes text from an uploaded TXT or PDF file."""
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided.")

    file_extension = file.filename.split('.')[-1].lower()
    contents = await file.read()

    if file_extension == 'pdf':
        raw_text = read_text_from_pdf(contents)
    elif file_extension == 'txt':
        raw_text = contents.decode("utf-8", errors="ignore")
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type. Please upload a .txt or .pdf file."
        )

    if not raw_text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded file contains no text.")

    return clean_text(raw_text)


#new additions
def _escape_cypher_string(s: str) -> str:
    """Escape single quote for embedding into Cypher string literals."""
    return s.replace("'", "\\'") if s is not None else s

def text_to_cypher_simple(nl: str) -> str:
    """
    Very small rule-based natural-language -> Cypher generator.
    This covers common patterns and is intentionally conservative (safe).
    If you need more sophistication, call the LLM path in chat_agent.py (optional).
    """
    if not nl or not nl.strip():
        return "-- empty input: no cypher generated"

    text = nl.strip().lower()

    # 1) Find nodes of a specific type/label
    m = re.search(r"(find|show|get|list)\s+(?:all\s+)?(?:nodes\s+)?(?:of\s+type\s+|label\s+)?([A-Za-z0-9_]+)", text)
    if m:
        label = m.group(2)
        return f"MATCH (n:`{label}`) RETURN n LIMIT 200"

    # 2) Find nodes with property = value e.g. "find devices where name = X" or "where id = 123"
    m = re.search(r"(?:find|show|get)\s+(?:nodes\s+)?(?:where\s+)?([A-Za-z0-9_]+)\s*(?:=|is|:)\s*['\"]?([^'\"]+)['\"]?", text)
    if m:
        prop = m.group(1)
        val = _escape_cypher_string(m.group(2))
        # try both numeric and string
        if val.isdigit():
            return f"MATCH (n) WHERE coalesce(n.{prop}, '') = {val} OR toString(n.{prop}) = '{val}' RETURN n LIMIT 200"
        else:
            return f"MATCH (n) WHERE toLower(coalesce(n.{prop}, '')) = '{val.lower()}' RETURN n LIMIT 200"

    # 3) Neighbors / immediate connections
    m = re.search(r"(?:neighbors|connected to|connections of|show related to)\s+(?:node\s+)?['\"]?([^'\"]+)['\"]?", text)
    if m:
        name = _escape_cypher_string(m.group(1))
        # look by common name/id properties
        return (
            f"MATCH (n) WHERE toLower(coalesce(n.name,'')) = '{name.lower()}' OR toLower(coalesce(n.id,'')) = '{name.lower()}' "
            "MATCH (n)-[r]-(m) RETURN n, r, m LIMIT 300"
        )

    # 4) Relationships between two named nodes (short path)
    m = re.search(r"(?:path|relationship)s?\s+between\s+['\"]?([^'\"]+)['\"]?\s+(?:and|&)\s+['\"]?([^'\"]+)['\"]?", text)
    if m:
        a = _escape_cypher_string(m.group(1))
        b = _escape_cypher_string(m.group(2))
        return (
            f"MATCH (a), (b) WHERE (toLower(coalesce(a.name,'')) = '{a.lower()}' OR toLower(coalesce(a.id,'')) = '{a.lower()}') "
            f"AND (toLower(coalesce(b.name,'')) = '{b.lower()}' OR toLower(coalesce(b.id,'')) = '{b.lower()}') "
            "MATCH p = shortestPath((a)-[*..6]-(b)) RETURN p LIMIT 1"
        )

    # 5) Count nodes by label e.g. "count devices" / "how many materials"
    m = re.search(r"(?:count|how many)\s+(?:nodes\s+)?([A-Za-z0-9_]+)", text)
    if m:
        label = m.group(1)
        return f"MATCH (n:`{label}`) RETURN count(n) as count"

    # 6) generic fallback: try a generic MATCH return
    # If user wrote something like "show nodes with type device and status active"
    # we attempt to extract one property pair
    m = re.search(r"([A-Za-z0-9_]+)\s+(?:is|=|:)\s*([A-Za-z0-9_'-]+)", text)
    if m:
        prop = m.group(1)
        val = _escape_cypher_string(m.group(2))
        if val.isdigit():
            return f"MATCH (n) WHERE n.{prop} = {val} RETURN n LIMIT 200"
        return f"MATCH (n) WHERE toLower(coalesce(n.{prop}, '')) = '{val.lower()}' RETURN n LIMIT 200"

    # If nothing matched, return a safe hint query (no destructive ops)
    safe_hint = (
        "-- Couldn't map input automatically. Example queries:\n"
        "-- 1) find nodes of type Device\n"
        "-- 2) show neighbors of 'Pump-123'\n"
        "-- 3) path between 'Alice' and 'Bob'\n"
        "MATCH (n) RETURN n LIMIT 50"
    )
    return safe_hint
