import sqlite3

DB_NAME = "leads.db"

def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    # Leads table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leads (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            email      TEXT NOT NULL,
            phone      TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    ''')

    # Chat history table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            user_name  TEXT DEFAULT '',
            role       TEXT NOT NULL,
            message    TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    ''')

    # Safe migrations
    for col_sql in [
        "ALTER TABLE leads ADD COLUMN phone TEXT DEFAULT ''",
        "ALTER TABLE leads ADD COLUMN created_at TEXT DEFAULT (datetime('now','localtime'))",
    ]:
        try:
            cursor.execute(col_sql)
        except sqlite3.OperationalError:
            pass

    conn.commit()
    conn.close()


def add_lead(name: str, email: str, phone: str = ""):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO leads (name, email, phone) VALUES (?, ?, ?)",
        (name, email, phone)
    )
    conn.commit()
    conn.close()


def get_all_leads():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    # Use COALESCE so missing created_at doesn't crash
    try:
        cursor.execute("SELECT id, name, email, phone, created_at FROM leads ORDER BY id DESC")
    except sqlite3.OperationalError:
        # created_at column not yet added — fetch without it
        cursor.execute("SELECT id, name, email, phone FROM leads ORDER BY id DESC")
        leads = cursor.fetchall()
        conn.close()
        return [{"id": r[0], "name": r[1], "email": r[2], "phone": r[3] or "", "created_at": ""} for r in leads]
    leads = cursor.fetchall()
    conn.close()
    return [
        {"id": r[0], "name": r[1], "email": r[2], "phone": r[3] or "", "created_at": r[4] or ""}
        for r in leads
    ]



def save_chat_message(user_email: str, user_name: str, role: str, message: str):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO chat_history (user_email, user_name, role, message) VALUES (?, ?, ?, ?)",
        (user_email, user_name, role, message)
    )
    conn.commit()
    conn.close()


def get_chat_history(user_email: str):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, message, created_at FROM chat_history WHERE user_email = ? ORDER BY id ASC",
        (user_email,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [{"role": r[0], "message": r[1], "time": r[2] or ""} for r in rows]


def get_all_chat_sessions():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT user_email, user_name, COUNT(*) as msg_count, MAX(created_at) as last_msg
        FROM chat_history
        GROUP BY user_email
        ORDER BY last_msg DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [
        {"email": r[0], "name": r[1] or r[0], "messages": r[2], "last_message": r[3] or "", "needsHuman": False}
        for r in rows
    ]
