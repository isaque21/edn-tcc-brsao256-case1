# Contador de Acessos: passo a passo no Console AWS

Guia para criar manualmente, pelo Console AWS, a infraestrutura serverless do contador de acessos da página "Em Breve".

## Visão geral

```
Navegador (index.html)
   │  GET  /hits  → lê o total
   │  POST /hits  → soma +1
   ▼
Amazon API Gateway (HTTP API)
   ▼
AWS Lambda (contador-acessos)  ──IAM Role──►  Amazon DynamoDB (tabela contador-acessos)
                                               item: { id: "hits", total: N }
```

| Recurso | Nome usado neste guia |
|---|---|
| Tabela DynamoDB | `contador-acessos` |
| Política IAM | `contador-acessos-dynamodb-policy` |
| Role IAM | `contador-acessos-lambda-role` |
| Função Lambda | `contador-acessos` |
| API Gateway | `contador-acessos-api` |
| Bucket S3 público (site, Opção A) | `contador-acessos-site-<algo-único>` |
| Bucket S3 privado (Opção C) | `contador-acessos-cf-<algo-único>` |
| Distribuição CloudFront (Opção C) | `contador-acessos-site` |

### Antes de começar

1. Faça login no Console AWS com um usuário que possa criar recursos de DynamoDB, IAM, Lambda, API Gateway e S3.
2. Escolha **uma região** no canto superior direito (ex.: `us-east-1` ou `sa-east-1`) e use a mesma em todos os passos. Recurso criado em outra região não aparece nas listas e quebra a integração.
3. Anote o **ID da conta** (12 dígitos): clique no nome do usuário no canto superior direito e copie o "Account ID". Ele será usado na política IAM.

---

## Passo 1: Criar a tabela no DynamoDB

1. Abra o serviço **DynamoDB** e clique em **Tables** → **Create table**.
2. Preencha:
   - **Table name:** `contador-acessos`
   - **Partition key:** `id`, tipo **String**
   - **Sort key:** deixe em branco.
3. Em **Table settings**, escolha **Customize settings** e confira:
   - **Table class:** DynamoDB Standard
   - **Read/write capacity settings:** **On-demand** (cobra por requisição e escala sozinho, ideal quando não se sabe se serão 10 ou 1 milhão de acessos).
4. Deixe o resto no padrão e clique em **Create table**. Aguarde o status ficar **Active**.
5. Abra a tabela e copie o **Amazon Resource Name (ARN)** em **General information**. Formato:
   `arn:aws:dynamodb:<regiao>:<account-id>:table/contador-acessos`

> **Sobre a Partition Key:** o contador usa um único item com chave fixa `id = "hits"`. Não é preciso criar o item manualmente. A Lambda usa `UpdateItem` com `ADD`, que cria o item com `total = 1` no primeiro clique.
>
> (Opcional) Para começar visualmente com zero: **Explore table items** → **Create item** → `id` (String) = `hits`, **Add new attribute** → **Number** → nome `total`, valor `0` → **Create item**.

---

## Passo 2: Criar as permissões no IAM

Por padrão, nenhum serviço da AWS conversa com outro. A Lambda precisa de uma **Role** que diga explicitamente: "pode ler e atualizar a tabela `contador-acessos`" e "pode gravar logs no CloudWatch".

### 2.1 Política com acesso mínimo à tabela

1. Abra o serviço **IAM** → **Policies** → **Create policy**.
2. Clique na aba **JSON** e substitua o conteúdo por (troque `<regiao>` e `<account-id>`, ou cole o ARN copiado no Passo 1):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "ContadorLeituraEscrita",
         "Effect": "Allow",
         "Action": [
           "dynamodb:GetItem",
           "dynamodb:UpdateItem"
         ],
         "Resource": "arn:aws:dynamodb:<regiao>:<account-id>:table/contador-acessos"
       }
     ]
   }
   ```

3. **Next** → **Policy name:** `contador-acessos-dynamodb-policy` → **Create policy**.

> **Por que não `PutItem`?** O código só usa `GetItem` (ler o total) e `UpdateItem` (somar +1, criando o item se não existir). Seguindo o princípio do menor privilégio, liberamos só o que é usado. Se no futuro o código passar a usar `PutItem`, adicione `"dynamodb:PutItem"` na lista.
>
> Evite usar a política gerenciada `AmazonDynamoDBFullAccess`: ela libera todas as tabelas da conta, inclusive para apagar.

### 2.2 Role da Lambda

1. **IAM** → **Roles** → **Create role**.
2. **Trusted entity type:** AWS service. **Use case:** **Lambda**. Clique em **Next**.
3. Em **Add permissions**, pesquise e marque:
   - `contador-acessos-dynamodb-policy` (criada acima)
   - `AWSLambdaBasicExecutionRole` (permite gravar logs no CloudWatch)
4. **Next** → **Role name:** `contador-acessos-lambda-role` → **Create role**.

---

## Passo 3: Criar a função Lambda

1. Abra o serviço **Lambda** → **Create function**.
2. Selecione **Author from scratch** e preencha:
   - **Function name:** `contador-acessos`
   - **Runtime:** Python 3.13 (ou a versão Python mais recente da lista)
   - **Architecture:** `arm64` (cerca de 20% mais barata que x86 e suficiente para este código)
3. Expanda **Change default execution role** → **Use an existing role** → selecione `contador-acessos-lambda-role`.
4. Clique em **Create function**.

### 3.1 Código

1. Na aba **Code**, abra o arquivo `lambda_function.py` no editor.
2. Apague o conteúdo e cole o código do arquivo [`lambda/lambda_function.py`](../lambda/lambda_function.py) deste projeto.
3. Clique em **Deploy**.
4. Confira em **Runtime settings** que o **Handler** é `lambda_function.lambda_handler` (é o padrão).

### 3.2 Variáveis de ambiente

1. Aba **Configuration** → **Environment variables** → **Edit** → **Add environment variable**:

   | Key | Value |
   |---|---|
   | `TABLE_NAME` | `contador-acessos` |

2. **Save**.

`COUNTER_ID` (padrão `hits`) e `ALLOWED_ORIGIN` (padrão `*`) são opcionais. O timeout padrão de 3 segundos e a memória de 128 MB são suficientes.

### 3.3 Testar a Lambda isoladamente

1. Aba **Test** → **Create new event** → **Event name:** `post-hits`.
2. Cole o JSON abaixo e clique em **Save** e depois **Test**:

   ```json
   { "requestContext": { "http": { "method": "POST" } } }
   ```

3. O resultado esperado é `"statusCode": 200` e `"body": "{\"total\": 1}"`.
4. Volte ao DynamoDB → tabela `contador-acessos` → **Explore table items**: o item `id = hits` deve aparecer com `total = 1`.

Se der erro `AccessDeniedException`, a política do Passo 2.1 está com ARN errado (região, conta ou nome da tabela). Veja a seção [Solução de problemas](#solução-de-problemas).

---

## Passo 4: Criar a API no API Gateway

Usaremos **HTTP API**, que é mais simples e custa cerca de 70% menos que a REST API para este caso.

1. Abra o serviço **API Gateway** → **Create API** → em **HTTP API**, clique em **Build**.
2. **Create and configure integrations:**
   - **Add integration** → **Lambda**
   - **AWS Region:** a mesma dos passos anteriores
   - **Lambda function:** `contador-acessos`
   - **Version:** 2.0
   - **API name:** `contador-acessos-api`
   - Clique em **Next**.
3. **Configure routes** (crie duas rotas, ambas apontando para a Lambda `contador-acessos`):

   | Method | Resource path | Integration target |
   |---|---|---|
   | `GET` | `/hits` | `contador-acessos` |
   | `POST` | `/hits` | `contador-acessos` |

   Clique em **Next**.
4. **Define stages:** mantenha **Stage name** `$default` com **Auto-deploy** ligado. **Next** → **Create**.
5. Na página da API, copie a **Invoke URL**. Formato:
   `https://<api-id>.execute-api.<regiao>.amazonaws.com`

> Ao ligar a integração, o console adiciona automaticamente na Lambda a permissão para o API Gateway invocá-la. Para conferir: Lambda → `contador-acessos` → **Configuration** → **Permissions** → **Resource-based policy statements**. Deve existir uma entrada com principal `apigateway.amazonaws.com`.

### 4.1 Configurar CORS

Sem CORS, o navegador bloqueia a chamada da página para a API, porque elas estão em domínios diferentes.

1. No menu lateral da API, **Develop** → **CORS** → **Configure**.
2. Preencha:
   - **Access-Control-Allow-Origin:** `*` por enquanto (no Passo 7 trocaremos pela URL do site)
   - **Access-Control-Allow-Headers:** `content-type`
   - **Access-Control-Allow-Methods:** `GET`, `POST`
   - **Access-Control-Max-Age:** `300`
3. **Save**.

### 4.2 Limitar requisições (proteção de custo)

Como a API é pública, defina um limite para evitar que um script malicioso gere custo ou infle o contador.

1. Menu lateral → **Protect** → **Throttling**.
2. Selecione o stage `$default` → **Edit** (em **Default route throttling**).
3. Ative e preencha, por exemplo: **Burst limit** `50` e **Rate limit** `25` (requisições por segundo).
4. **Save**.

Ajuste os valores conforme a expectativa da campanha. Requisições acima do limite recebem HTTP 429.

---

## Passo 5: Testar a API

Pelo navegador, abra `https://<api-id>.execute-api.<regiao>.amazonaws.com/hits`. Deve aparecer algo como `{"total": 1}`.

Pelo terminal (PowerShell, WSL ou CloudShell):

```bash
# Ler o total
curl https://<api-id>.execute-api.<regiao>.amazonaws.com/hits

# Somar +1
curl -X POST https://<api-id>.execute-api.<regiao>.amazonaws.com/hits
```

No PowerShell, use `curl.exe` em vez de `curl`, ou `Invoke-RestMethod -Method Post -Uri <url>/hits`.

---

## Passo 6: Configurar e testar o frontend localmente

1. Abra [`frontend/config.js`](../frontend/config.js) e cole a Invoke URL, **sem barra no final**:

   ```js
   window.APP_CONFIG = {
     API_URL: "https://<api-id>.execute-api.<regiao>.amazonaws.com"
   };
   ```

2. Sirva a pasta `frontend` localmente:

   ```bash
   cd frontend
   python -m http.server 8080
   ```

3. Acesse `http://localhost:8080`. O número deve carregar e, ao clicar em **Tenho interesse!**, aumentar em 1.

> O navegador guarda no `localStorage` que você já clicou, para evitar que a mesma pessoa conte várias vezes. Para testar de novo, abra uma aba anônima ou rode `localStorage.clear()` no console do navegador (F12).
>
> Com `API_URL` vazio, a página roda em "modo demonstração" e o contador fica só no navegador.

---

## Passo 7: Publicar o frontend

Escolha uma das opções.

### Opção A: Amazon S3 (site estático)

1. Abra o serviço **S3** → **Create bucket**.
   - **Bucket type:** General purpose
   - **Bucket name:** `contador-acessos-site-<algo-único>` (o nome é global, precisa ser único no mundo)
   - **Block Public Access settings:** desmarque **Block all public access** e marque a confirmação de que o bucket ficará público.
   - **Create bucket**.
2. Abra o bucket → **Upload** → **Add files** → selecione `index.html`, `style.css`, `app.js` e `config.js` (já com a URL da API) → **Upload**.
3. Aba **Properties** → **Static website hosting** → **Edit** → **Enable** → **Index document:** `index.html` → **Save changes**.
4. Aba **Permissions** → **Bucket policy** → **Edit** → cole (troque o nome do bucket):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "LeituraPublicaDoSite",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::contador-acessos-site-<algo-único>/*"
       }
     ]
   }
   ```

   **Save changes**.
5. Volte em **Properties** → **Static website hosting** e copie o **Bucket website endpoint** (ex.: `http://contador-acessos-site-xyz.s3-website-us-east-1.amazonaws.com`).

> Se o salvamento da bucket policy falhar com "Access denied", a conta provavelmente bloqueia buckets públicos no nível da conta ou da organização. Nesse caso, use a Opção B ou a Opção C.
>
> O endpoint de site do S3 é só HTTP. Para HTTPS e domínio próprio, use a Opção B ou a Opção C.

### Opção B: AWS Amplify Hosting (HTTPS sem bucket público)

1. Compacte em um `.zip` **o conteúdo** da pasta `frontend` (os 4 arquivos na raiz do zip, não a pasta).
2. Abra o serviço **AWS Amplify** → **Create new app** → **Deploy without Git** → **Next**.
3. Dê um nome (`contador-acessos-site`), escolha **Drag and drop**, arraste o `.zip` → **Save and deploy**.
4. Copie a URL gerada (ex.: `https://staging.d1abc23xyz.amplifyapp.com`).

### Opção C: Amazon CloudFront + S3 privado (HTTPS e CDN)

Nesta opção o bucket continua **privado**. Só o CloudFront consegue ler os arquivos, usando Origin Access Control (OAC). O visitante acessa por HTTPS, e a página é entregue a partir do ponto de presença da AWS mais próximo dele.

Use um bucket novo. Se você já fez a Opção A, não reaproveite aquele bucket público: o OAC não funciona com o endpoint de "Static website hosting".

#### C.1 Bucket privado

1. Abra o serviço **S3** → **Create bucket**.
   - **Bucket type:** General purpose
   - **Bucket name:** `contador-acessos-cf-<algo-único>`
   - **Object Ownership:** ACLs disabled (padrão)
   - **Block Public Access settings:** mantenha **Block all public access** marcado.
   - **Create bucket**.
2. Abra o bucket → **Upload** → **Add files** → selecione `index.html`, `style.css`, `app.js` e `config.js` (já com a URL da API) → **Upload**.
3. **Não** ative o **Static website hosting** nem crie bucket policy. O CloudFront cria a policy no próximo passo.

#### C.2 Distribuição CloudFront

1. Abra o serviço **CloudFront** → **Distributions** → **Create distribution**.
2. **Plano de preço:** se o console pedir para escolher um plano, selecione **Free** (US$ 0 por mês, com cota de requisições e tráfego que sobra para este case). Se aparecer a opção pay-as-you-go, ela também serve.
3. **Get started:**
   - **Distribution name:** `contador-acessos-site`
   - **Distribution type:** **Single website or app**
   - **Domain:** deixe em branco (usaremos o domínio `*.cloudfront.net`)
   - **Next**.
4. **Specify origin:**
   - **Origin type:** **Amazon S3**
   - **S3 origin:** **Browse S3** → selecione `contador-acessos-cf-<algo-único>`. O endereço deve ser do tipo `<bucket>.s3.<regiao>.amazonaws.com`, sem `s3-website`.
   - **Settings:** **Use recommended origin settings**. Isso cria o OAC e aplica a política de cache recomendada para S3.
   - **Next**.
5. **Enable security protections:**
   - No plano **Free**, a proteção básica do AWS WAF já vem incluída. Mantenha.
   - Em pay-as-you-go, ativar o WAF gera cobrança mensal. Para este case, escolha **Do not enable security protections**.
   - **Next**.
6. Revise e clique em **Create distribution**. O CloudFront atualiza a bucket policy automaticamente.

#### C.3 Página inicial e verificação

1. Na distribuição, aba **General** → **Settings** → **Edit** → **Default root object:** `index.html` → **Save changes**. Sem isso, o endereço raiz (`/`) responde `AccessDenied`.
2. Aguarde o campo **Last modified** sair de **Deploying** e mostrar data e hora (alguns minutos).
3. Copie o **Distribution domain name** (ex.: `d111111abcdef8.cloudfront.net`) e acesse `https://d111111abcdef8.cloudfront.net`.
4. Confira no S3 → bucket → **Permissions** → **Bucket policy** se existe uma regra parecida com esta. Se o CloudFront não tiver conseguido criá-la, cole manualmente, trocando bucket, conta e ID da distribuição:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "AllowCloudFrontServicePrincipal",
         "Effect": "Allow",
         "Principal": { "Service": "cloudfront.amazonaws.com" },
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::contador-acessos-cf-<algo-único>/*",
         "Condition": {
           "StringEquals": {
             "AWS:SourceArn": "arn:aws:cloudfront::<account-id>:distribution/<distribution-id>"
           }
         }
       }
     ]
   }
   ```

   A condição `AWS:SourceArn` garante que só essa distribuição lê o bucket.
5. Teste o bloqueio direto: abrir `https://contador-acessos-cf-<algo-único>.s3.<regiao>.amazonaws.com/index.html` no navegador deve responder `AccessDenied`.

#### C.4 Publicar alterações

O CloudFront guarda os arquivos em cache por até 24 horas. Depois de subir uma nova versão no bucket (por exemplo, um `config.js` com outra URL da API):

1. Distribuição → aba **Invalidations** → **Create invalidation**.
2. **Object paths:** `/*` → **Create invalidation**.

O contador não sofre com esse cache, porque o número vem da API (`GET /hits`), e não dos arquivos do bucket.

> **Domínio próprio (opcional):** para usar algo como `embreve.suaempresa.com`, emita um certificado no **AWS Certificate Manager** na região `us-east-1` (exigência do CloudFront), adicione o domínio em **Alternate domain names** na distribuição e crie o registro DNS apontando para o domínio `*.cloudfront.net`.

### Restringir o CORS à URL do site

Com o site publicado, troque o `*` pela URL real:

1. API Gateway → `contador-acessos-api` → **Develop** → **CORS** → **Configure**.
2. Em **Access-Control-Allow-Origin**, remova `*` e adicione a URL do site, **sem barra no final**. Exemplos:
   - Opção A: `http://contador-acessos-site-xyz.s3-website-us-east-1.amazonaws.com`
   - Opção B: `https://staging.d1abc23xyz.amplifyapp.com`
   - Opção C: `https://d111111abcdef8.cloudfront.net` (e o domínio próprio, se tiver configurado)

   Se ainda for testar localmente, adicione também `http://localhost:8080`.
3. **Save**.

> Com CORS configurado no HTTP API, o API Gateway responde os cabeçalhos CORS e ignora os que a Lambda devolve. A variável `ALLOWED_ORIGIN` da Lambda só tem efeito se você não usar o CORS do API Gateway (por exemplo, numa REST API).

---

## Passo 8: Acompanhar o funcionamento

- **Logs da Lambda:** Lambda → `contador-acessos` → **Monitor** → **View CloudWatch logs**. Cada clique gera a linha `Novo total: N`.
- **Métricas da API:** API Gateway → `contador-acessos-api` → **Monitor** → **Metrics** (contagem de requisições, erros 4xx/5xx, latência).
- **Valor atual:** DynamoDB → `contador-acessos` → **Explore table items** → item `hits`.
- **Alerta de custo (recomendado):** **Billing and Cost Management** → **Budgets** → **Create budget** → modelo "Monthly cost budget" com um valor baixo (ex.: US$ 5) e seu e-mail.

---

## Custos estimados

Preços aproximados em `us-east-1`. Confira os valores atuais nas páginas de preço de cada serviço.

| Serviço | Preço aproximado | Custo por 1 milhão de cliques |
|---|---|---|
| API Gateway (HTTP API) | US$ 1,00 por milhão de requisições | ~US$ 1,00 |
| Lambda (arm64, 128 MB, ~50 ms) | US$ 0,20 por milhão + tempo de execução | ~US$ 0,30 |
| DynamoDB on-demand | US$ 0,625 por milhão de escritas | ~US$ 0,63 |

Cada visita à página também faz uma leitura (`GET`), que custa ainda menos. Sem tráfego, o custo é praticamente zero, porque nenhum desses serviços cobra por tempo parado. Parte desse consumo pode ser coberta pelo nível gratuito, dependendo do plano da conta.

> **Limite de escala do item único:** um único item no DynamoDB aguenta até cerca de 1.000 escritas por segundo. Para uma página "Em Breve" isso sobra. Se a campanha esperar picos maiores que isso, a técnica é dividir o contador em vários itens (`hits#0` a `hits#9`, por exemplo) e somar na leitura.

---

## Solução de problemas

| Sintoma | Causa provável | Como resolver |
|---|---|---|
| CloudFront responde `AccessDenied` na raiz do site | Falta o Default root object ou a bucket policy do OAC | Revise os itens 1 e 4 do C.3. |
| CloudFront mostra a versão antiga de um arquivo | Cache da distribuição | Crie uma invalidação `/*` (C.4). |
| No navegador (F12): `blocked by CORS policy` | CORS não configurado ou origem diferente da cadastrada | Revise o Passo 4.1 e o passo "Restringir o CORS". A origem não pode ter barra no final e precisa bater exatamente com `http`/`https` e porta. |
| API responde `{"message":"Internal Server Error"}` | Erro dentro da Lambda | Veja os logs no CloudWatch (Passo 8). |
| Log mostra `AccessDeniedException` | Política IAM com ARN errado ou não anexada à role | Confira região, Account ID e nome da tabela no JSON do Passo 2.1, e se a política está na role `contador-acessos-lambda-role`. |
| Log mostra `ResourceNotFoundException` | Tabela com outro nome ou em outra região | Confira a variável `TABLE_NAME` e se a Lambda e a tabela estão na mesma região. |
| Log mostra `KeyError: 'TABLE_NAME'` | Variável de ambiente ausente | Refaça o Passo 3.2. |
| API responde `{"message":"Not Found"}` | Rota ou URL incorreta | A URL deve terminar em `/hits`. Confira as rotas em **Develop** → **Routes**. |
| API responde `429 Too Many Requests` | Limite de throttling atingido | Esperado sob abuso. Se for tráfego legítimo, aumente os valores do Passo 4.2. |
| Contador não muda mais ao clicar | O navegador já registrou o clique | Use aba anônima ou `localStorage.clear()`. |

---

## Limpeza (para não deixar recursos ativos)

Apague nesta ordem quando não precisar mais do ambiente:

1. **API Gateway:** selecione `contador-acessos-api` → **Delete**.
2. **Lambda:** selecione `contador-acessos` → **Actions** → **Delete**.
3. **CloudWatch Logs:** **Log groups** → `/aws/lambda/contador-acessos` → **Delete**.
4. **IAM:** apague a role `contador-acessos-lambda-role` e depois a política `contador-acessos-dynamodb-policy`.
5. **DynamoDB:** tabela `contador-acessos` → **Delete** (apaga o histórico do contador).
6. **Site:**
   - Opção A: no S3, **Empty** e depois **Delete** no bucket.
   - Opção B: no Amplify, **App settings** → **General settings** → **Delete app**.
   - Opção C: no CloudFront, selecione a distribuição → **Disable** e aguarde terminar. Se ela estiver no plano Free, o console pode pedir para cancelar o plano antes. Depois clique em **Delete**. Em seguida, no S3, **Empty** e **Delete** no bucket `contador-acessos-cf-<algo-único>`. A OAC que sobrar fica em CloudFront → **Origin access** e também pode ser apagada.
7. **Budgets:** apague o orçamento, se tiver criado só para este teste.
