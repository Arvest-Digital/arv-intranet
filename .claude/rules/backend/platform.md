---
paths:
  - "packages/platform/**"
  - "packages/kernel/**"
---
# Platform and kernel

- `@arv/kernel` depends only on `effect`. It holds shared branded IDs (`UserId`), `Actor`/`CurrentActor`, `DomainEvent`, and the `UnitOfWork` and `DomainEvents` ports. No implementations.
- `@arv/platform` holds technical plumbing only. Today: `/http` (`runEffect`, `validate`, `toHttpError`, `errorBody`, `HttpEnv`). `/tx` and `/events` come with the first asynchronous use case. It must never import a module or `apps/*`.
- Every module depends on these packages. Ask before changing a public signature here.
