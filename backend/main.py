import os
import io
import csv
import logging
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from database import init_db, add_lead, get_all_leads, save_chat_message, get_chat_history, get_all_chat_sessions
import rag

# ── Load .env FIRST — before any os.environ.get() calls ────────────
# This reads the .env file in the same directory as main.py
_env_path = os.path.join(os.path.dirname(__file__), ".env")
_loaded = load_dotenv(dotenv_path=_env_path, override=True)


# ── Logging ──────────────────────────────────────────────────
import sys
_stream_handler = logging.StreamHandler(stream=open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1))
_stream_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[_stream_handler, logging.FileHandler("backend.log", encoding="utf-8")],
)
logger = logging.getLogger(__name__)

# ── App ──────────────────────────────────────────────────────
app = FastAPI(title="SoftWallet Chatbot API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup ──────────────────────────────────────────────────
@app.on_event("startup")
def startup_event():
    logger.info("🚀 Backend starting up...")
    logger.info(f"📄 .env file {'found and loaded' if _loaded else 'NOT FOUND — set OPENROUTER_API_KEY manually'}")
    logger.info(f"📄 .env path checked: {_env_path}")
    init_db()
    logger.info("✅ Database initialized")
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    if not api_key or api_key == "your_api_key_here":
        logger.warning("⚠️  OPENROUTER_API_KEY not set or still placeholder. Chat will fail.")
        logger.warning("⚠️  Edit backend/.env and set: OPENROUTER_API_KEY=sk-or-...")
    else:
        logger.info(f"✅ OPENROUTER_API_KEY loaded ({api_key[:12]}...)")
    stats = rag.get_stats()
    logger.info(f"📚 RAG: {stats['total_chunks']} chunks from {stats['total_sources']} sources")


# ── Helpers ──────────────────────────────────────────────────
def get_fallback_context() -> str:
    try:
        with open("data.txt", "r", encoding="utf-8") as f:
            return f.read().strip() or "You are a helpful AI assistant for SoftWallet."
    except FileNotFoundError:
        return "You are a helpful AI assistant for SoftWallet."


def call_openrouter(system_prompt: str, user_message: str) -> str:
    """Call OpenRouter and return the AI reply string."""
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    print(f"[DEBUG] call_openrouter: api_key present = {bool(api_key)}, length = {len(api_key)}")
    logger.debug(f"call_openrouter: api_key present={bool(api_key)}, length={len(api_key)}")

    if not api_key or api_key == "your_api_key_here":
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not set. Open backend/.env and set your key."
        )


    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "SoftWallet Chatbot",
    }
    payload = {
        "model": "openrouter/free", # Automatically uses the best available free model
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message},
        ]
    }
    logger.debug(f"OpenRouter request: model={payload['model']}")
    
    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers, 
            json=payload, 
            timeout=30
        )
        logger.debug(f"OpenRouter response status: {resp.status_code}")
        
        # If status is not 200 OK, raise exception with exact OpenRouter error text
        if not resp.ok:
            logger.error(f"OpenRouter API Error: {resp.status_code} - {resp.text}")
            raise HTTPException(
                status_code=500, 
                detail=f"OpenRouter API Error: {resp.status_code} - {resp.text[:200]}"
            )
            
        data = resp.json()
        if "error" in data:
            err_msg = data['error'].get('message', str(data['error']))
            raise HTTPException(status_code=500, detail=f"AI error: {err_msg}")
            
        if not data.get("choices"):
            raise HTTPException(status_code=500, detail="AI returned empty response.")
            
        return data["choices"][0]["message"]["content"].strip()
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Request to OpenRouter failed: {e}")
        raise HTTPException(status_code=500, detail=f"API connection failed: {str(e)}")

# ── Pydantic models ───────────────────────────────────────────
class Lead(BaseModel):
    name: str
    email: str
    phone: str = ""

class ChatMessage(BaseModel):
    message: str
    user_email: str = ""
    user_name: str = ""

class AdminLogin(BaseModel):
    username: str
    password: str

class IngestURL(BaseModel):
    url: str

# ── Global exception handler ─────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": f"Internal server error: {str(exc)}"})

# ── Health check ─────────────────────────────────────────────
@app.get("/")
def health_check():
    return {"status": "ok", "message": "SoftWallet chatbot backend is running ✅"}

# ── Debug: environment check ─────────────────────────────────
@app.get("/debug/env")
def debug_env():
    """
    Safe diagnostic endpoint — shows whether the API key is loaded.
    Does NOT expose the actual key value.
    Visit: http://127.0.0.1:8000/debug/env
    """
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    is_placeholder = api_key == "your_api_key_here"
    return {
        "env_file_found":     _loaded,
        "env_file_path":      _env_path,
        "api_key_present":    bool(api_key) and not is_placeholder,
        "api_key_length":     len(api_key) if api_key else 0,
        "api_key_prefix":     api_key[:10] + "..." if len(api_key) >= 10 else "(too short or missing)",
        "is_placeholder":     is_placeholder,
        "status":             "✅ OK" if (api_key and not is_placeholder) else "❌ Key missing or placeholder",
        "fix":                None if (api_key and not is_placeholder) else "Open backend/.env and replace 'your_api_key_here' with your real key from https://openrouter.ai/keys",
    }

# ── Lead capture ─────────────────────────────────────────────
@app.post("/lead")
def create_lead(lead: Lead):
    logger.info(f"New lead: name='{lead.name}' email='{lead.email}'")
    try:
        add_lead(lead.name, lead.email, lead.phone)
        return {"message": "Lead saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# ── Chat (RAG-enhanced) ───────────────────────────────────────
@app.post("/chat")
def chat(chat_message: ChatMessage):
    logger.info(f"💬 Chat: '{chat_message.message[:80]}'")
    try:
        print("User query:", chat_message.message)
        
        # 1. Intent Detection (Greetings)
        greetings = ["hi", "hello", "hey", "hii", "heelo"]
        if chat_message.message.lower().strip() in greetings:
            reply = "Hello! 😊 How can I help you today?"
            if chat_message.user_email:
                save_chat_message(chat_message.user_email, chat_message.user_name, "user", chat_message.message)
                save_chat_message(chat_message.user_email, chat_message.user_name, "bot", reply)
            return {"response": reply}
            
        # 2. Retrieve relevant chunks from knowledge base
        docs = rag.query(chat_message.message, k=3)
        
        print("Retrieved docs count:", len(docs))
        print("Retrieved docs:", docs)

        context = ""
        if docs:
            context = "\n".join(docs)
            print("Context:", context[:300])

        system_prompt = """You are a helpful assistant.
Use the context if available.
If not, answer normally."""

        if context.strip():
            formatted_user_msg = f"Context:\n{context}\n\nQuestion:\n{chat_message.message}"
            logger.info(f"📚 RAG: using {len(docs)} chunks")
        else:
            logger.info("📚 RAG: no relevant chunks found, using normal chat fallback")
            formatted_user_msg = chat_message.message

        # Persist user message to DB if user is identified
        if chat_message.user_email:
            save_chat_message(chat_message.user_email, chat_message.user_name, "user", chat_message.message)

        reply = call_openrouter(system_prompt, formatted_user_msg)
        logger.info(f"✅ AI reply ({len(reply)} chars)")

        # Persist bot reply to DB
        if chat_message.user_email:
            save_chat_message(chat_message.user_email, chat_message.user_name, "bot", reply)

        return {"response": reply}

    except HTTPException:
        raise
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="AI service timed out.")
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail="Cannot reach AI service.")
    except Exception as e:
        logger.error(f"Unexpected error in /chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

# ── Ingest: URL ──────────────────────────────────────────────
@app.post("/scrape-website")
def ingest_url(body: IngestURL):
    """Scrape a public URL and add its content to the FAISS knowledge base.

    Uses two strategies so it works on both traditional and JS-rendered sites:
      1. Full body text after stripping noise tags (works for server-rendered sites)
      2. Structured metadata fallback: title, meta description, headings, link
         text, img alt (works for React/Vue/Angular SPAs that return near-empty bodies)
    """
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    logger.info(f"🌐 Scraping URL: {url}")
    try:
        from bs4 import BeautifulSoup

        # Use a real browser UA to avoid basic bot-blocking
        browser_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        resp = requests.get(url, timeout=20, headers=browser_headers)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # ── Strategy 1: body text after stripping noise ───────────────────
        for tag in soup(["script", "style", "noscript", "nav", "footer",
                          "header", "aside", "form", "iframe", "svg"]):
            tag.decompose()
            
        # Extract only from meaningful tags
        meaningful_tags = soup.find_all(["p", "h1", "h2", "li"])
        body_text = " ".join([tag.get_text(strip=True) for tag in meaningful_tags])
        
        logger.info(f"  [S1] body_text length = {len(body_text)} chars")
        print("Scraped content preview:", body_text[:1000])

        # ── Strategy 2: structured metadata fallback ──────────────────────
        # Useful when the page is a JS-rendered SPA: the raw HTML has almost
        # no readable text but the <title> / <meta> / headings are filled.
        fallback_parts = []

        page_title = soup.find("title")
        if page_title:
            t = page_title.get_text(strip=True)
            if t:
                fallback_parts.append("Page title: " + t)

        for meta in soup.find_all("meta"):
            name = (meta.get("name") or meta.get("property") or "").lower()
            content = meta.get("content", "").strip()
            if not content:
                continue
            if name in ("description", "og:description", "twitter:description"):
                fallback_parts.append("Description: " + content)
            elif name in ("keywords",):
                fallback_parts.append("Keywords: " + content)
            elif name in ("og:title", "twitter:title"):
                fallback_parts.append("Title: " + content)

        for h in soup.find_all(["h1", "h2", "h3", "h4"]):
            t = h.get_text(strip=True)
            if t:
                fallback_parts.append(t)

        for a in soup.find_all("a", href=True):
            t = a.get_text(strip=True)
            if t and len(t) > 5:
                fallback_parts.append(t)

        for img in soup.find_all("img", alt=True):
            alt = img["alt"].strip()
            if alt and len(alt) > 4:
                fallback_parts.append("Image: " + alt)

        fallback_text = " ".join(fallback_parts)
        logger.info(f"  [S2] fallback_text length = {len(fallback_text)} chars")

        # ── Choose best source ────────────────────────────────────────────
        if len(body_text) >= 100:
            text = body_text
            source_used = "body"
        elif len(fallback_text) >= 30:
            text = fallback_text
            source_used = "metadata-fallback"
            logger.warning(
                f"⚠️  Body text only {len(body_text)} chars — using metadata fallback "
                f"({len(fallback_text)} chars). Site is likely JS-rendered."
            )
        else:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Could not extract usable text from this URL "
                    f"(body: {len(body_text)} chars, metadata: {len(fallback_text)} chars). "
                    f"The page is likely a fully JavaScript-rendered SPA (React/Vue/Angular) "
                    f"that requires a headless browser. "
                    f"Tip: export the page content as a PDF or TXT and use the Upload option instead."
                )
            )

        print("Scraped text length:", len(text))

        count = rag.add_texts([text], source=url)
        stats = rag.get_stats()
        logger.info(f"✅ Ingested {count} chunks from {url} (source={source_used}, {len(text)} chars)")
        return {
            "message": f"Successfully ingested {count} chunks from the URL. (source: {source_used})",
            "chunks_added": count,
            "total_chunks": stats["total_chunks"],
            "source_used": source_used,
            "chars_extracted": len(text),
        }
    except HTTPException:
        raise
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="URL request timed out after 20 seconds.")
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail="Cannot reach the URL. Verify it is publicly accessible.")
    except Exception as e:
        logger.error(f"Error scraping {url}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Scraping failed: {str(e)}")


# ── Ingest: File ─────────────────────────────────────────────
@app.post("/upload-doc")
async def ingest_file(file: UploadFile = File(...)):
    """Upload a PDF, TXT, or DOCX and add its content to the FAISS knowledge base."""
    filename = file.filename or "uploaded_file"
    ext = filename.rsplit(".", 1)[-1].lower()
    logger.info(f"📄 File upload: {filename} ({ext})")

    if ext not in ("pdf", "txt", "docx"):
        raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, TXT, or DOCX.")

    contents = await file.read()
    text = ""

    try:
        if ext == "txt":
            text = contents.decode("utf-8", errors="ignore")

        elif ext == "pdf":
            import fitz  # PyMuPDF
            doc = fitz.open(stream=contents, filetype="pdf")
            pages = [page.get_text() for page in doc]
            text = "\n".join(pages)
            doc.close()

        elif ext == "docx":
            from docx import Document
            doc = Document(io.BytesIO(contents))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())

        if len(text.strip()) < 50:
            raise HTTPException(status_code=422, detail="Extracted text is too short or empty.")

        count = rag.add_texts([text], source=filename)
        stats = rag.get_stats()
        logger.info(f"✅ Ingested {count} chunks from '{filename}'")
        return {
            "message": f"Successfully ingested {count} chunks from '{filename}'.",
            "chunks_added": count,
            "total_chunks": stats["total_chunks"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing file {filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File processing failed: {str(e)}")

# ── RAG status ───────────────────────────────────────────────
@app.get("/rag/status")
def rag_status():
    return rag.get_stats()

@app.delete("/rag/clear")
def rag_clear():
    rag.clear_index()
    logger.info("🗑️  RAG knowledge base cleared")
    return {"message": "Knowledge base cleared successfully."}

# ── Download Leads CSV ───────────────────────────────────────
@app.get("/download-leads")
def download_leads_csv():
    """Return all captured leads as a downloadable CSV file."""
    try:
        leads = get_all_leads()
        output = io.StringIO()
        writer = csv.writer(output)
        # Header row
        writer.writerow(["#", "Name", "Email", "Phone", "Captured At"])
        for i, lead in enumerate(leads, start=1):
            writer.writerow([
                i,
                lead.get("name", ""),
                lead.get("email", ""),
                lead.get("phone", ""),
                lead.get("created_at", ""),
            ])
        output.seek(0)
        logger.info(f"CSV download: {len(leads)} leads exported")
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=leads.csv"},
        )
    except Exception as e:
        logger.error(f"CSV download error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"CSV generation failed: {str(e)}")

# ── Admin ────────────────────────────────────────────────────
@app.post("/admin/login")
def admin_login(login: AdminLogin):
    if login.username == "admin" and login.password == "admin123":
        return {"message": "Login successful"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.get("/admin/leads")
def get_leads():
    try:
        return get_all_leads()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# ── Chat History ─────────────────────────────────────────────
@app.get("/chat-history/{user_email:path}")
def chat_history_endpoint(user_email: str):
    """Return the full chat transcript for a specific user."""
    logger.info(f"Fetching chat history for: {user_email}")
    try:
        return get_chat_history(user_email)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/admin/chat-sessions")
def admin_chat_sessions():
    """Return all unique chat sessions (grouped by user email)."""
    try:
        return get_all_chat_sessions()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

