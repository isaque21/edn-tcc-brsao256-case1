"""
Contador de acessos - AWS Lambda (Python)

Rotas (API Gateway HTTP API, payload 2.0):
  GET  /hits -> retorna o total atual
  POST /hits -> soma +1 de forma atômica e retorna o novo total

Variáveis de ambiente:
  TABLE_NAME      (obrigatória) nome da tabela DynamoDB
  COUNTER_ID      (opcional)    valor da partition key. Padrão: "hits"
  ALLOWED_ORIGIN  (opcional)    origem liberada no CORS. Padrão: "*"
"""

import json
import logging
import os

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TABLE_NAME = os.environ["TABLE_NAME"]
COUNTER_ID = os.environ.get("COUNTER_ID", "hits")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

# Criado fora do handler para ser reutilizado entre invocações (menor latência).
table = boto3.resource("dynamodb").Table(TABLE_NAME)


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        },
        "body": json.dumps(body),
    }


def _get_total():
    item = table.get_item(Key={"id": COUNTER_ID}).get("Item")
    return int(item["total"]) if item else 0


def _increment_total():
    # "ADD" é atômico: requisições simultâneas não perdem contagem.
    # Se o item ainda não existir, o DynamoDB cria com total = 1.
    # "total" é usado no lugar de "count", que é palavra reservada no DynamoDB.
    result = table.update_item(
        Key={"id": COUNTER_ID},
        UpdateExpression="ADD #total :inc",
        ExpressionAttributeNames={"#total": "total"},
        ExpressionAttributeValues={":inc": 1},
        ReturnValues="UPDATED_NEW",
    )
    return int(result["Attributes"]["total"])


def lambda_handler(event, context):
    method = (
        event.get("requestContext", {}).get("http", {}).get("method")  # HTTP API (v2)
        or event.get("httpMethod")  # REST API (v1), caso use essa opção
    )

    try:
        if method == "GET":
            return _response(200, {"total": _get_total()})

        if method == "POST":
            total = _increment_total()
            logger.info("Novo total: %s", total)
            return _response(200, {"total": total})

        return _response(405, {"message": "Método não permitido"})

    except ClientError as err:
        logger.error("Erro no DynamoDB: %s", err.response["Error"])
        return _response(500, {"message": "Erro interno"})
