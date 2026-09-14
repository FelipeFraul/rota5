> **Current Baseline 2.3.0 (2026-09-14):** functional source `c726902505fd69c2cfef2dec8013ffe0cf0adba3`; fingerprint `6851aa10ce08fec1444d08bd213b18349dd70ec8ee6b7753c023164207e9b1d3`; default suite **214/214 PASS** with zero known failures and zero new regressions. Finding `gap.default-test-suite-failing` is **RESOLVED**. Current Production is `dpl_4koAv277hsZ7Z1yCjT5TLPDVgBSa` (READY) and Preview evidence is `dpl_FyZdcGzqAmPXsghbkjVPxTBCoZG6`. Metrics: ACTIVE HIGH 1, POTENTIAL HIGH 1, OPEN HIGH 2, RESOLVED 8. Product health remains BROKEN; infrastructure health remains DEGRADED. Older baseline sections below are historical evidence.

# Completeness scorecard — Etapa 7

| Área | Confiança | Justificativa | Evidência faltante para confiança maior |
| --- | --- | --- | --- |
| REPOSITORY | HIGH_CONFIDENCE | Branch, HEAD, origin, working tree e inventários físicos foram recontados; paths catalogados existem. | Inventário externo de consumidores e artefatos publicados. |
| ARCHITECTURE | HIGH_CONFIDENCE | 17 domains, 66 modules e grafo de 817 dependências foram reconciliados com código e catálogos. | Telemetria/import graph de runtime. |
| CAPABILITIES | HIGH_CONFIDENCE | 140 registros possuem cadeia ENTRY → IMPLEMENTATION → DATA/INTEGRATION → RESULT ou limitação explícita; zero sem classificação. | Evidência E2E segura para capacidades críticas. |
| FLOWS | HIGH_CONFIDENCE | 34 flows, 169 steps e 66 transitions têm referências válidas; branches e terminais foram rechecados. | Traces E2E controlados. |
| DATA | MEDIUM_CONFIDENCE | 44 tabelas e OpenAPI remoto coincidem; 77 migrations e definições finais locais foram recontadas. | Catálogo PostgreSQL remoto read-only. |
| INTEGRATIONS | MEDIUM_CONFIDENCE | As 6 integrações e suas dependências foram reencontradas; superfícies seguras responderam. | Configuração e logs read-only dos provedores. |
| INFRASTRUCTURE | MEDIUM_CONFIDENCE | Projetos, aliases, healthchecks, crons e drift site × rota5 foram revalidados. | Metadados e logs completos do deployment. |
| TESTS | MEDIUM_CONFIDENCE | 51 arquivos catalogados; suíte padrão reexecutada: 214/214 PASS. | Ambiente isolado para a suíte ampliada e testes reais. |
| RISKS | HIGH_CONFIDENCE | 44 findings foram confrontados com evidência; 3 P0 e todos os 10 HIGH permaneceram calibrados; nenhum CRITICAL foi provado. | Evidência remota dos itens NOT_VALIDATED. |
| RUNTIME | MEDIUM_CONFIDENCE | 15 checks foram revisados; distribuição canônica permanece 12 PASS, 2 PARTIAL e 1 FAIL. | Observação read-only adicional ou ambiente isolado. |

Confiança global: **ALTA**. O scorecard avalia a fidelidade da representação e preserva limites remotos; não afirma que o produto está saudável.
