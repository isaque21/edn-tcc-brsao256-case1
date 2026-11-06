# Case 01: Contador de Acessos (Serverless)

Página "Em Breve" com um contador de pessoas interessadas, usando API Gateway + AWS Lambda + Amazon DynamoDB.

## Estrutura

```
frontend/
  index.html    Página "Em Breve"
  style.css     Estilos
  app.js        Lê o total (GET /hits) e registra interesse (POST /hits)
  config.js     URL da API (preencher após criar o API Gateway)
lambda/
  lambda_function.py   Código da função Lambda (Python)
docs/
  PASSO-A-PASSO-AWS.md Guia para criar os recursos pelo Console AWS
```

## Contrato da API

| Método | Rota | Resposta |
|---|---|---|
| `GET` | `/hits` | `{"total": 123}` |
| `POST` | `/hits` | `{"total": 124}` (soma +1 de forma atômica) |

Item no DynamoDB: `{ "id": "hits", "total": <Number> }`, com Partition Key `id` (String).

## Como usar

1. Siga [docs/PASSO-A-PASSO-AWS.md](docs/PASSO-A-PASSO-AWS.md) para criar a infraestrutura.
2. Coloque a Invoke URL do API Gateway em `frontend/config.js`.
3. Teste localmente com `python -m http.server 8080` dentro de `frontend/` e acesse `http://localhost:8080`.

Sem a URL configurada, a página roda em modo demonstração, com o contador salvo só no navegador.
