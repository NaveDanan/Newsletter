import sqlite3

DB_PATH = r"C:/Users/naved/Downloads/pocketbase_0.36.8_windows_amd64/pb_data/data.db"

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

tables = [row[0] for row in cur.execute("select name from sqlite_master where type='table' order by name").fetchall()]
print("TABLE_COUNT", len(tables))
print("HAS__collections", cur.execute("select count(*) from sqlite_master where type='table' and name='_collections'").fetchone()[0])
print("HAS__collections2", cur.execute("select count(*) from sqlite_master where type='table' and name='_collections2'").fetchone()[0])
print("TABLES", tables)
