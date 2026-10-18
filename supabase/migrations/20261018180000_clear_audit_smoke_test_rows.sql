-- One-off: removes the smoke-test rows written while verifying the audit
-- log, so the client starts with a clean history. Safe to keep in history.
delete from admin_audit_log where actor = 'Zakaria (test)';
