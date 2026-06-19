-- EOS detail fields per rock. All optional free-text.
ALTER TABLE rocks
  ADD COLUMN best_result      text,
  ADD COLUMN worst_result     text,
  ADD COLUMN success_criteria text,
  ADD COLUMN resources        text;
