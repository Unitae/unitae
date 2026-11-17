-- The two rights to enter a meeting's attendance: « Saisir l’assistance » and « Corriger l’assistance ». Contract: no
-- change in who can do what — the rows are inserted, nobody is granted them. Admins hold them through can-do-anything;
-- each congregation gives them to its own roles from « Rôles et autorisations ».
--
-- Inserted here rather than left to seedPermissions(), which only runs at setup and registration. No RolePermission
-- grant, so the image still running when this applies never meets a key it does not know. Keyed: re-running is a
-- no-op. Permission has no congregation column and no row-level security.

INSERT INTO "Permission" ("key")
VALUES ('can-record-attendance'), ('can-correct-attendance')
ON CONFLICT ("key") DO NOTHING;
