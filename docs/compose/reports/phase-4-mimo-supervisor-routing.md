# Phase 4 MiMo Supervisor And Routing Report

## Completed

- External MiMo reuse is disabled by default and requires explicit `MIMO_REUSE_EXISTING=true`.
- Explicit `MIMO_PORT` reuse checks only that port and requires the MiMo `/path.directory` identity to match `MIMO_SERVE_CWD`.
- Supervisor lifecycle exposes `idle`, `starting`, `running`, `attached`, `restarting`, `degraded`, `stopping`, and `exited` states.
- Concurrent base starts and restarts are single-flight.
- Validated `directory` requests route to managed per-directory MiMo instances.
- Starting and running directory processes are both registered for shutdown.
- TERM shutdown waits for process `exit/close`, escalates to KILL after timeout, and releases registrations only after termination.
- Startup stdout/stderr retain a bounded 64 KiB tail.
- Proxy target resolution errors return a stable public 502 without leaking host paths or MiMo configuration errors.

## Verification

- Unit tests cover concurrent base startup, concurrent restart, bounded logs, and directory target resolution.
- An isolated runtime used WebUI `127.0.0.1:8180`, base MiMo `4296`, and two workspace directories.
- Repeated requests for directory A reused port `4297`; directory B used `4298`.
- Authenticated status listed exactly two project servers with distinct ports and directories.
- SIGTERM released WebUI ports `8180`, `4296`, `4297`, and `4298` with no managed MiMo process left behind.

## Residual Work

- Stage 5 owns browser disconnect/reconnect and SSE snapshot reconciliation.
- Stage 6 owns structured logs, detailed restart counters, and release evidence packaging.
