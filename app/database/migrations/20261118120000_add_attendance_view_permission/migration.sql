-- « Consulter l’assistance »: the attendance page's averages and history. Contract: no change in who can do what — the
-- row is inserted, nobody is granted it. Admins hold it through can-do-anything; each congregation gives it to its own
-- roles from « Rôles et autorisations ». No RolePermission grant, so the image still running when this applies never
-- meets a key it does not know. Keyed: re-running is a no-op.

INSERT INTO "Permission" ("key")
VALUES ('can-view-attendance')
ON CONFLICT ("key") DO NOTHING;
