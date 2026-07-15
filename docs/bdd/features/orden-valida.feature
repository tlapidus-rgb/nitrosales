# Behavior-Driven Data — contrato central de "orden válida"
# Regla (fuente única): src/domains/orders/index.ts
#   ORDER_STATUS_NOT_CONCRETED = [CANCELLED, PENDING, RETURNED]  +  totalValue > 0
# Ver PLAN_ARQUITECTURA_MODULAR_MONOLITO.md §7.1.
# Tests ejecutables: src/__tests__/bdd/orden-valida.test.ts

Feature: Definición canónica de orden válida
  Como plataforma de métricas
  Quiero que "orden válida" signifique lo mismo en todas partes
  Para que Tomy vea el mismo número en dashboard, pixel y pedidos

  Background:
    Given una orden CANCELLED con totalValue 50000
    And una orden APPROVED con totalValue 0
    And una orden PENDING con totalValue 30000
    And una orden APPROVED con totalValue 115000
    And una orden RETURNED con totalValue 80000

  Scenario: Conteo de órdenes válidas
    When cuento las órdenes válidas
    Then el conteo de órdenes válidas es 1
    And el revenue es 115000

  Scenario: El predicado JS y el SQL no pueden divergir (anti-drift)
    Given el filtro se genera desde ORDER_STATUS_NOT_CONCRETED
    Then toda orden concretada con valor > 0 es válida
    And ninguna orden CANCELLED, PENDING o RETURNED es válida
    And el SQL de ordersValidSql() excluye exactamente esos tres status

  # Requiere DB (integración) — se implementa con fixture Neon branch. PLAN §7.1 scenario 2 + §7.4.
  @db-gated @pending
  Scenario: Consistencia cross-surface
    When consulto /api/metrics/orders KPI "órdenes"
    And consulto /api/metrics/pixel funnel "compra"
    And consulto /pedidos filtrado VTEX mismo rango
    Then los tres conteos de órdenes válidas web son idénticos
