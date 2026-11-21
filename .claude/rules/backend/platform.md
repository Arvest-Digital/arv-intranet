---
paths:
  - "packages/platform/**"
  - "packages/kernel/**"
---
# Platform and kernel

- `@arv/kernel` depends only on `effect`. It holds shared branded IDs (`UserId`, `EmployeeId`, `ProjectId`), `Actor`/`CurrentActor`, `Permission`/`requirePermission`, `Today` (the company date read through Effect's `Clock`; `TodayLive(timeZone)` is pure and provided by the host from `COMPANY_TIME_ZONE`), `DomainEvent`, and the `UnitOfWork` and `DomainEvents` ports. No infrastructure implementations (`UnitOfWorkLive` lives in `@arv/db`).
- `@arv/platform` holds technical plumbing only. Today: `/http` (`runEffect`, `validate`, `toHttpError`, `errorBody`, `HttpEnv`). `/tx` and `/events` come with the first asynchronous use case. It must never import a module or `apps/*`.
- Every module depends on these packages. Ask before changing a public signature here.
