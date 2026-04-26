# Mini AI Chatbot

A full-stack Retrieval-Augmented Generation (RAG) chatbot built with **FastAPI** (Backend) and **HTML/CSS/JS** (Frontend). This chatbot allows users to interact with scraped website data or uploaded documents using FAISS for local vector storage and OpenRouter for LLM inference.

## Features
- **Frontend**: Clean, responsive UI with dark/light mode toggle.
- **RAG Architecture**: Capable of reading external URLs and uploaded documents (PDF, TXT, DOCX) to ground its answers in factual data.
- **FAISS Vector DB**: Stores embeddings locally using `sentence-transformers` for fast semantic search.
- **Lead Capture**: Collects user name and email before starting the chat.
- **Admin Dashboard**: A secure panel to view collected leads and read user chat histories.
- **Smart Fallback**: Naturally falls back to intelligent conversation if the knowledge base doesn't have the answer.

## Project Structure
- `/backend`: The Python FastAPI application, FAISS configuration, and SQLite database setup.
- `/frontend`: The vanilla HTML, CSS, and JS files for the chat interface and the admin dashboard.

---

## 🚀 How to Run Locally

### 1. Start the Backend
1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On Mac/Linux:
   source venv/bin/activate
   ```
3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the `backend` folder and add your OpenRouter API key:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```
   *The backend will now be running on `http://127.0.0.1:8000`.*

### 2. Start the Frontend
Since the frontend uses vanilla web technologies, you can simply open the `index.html` file in your browser, or use a tool like Live Server.

1. Navigate to the `frontend` folder.
2. Double-click `index.html` to open the Chatbot UI.
3. Double-click `admin.html` to open the Admin Dashboard (Default Login: `admin` / `admin123` or your custom credentials).

---

## 🛠️ Tech Stack
- **Backend:** FastAPI, Python, SQLite
- **AI/ML:** FAISS, Sentence-Transformers, LangChain Text Splitter, OpenRouter API
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Web Scraping:** BeautifulSoup4, Requests
