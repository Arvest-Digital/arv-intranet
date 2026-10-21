---
paths:
  - "modules/*/src/domain/errors.ts"
  - "modules/*/src/http/presenter.ts"
  - "packages/contracts/src/shared/**"
  - "packages/platform/src/http/**"
---
# Errors

- Expected business failures are domain errors (`Schema.TaggedError`) in the module's `domain/errors.ts`.
- The module's `http/presenter.ts` maps each domain error to a shared contract error (`NotFound`, `Conflict`) from `@arv/contracts/shared`.
- Only a new kind of HTTP failure needs a new shared contract error, added to `ContractError` and `toHttpError` (`@arv/platform/http`). That should be rare; ask first.
- Database and other infrastructure failures are defects → 500, logged by `runEffect`, never sent to the client.
