/**
 * Configurações compartilhadas entre o web service (proxy.js) e o worker
 * (worker.js). Qualquer alteração aqui afeta ambos.
 */

export const SPTRANS_BASE_URL = 'https://api.olhovivo.sptrans.com.br/v2.1';

// Letreiros monitorados (sem o sufixo de tipo, ex.: "8082" de "8082-10")
export const LINE_CODES = ['8012', '8022', '8082', '8083', '8084', '8085', '8086', '177H', '701U', '702U', '809U', '7181', '7411', '7725'];

// TTL do cache de posições. Aumentado para 20s para reduzir a frequencia
// de chamadas a API SPTrans e diminuir o risco de banimento do IP.
export const POSITIONS_TTL_MS = 20000;

// A API Olho Vivo fica atrás de proteção Cloudflare. Requisições com
// User-Agent muito genérico (ex.: node-fetch) podem ser bloqueadas com
// HTTP 403 + página HTML. Usamos um conjunto mínimo de cabeçalhos de navegador.
export const SPTRANS_COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://api.olhovivo.sptrans.com.br/'
};

// Intervalo entre re-autenticações periódicas (15 min)
export const REAUTH_INTERVAL_MS = 15 * 60 * 1000;
