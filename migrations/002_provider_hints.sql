-- Existing MVP rows did not store a non-sensitive display hint. Keep a safe generic hint.
UPDATE ai_providers SET key_hint = '••••' WHERE key_hint IS NULL OR key_hint = '';
