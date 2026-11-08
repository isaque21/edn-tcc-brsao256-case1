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

## Free Tier e cobrança

Todos os serviços do case cobram por uso. Sem acessos, o custo fica praticamente em zero, porque nada é cobrado por tempo parado.

### Qual Free Tier vale para a sua conta

Em 15 de julho de 2025 a AWS mudou o Free Tier ([anúncio](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits/)):

| Conta criada | O que recebe |
|---|---|
| Antes de 15/07/2025 | Free Tier antigo: limites gratuitos por serviço durante 12 meses, mais os limites "Always Free". |
| A partir de 15/07/2025, plano **Free** | Até US$ 200 em créditos e limites "Always Free". A conta é encerrada após 6 meses ou quando os créditos acabam, a menos que você mude para o plano pago. |
| A partir de 15/07/2025, plano **Paid** | Os mesmos créditos e limites "Always Free". Quando os créditos acabam, passa a cobrar normalmente. |

Em contas que fazem parte de uma **AWS Organization** (comum em contas corporativas), os limites gratuitos são somados entre todas as contas da organização. Nesse caso, considere que o laboratório será cobrado normalmente.

### O que cada serviço cobre de graça

| Serviço | Limite gratuito | Observação para este case |
|---|---|---|
| AWS Lambda | 1 milhão de requisições e 400 mil GB-segundos por mês (Always Free) | Cobre com folga. |
| Amazon DynamoDB | 25 GB de armazenamento, 25 WCU e 25 RCU **provisionadas** por mês (Always Free) | O guia usa o modo **on-demand**, que não entra nas unidades gratuitas. Só o armazenamento sai de graça. Para ficar 100% no gratuito, crie a tabela em modo **Provisioned** com 1 a 5 WCU/RCU. |
| Amazon API Gateway (HTTP API) | 1 milhão de chamadas por mês, só no Free Tier antigo de 12 meses | Contas novas pagam com os créditos. |
| Amazon CloudWatch Logs | 5 GB de logs por mês (Always Free) | Os logs da Lambda ficam bem abaixo disso. |
| Amazon S3 (site) | 5 GB, 20 mil GET e 2 mil PUT por mês, só no Free Tier antigo de 12 meses | Os 4 arquivos do site ocupam alguns KB. |
| Amazon CloudFront | Plano Free: US$ 0 por mês, com cota mensal de requisições e tráfego. Pay-as-you-go: 1 TB e 10 milhões de requisições por mês (Always Free) | Cobre com folga. No pay-as-you-go, o AWS WAF é cobrado à parte. |
| AWS Amplify Hosting | Coberto pelos créditos ou pelo Free Tier antigo | Cobrança por build, armazenamento e tráfego. |

### Quanto custa fora do Free Tier

Preços aproximados em `us-east-1`. Confira os valores atuais nas páginas de preço de cada serviço.

| Serviço | Preço aproximado | Custo por 1 milhão de cliques |
|---|---|---|
| API Gateway (HTTP API) | US$ 1,00 por milhão de requisições | ~US$ 1,00 |
| Lambda (arm64, 128 MB, ~50 ms) | US$ 0,20 por milhão + tempo de execução | ~US$ 0,30 |
| DynamoDB on-demand | US$ 0,625 por milhão de escritas | ~US$ 0,63 |
| **Total** | | **~US$ 2,00** |

Cada visita à página também faz uma leitura (`GET /hits`), que custa menos que uma escrita.

### Como evitar cobranças inesperadas

- Crie um alerta em **Billing and Cost Management** → **Budgets** com um valor baixo (ex.: US$ 5). O passo 8 do guia explica como.
- Mantenha o limite de requisições do API Gateway (passo 4.2 do guia). Ele impede que um script de terceiros gere milhões de chamadas.
- Acompanhe o consumo em **Billing and Cost Management** → **Free Tier**.
- Apague os recursos ao final do laboratório, seguindo a seção "Limpeza" do guia.

Fontes: [AWS Free Tier](https://aws.amazon.com/free/), [preços do API Gateway](https://aws.amazon.com/api-gateway/pricing/), [preços do Lambda](https://aws.amazon.com/lambda/pricing/), [preços do DynamoDB](https://aws.amazon.com/dynamodb/pricing/) e [planos do CloudFront](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html).
