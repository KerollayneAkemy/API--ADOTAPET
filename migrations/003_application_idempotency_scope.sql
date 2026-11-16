-- Os registros legados eram todos de solicitações de adoção e foram migrados
-- para escopos por usuário em 002_generalize_idempotency.sql. Inclui a rota para
-- que respostas já persistidas continuem encontráveis pelo escopo atual da API.
UPDATE idempotency_keys
SET scope_key = scope_key || ':POST:/animals/:animalId/applications'
WHERE scope_key ~ '^user:[0-9a-f-]{36}$';
