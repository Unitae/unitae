-- « Consulter l’assistance »: the attendance averages, history and exports. Contract: no change in who can do what —
-- the row is inserted, nobody is granted it. Admins hold it through can-do-anything; each congregation gives it to its
-- own roles from « Rôles et autorisations ». Same shape as 20261118090000_add_attendance_entry_permissions.

INSERT INTO "Permission" ("key")
VALUES ('can-view-attendance')
ON CONFLICT ("key") DO NOTHING;
