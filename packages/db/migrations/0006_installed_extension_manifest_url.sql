-- The manifest URL used at install is needed to export an importable extension list.
-- Rows installed before this column stay NULL and are skipped by export import,
-- because guessing a URL from the provider source could install the wrong code.
ALTER TABLE `installed_extensions` ADD COLUMN `manifest_url` text;
