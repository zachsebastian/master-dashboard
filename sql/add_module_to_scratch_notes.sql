-- Optional "where to flesh this out" pointer for a scratchpad note.
-- Stores a module id (e.g. 'projects'); null means no module.
ALTER TABLE scratch_notes ADD COLUMN module text;
