// Cole aqui a "Invoke URL" do API Gateway, SEM barra no final.
// Exemplo: "https://abc123xyz.execute-api.us-east-1.amazonaws.com"
//
// Se ficar vazio, a página roda em "modo demonstração" (contador salvo só no navegador),
// útil para ver o visual antes de criar a infraestrutura na AWS.
window.APP_CONFIG = {
  API_URL: "https://<api-id>.execute-api.<regiao>.amazonaws.com"
};
