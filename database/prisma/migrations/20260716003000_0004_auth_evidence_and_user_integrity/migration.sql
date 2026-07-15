-- Login-attempt evidence is security history. Application code may append and
-- read it, but neither a defect nor a compromised runtime credential may
-- rewrite or erase prior attempts.
CREATE FUNCTION "reject_login_attempt_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'login_attempts is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "login_attempts_append_only"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "login_attempts"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_login_attempt_mutation"();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "login_attempts" FROM mobileshop_app;

-- Users are deactivated and their sessions revoked; identity rows are never
-- hard-deleted because role assignment and authentication history must remain
-- attributable even before another audit row references a newly-created user.
CREATE FUNCTION "reject_user_deletion"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'users cannot be hard-deleted; deactivate the user instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "users_no_hard_delete"
BEFORE DELETE OR TRUNCATE ON "users"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_user_deletion"();

REVOKE DELETE, TRUNCATE ON TABLE "users" FROM mobileshop_app;
