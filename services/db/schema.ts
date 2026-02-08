export const schemaVersion = 1

export const schemaStatements = [
	"PRAGMA journal_mode = WAL;",
	"PRAGMA foreign_keys = ON;",
	"CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL);",
	"CREATE TABLE IF NOT EXISTS library_manga(id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, cover_url TEXT, status TEXT, description TEXT, category_id TEXT, default_provider_id TEXT, default_language TEXT, added_at INTEGER, updated_at INTEGER);",
	"CREATE TABLE IF NOT EXISTS manga_alt_titles(id TEXT PRIMARY KEY NOT NULL, manga_id TEXT NOT NULL, language TEXT, title TEXT NOT NULL);",
	"CREATE TABLE IF NOT EXISTS manga_providers(id TEXT PRIMARY KEY NOT NULL, manga_id TEXT NOT NULL, provider_id TEXT NOT NULL, provider_manga_id TEXT NOT NULL, UNIQUE(manga_id, provider_id, provider_manga_id));",
	"CREATE TABLE IF NOT EXISTS chapters(id TEXT PRIMARY KEY NOT NULL, manga_provider_id TEXT NOT NULL, provider_chapter_id TEXT NOT NULL, title TEXT, chapter_number REAL, volume_number REAL, language TEXT, scanlation_group TEXT, published_at INTEGER, is_read INTEGER, last_page_read INTEGER, total_pages INTEGER, is_downloaded INTEGER, UNIQUE(manga_provider_id, provider_chapter_id));",
	"CREATE TABLE IF NOT EXISTS reading_history(id TEXT PRIMARY KEY NOT NULL, manga_id TEXT NOT NULL, chapter_id TEXT NOT NULL, provider_id TEXT NOT NULL, page INTEGER, read_at INTEGER, is_private INTEGER);",
	"CREATE TABLE IF NOT EXISTS downloads(id TEXT PRIMARY KEY NOT NULL, chapter_id TEXT NOT NULL, status TEXT NOT NULL, progress REAL, file_path TEXT, total_pages INTEGER, downloaded_pages INTEGER, created_at INTEGER, error_message TEXT);",
	"CREATE TABLE IF NOT EXISTS provider_accounts(provider_id TEXT PRIMARY KEY NOT NULL, username TEXT, is_logged_in INTEGER, credentials_key TEXT);",
	"CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);",
	"CREATE INDEX IF NOT EXISTS idx_library_category ON library_manga(category_id);",
	"CREATE INDEX IF NOT EXISTS idx_chapters_provider ON chapters(manga_provider_id);",
	"CREATE INDEX IF NOT EXISTS idx_history_read_at ON reading_history(read_at DESC);",
]
