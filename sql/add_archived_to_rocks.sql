-- Archive flag for rocks. Archived rocks stay in the hierarchy and keep their
-- existing project/metric associations, but are hidden from the pickers unless
-- the project/metric is currently assigned to that archived rock.
ALTER TABLE rocks ADD COLUMN archived boolean NOT NULL DEFAULT false;
