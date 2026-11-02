# ADR-0005 — Identidade Microsoft Entra ID e RBAC local

**Status:** aceita (decisões do Passo 7) · **Data:** 2026-10-23

## Contexto
Requisitos: login corporativo, sem senhas corporativas armazenadas, sem confiar no e-mail como
identidade permanente, sem bypass de autenticação. O código herdado aceitava tokens apenas
decodificados (sem assinatura), copiava papéis das claims e tinha endpoints públicos de
sincronização de usuários.

## Decisão
* SPA obtém access tokens v2.0 via MSAL (Authorization Code + PKCE); a API valida RS256/JWKS e
  todas as claims relevantes (`iss`, `aud`, `tid`, `ver`, `exp`, `nbf`, `iat`, `scp`, `azp`, `oid`).
* Identidade permanente = (`entra-id`, `tid`, `oid`); e-mail é atributo de exibição.
* Provisionamento JIT **sem papéis**; papéis e permissões (`recurso:ação`) vivem no banco e são
  administrados no ConsolidaHub; claims de papéis/grupos do token são ignoradas.
* Primeiro administrador concedido por CLI com acesso ao banco (auditado); nenhuma rota de
  bootstrap.
* Verificação de JWT implementada com `node:crypto` (sem `passport`/`jsonwebtoken`).

## Alternativas
* App roles/grupos do Entra — rejeitado no Passo 7 (gestão de acesso dentro do produto).
* `passport-azure-ad` — pacote marcado como *deprecated* no npm; além disso traria o `passport`,
  removido do projeto.
* `jose` — boa opção; preterida para evitar dependência numa validação curta e totalmente coberta
  por testes (29 casos). Pode ser adotada no futuro sem mudar a porta `TokenVerifier`.

## Consequências
* Usuário novo precisa de concessão de papel antes de usar o sistema.
* Alteração de papéis vale na próxima requisição (permissões lidas do banco a cada chamada).
* A validação depende de acesso de saída a `login.microsoftonline.com` (JWKS).
